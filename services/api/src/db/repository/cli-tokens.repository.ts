import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { cliTokens } from "../schemas/cli-tokens";
import { BaseRepository } from "./base.repository";

@Injectable()
export class CliTokensRepository extends BaseRepository<typeof cliTokens> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, cliTokens);
  }

  listForUser(userId: string) {
    return this.db
      .select()
      .from(cliTokens)
      .where(and(eq(cliTokens.userId, userId), isNull(cliTokens.revokedAt)))
      .orderBy(sql`${cliTokens.lastUsedAt} desc nulls last`, desc(cliTokens.createdAt));
  }

  /** Revokes tokens never used, optionally only those with one name and not `except`. */
  async revokeNeverUsed(userId: string, only: { name?: string; except?: string } = {}) {
    return this.db
      .update(cliTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(cliTokens.userId, userId),
          isNull(cliTokens.revokedAt),
          isNull(cliTokens.lastUsedAt),
          only.name ? eq(cliTokens.name, only.name) : undefined,
          only.except ? ne(cliTokens.id, only.except) : undefined,
        ),
      )
      .returning({ id: cliTokens.id });
  }

  /** Not revoked; expiry is checked by the caller so it can say "expired". */
  async findActiveByHash(tokenHash: string) {
    const rows = await this.db
      .select()
      .from(cliTokens)
      .where(and(eq(cliTokens.tokenHash, tokenHash), isNull(cliTokens.revokedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async recordUse(id: string) {
    await this.db.update(cliTokens).set({ lastUsedAt: new Date() }).where(eq(cliTokens.id, id));
  }

  async revoke(id: string) {
    const rows = await this.db
      .update(cliTokens)
      .set({ revokedAt: new Date() })
      .where(eq(cliTokens.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
