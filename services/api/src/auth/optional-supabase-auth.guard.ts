import { supabaseUserFromToken } from "./supabase-token";
import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildIdFromUuid } from "@octonote/shared";
import { assertCliTokenScope } from "./cli-token-scope";
import { isCliToken, userForCliToken } from "./cli-token-user";
import { isSupportToken, userForSupportToken } from "./support-session-user";
import { recordActivity } from "./record-activity";
import { SUPABASE_CLIENT } from "./supabase.tokens";

export interface OptionalAuthRequest {
  user?: User & { id: string; supportSessionId?: string };
  headers: Record<string, string | undefined>;
  method?: string;
  url?: string;
}

/**
 * Never rejects. Attaches `req.user` when a valid bearer token is present,
 * otherwise leaves it undefined so PermissionsService treats the caller as
 * anonymous ("anyone with the link" viewer access only).
 */
@Injectable()
export class OptionalSupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) return true;
    // Outside the try: a support session's write must fail, not turn anonymous.
    if (isSupportToken(token)) {
      request.user = (await userForSupportToken(this.moduleRef, token, request)) ?? undefined;
      return true;
    }
    if (isCliToken(token)) {
      const user = await userForCliToken(this.moduleRef, token).catch(() => null);
      if (!user) return true;
      // Outside the try too: a clipper token is refused here, not treated as anonymous.
      assertCliTokenScope(user.cliTokenScope, request.method, request.url);
      request.user = user;
      recordActivity(this.moduleRef, user, request.headers);
      return true;
    }
    try {
      const user = await supabaseUserFromToken(this.supabase, token);
      if (user) {
        request.user = { ...user, id: buildIdFromUuid("usr", user.id) };
        recordActivity(this.moduleRef, request.user, request.headers);
      }
    } catch {
      // Treat as anonymous.
    }
    return true;
  }
}
