import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildIdFromUuid } from "@octonote/shared";
import { isCliToken, userForCliToken } from "./cli-token-user";
import { isSupportToken, userForSupportToken } from "./support-session-user";
import { recordActivity } from "./record-activity";
import { SUPABASE_CLIENT } from "./supabase.tokens";

export interface AuthenticatedRequest {
  /**
   * `cliTokenId` is set when the caller used an `ont_…` CLI token;
   * `supportSessionId` when staff are viewing the account (read-only).
   */
  user: User & { id: string; cliTokenId?: string; supportSessionId?: string; supportAdminId?: string };
  headers: Record<string, string | undefined>;
  method?: string;
  url?: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    if (isSupportToken(token)) {
      const user = await userForSupportToken(this.moduleRef, token, request);
      if (!user) throw new UnauthorizedException("Support session ended or expired.");
      request.user = user;
      return true;
    }

    if (isCliToken(token)) {
      const user = await userForCliToken(this.moduleRef, token);
      if (!user) throw new UnauthorizedException("Invalid or revoked CLI token.");
      request.user = user;
      recordActivity(this.moduleRef, user, request.headers);
      return true;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException("Invalid Supabase session.");
    }

    // Downstream code always sees the prefixed `usr_<uuid>` form.
    request.user = { ...data.user, id: buildIdFromUuid("usr", data.user.id) };
    recordActivity(this.moduleRef, request.user, request.headers);
    return true;
  }
}
