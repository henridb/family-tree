import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import messages from "../../messages/fr.ts";

export type ErrorMessageKey = keyof typeof messages.errors;

/** Preserve tRPC codes and French fallback messages while identifying translatable feedback. */
export class UserFacingError extends TRPCError {
  readonly messageKey: ErrorMessageKey;

  constructor(code: TRPC_ERROR_CODE_KEY, messageKey: ErrorMessageKey) {
    super({ code, message: messages.errors[messageKey] });
    this.messageKey = messageKey;
  }
}
