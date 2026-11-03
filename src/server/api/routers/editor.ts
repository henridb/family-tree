import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "@/env";
import {
  checkLoginRateLimit,
  startOwnerSession,
  verifyPassword,
} from "@/server/auth";
import {
  ownerProcedure,
  publicProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { familyStore } from "@/server/family-source";
import {
  FamilyStoreConflictError,
  FamilyStoreError,
} from "@/server/family-store";
import { parseFamilyDocument } from "@/lib/family-document";
import {
  FamilyProjectionError,
  projectFamilyDocument,
} from "@/lib/family-projection";

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/**
 * Translate editor failures into client-facing tRPC errors without exposing
 * stored family details.
 *
 * Preserve existing tRPC errors, distinguish conflicts, invalid data and
 * missing revisions, and report other failures as unconfirmed operations
 * requiring a reload.
 */
async function operation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof FamilyStoreConflictError)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "L’arbre a changé. Votre brouillon est conservé ; rechargez la version enregistrée avant de recommencer.",
      });
    if (error instanceof z.ZodError || error instanceof FamilyProjectionError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Le document ou la vue choisie est invalide. Vérifiez les personnes, les liens et la personne de départ.",
      });
    if (
      error instanceof FamilyStoreError &&
      error.code === "REVISION_NOT_FOUND"
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Cette version n’est plus conservée.",
      });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "L’opération n’a pas pu être confirmée. Rechargez la version enregistrée avant de réessayer.",
    });
  }
}

export const editorRouter = createTRPCRouter({
  /**
   * Reserve a login attempt, verify a separate owner password and start the
   * owner session.
   *
   * Reject disabled editing, incorrect credentials and reuse of the shared
   * viewing password.
   */
  login: publicProcedure
    .input(z.string().min(1).max(1024))
    .mutation(async ({ ctx, input }) => {
      if (!env.OWNER_PASSWORD_HASH)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "L’accès propriétaire n’est pas configuré.",
        });
      await checkLoginRateLimit();
      if (!(await verifyPassword(input, env.OWNER_PASSWORD_HASH)))
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Mauvais mot de passe propriétaire.",
        });
      if (await verifyPassword(input))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Le mot de passe propriétaire doit être différent du mot de passe partagé.",
        });
      await startOwnerSession(ctx.ownerSession);
      return { authenticated: true };
    }),
  /** Destroy only the authenticated owner's session, preserving any shared viewing session. */
  logout: ownerProcedure.mutation(({ ctx }) => {
    ctx.ownerSession.destroy();
    return { authenticated: false };
  }),
  /**
   * Return the owner's complete document and revision/title recovery choices
   * from one storage snapshot.
   */
  read: ownerProcedure.query(() =>
    operation(async () => {
      const snapshot = await familyStore().snapshot();
      return {
        document: snapshot.document,
        history: snapshot.history.map(({ revision, title }) => ({
          revision,
          title,
        })),
      };
    }),
  ),
  /**
   * Validate the owner's draft and selected viewer projection before saving
   * against the expected revision.
   */
  save: ownerProcedure
    .input(
      z.object({
        document: z.unknown(),
        expectedRevision: revision.nullable(),
      }),
    )
    .mutation(({ input }) =>
      operation(async () => {
        const document = parseFamilyDocument(input.document);
        projectFamilyDocument(document);
        return familyStore().save(document, input.expectedRevision);
      }),
    ),
  /**
   * Restore a retained revision as a new version after checking viewer
   * compatibility and the expected current revision.
   */
  restore: ownerProcedure
    .input(z.object({ revision, expectedRevision: revision }))
    .mutation(({ input }) =>
      operation(async () => {
        const store = familyStore();
        const previous = (await store.history()).find(
          ({ revision }) => revision === input.revision,
        );
        if (previous) projectFamilyDocument(previous);
        return store.restore(input.revision, input.expectedRevision);
      }),
    ),
});
