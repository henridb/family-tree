import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  checkLoginRateLimit,
  startSession,
  verifyPassword,
} from "@/server/auth";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const loginRouter = createTRPCRouter({
  /** Reserve an attempt, verify the shared password and start a viewing session on success. */
  login: publicProcedure
    .input(z.string().min(1).max(1024))
    .mutation(async ({ ctx, input }) => {
      await checkLoginRateLimit();
      if (!(await verifyPassword(input))) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Mauvais mot de passe.",
        });
      }
      await startSession(ctx.session);
      return { authenticated: true };
    }),
});
