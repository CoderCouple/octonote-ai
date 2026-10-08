import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildIdFromUuid } from "@octonote/shared";
import { SUPABASE_CLIENT } from "./supabase.tokens";

export interface OptionalAuthRequest {
  user?: User & { id: string };
  headers: Record<string, string | undefined>;
}

/**
 * Never rejects. Attaches `req.user` when a valid bearer token is present,
 * otherwise leaves it undefined so PermissionsService treats the caller as
 * anonymous ("anyone with the link" viewer access only).
 */
@Injectable()
export class OptionalSupabaseAuthGuard implements CanActivate {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) return true;
    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      if (!error && data.user) {
        request.user = { ...data.user, id: buildIdFromUuid("usr", data.user.id) };
      }
    } catch {
      // Treat as anonymous.
    }
    return true;
  }
}
