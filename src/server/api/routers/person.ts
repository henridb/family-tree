import { UserFacingError } from "@/server/user-facing-error";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { projectFamilyDocument } from "@/lib/family-projection";
import { readFamilyDocument } from "@/server/family-source";

export const personRouter = createTRPCRouter({
  /**
   * Return the authenticated viewer's selected descendant tree, or null if no
   * root is selected.
   *
   * Report an uninitialized store separately; hide private validation and
   * storage details behind a generic availability error.
   */
  getTree: protectedProcedure.query(async () => {
    try {
      const document = await readFamilyDocument();
      if (document === null)
        throw new UserFacingError("PRECONDITION_FAILED", "treeNotConfigured");
      return projectFamilyDocument(document);
    } catch (cause) {
      if (cause instanceof TRPCError) throw cause;
      // Stored validation errors may contain private fields: keep them off the wire.
      throw new UserFacingError("SERVICE_UNAVAILABLE", "treeUnavailable");
    }
  }),
});
