import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../db/database.module";
import { users } from "../db/schemas/users";
import type { AuthenticatedRequest } from "./supabase-auth.guard";

/**
 * Octonote staff only (users.is_admin), and only from a web session — never
 * a CLI token or a support session. Use after SupabaseAuthGuard. Non-admins get a plain 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user || req.user.cliTokenId || req.user.supportSessionId) throw new ForbiddenException("Admins only.");
    const [row] = await this.db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);
    if (!row?.isAdmin) throw new ForbiddenException("Admins only.");
    return true;
  }
}
