import { ForbiddenException } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import type { User } from "@supabase/supabase-js";
import { isSupportToken, SupportAccessService } from "../service/support-access.service";

export { isSupportToken };

export type SupportUser = User & { id: string; supportSessionId: string; supportAdminId: string };

/** Reads only. The one write allowed is the tab's own Exit. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXIT = { method: "DELETE", path: "/support-session" };

/**
 * The request user for an `ons_…` support token: the person being helped,
 * shaped like a Supabase user (as CLI tokens are). Throws 403 for anything
 * but a read, and records each request against the session. Activity is not
 * recorded: support looking around isn't the person using Octonote.
 */
export async function userForSupportToken(
  moduleRef: ModuleRef,
  token: string,
  request: { method?: string; url?: string },
): Promise<SupportUser | null> {
  const support = moduleRef.get(SupportAccessService, { strict: false });
  const found = await support.verify(token);
  if (!found) return null;
  const method = (request.method ?? "GET").toUpperCase();
  const path = (request.url ?? "").split("?")[0] ?? "";
  if (!READ_METHODS.has(method) && !(method === EXIT.method && path === EXIT.path)) {
    throw new ForbiddenException({
      message: "Support access is read-only.",
      code: "SUPPORT_READ_ONLY",
    });
  }
  support.logRequest(found.session.id, method, request.url ?? "");
  const { user, session } = found;
  return {
    id: user.id,
    email: user.email,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: { name: user.name },
    created_at: user.createdAt.toISOString(),
    supportSessionId: session.id,
    supportAdminId: session.adminUserId,
  } as SupportUser;
}
