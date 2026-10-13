import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
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
      .orderBy(desc(cliTokens.createdAt));
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
