import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import { Forbidden } from "./error/error-factory";

/**
 * Some actions need a person in a browser, not a CLI token: minting more
 * tokens and deleting the account. A leaked token can then do no more than
 * its owner's normal editing — and can be revoked in Settings.
 */
export function requireWebSession(req: AuthenticatedRequest, action: string) {
  if (req.user.cliTokenId || req.user.supportSessionId) {
    throw Forbidden(`${action} needs you signed in on the web, not a CLI token.`, {
      code: "WEB_SESSION_REQUIRED",
    });
  }
}
