import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { oauthClients, oauthGrants, oauthRequests, oauthTokens } from "../schemas/oauth";

type ClientInsert = typeof oauthClients.$inferInsert;
type RequestInsert = typeof oauthRequests.$inferInsert;

@Injectable()
export class OAuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findClient(id: string) {
    const rows = await this.db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async insertClient(values: ClientInsert) {
    return (await this.db.insert(oauthClients).values(values).returning())[0]!;
  }

  /** CIMD cache: insert or refresh the fetched document. */
  async upsertClient(values: ClientInsert & { id: string }) {
    const { id, ...rest } = values;
    return (
      await this.db
        .insert(oauthClients)
        .values(values)
        .onConflictDoUpdate({ target: oauthClients.id, set: rest })
        .returning()
    )[0]!;
  }

  async insertRequest(values: RequestInsert) {
    return (await this.db.insert(oauthRequests).values(values).returning())[0]!;
  }

  async findRequest(id: string) {
    const rows = await this.db.select().from(oauthRequests).where(eq(oauthRequests.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findRequestByCode(codeHash: string) {
    const rows = await this.db
      .select()
      .from(oauthRequests)
      .where(eq(oauthRequests.codeHash, codeHash))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateRequest(id: string, set: Partial<RequestInsert>) {
    return (await this.db.update(oauthRequests).set(set).where(eq(oauthRequests.id, id)).returning())[0] ?? null;
  }

  /** Marks the code spent; false if it already was (a replay). */
  async spendCode(id: string) {
    const rows = await this.db
      .update(oauthRequests)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthRequests.id, id), isNull(oauthRequests.usedAt)))
      .returning({ id: oauthRequests.id });
    return rows.length === 1;
  }

  async insertGrant(values: typeof oauthGrants.$inferInsert) {
    return (await this.db.insert(oauthGrants).values(values).returning())[0]!;
  }

  async findGrant(id: string) {
    const rows = await this.db.select().from(oauthGrants).where(eq(oauthGrants.id, id)).limit(1);
    return rows[0] ?? null;
  }

  listGrants(userId: string) {
    return this.db
      .select()
      .from(oauthGrants)
      .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
      .orderBy(desc(oauthGrants.createdAt));
  }

  async revokeGrant(id: string) {
    return (
      await this.db.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, id)).returning()
    )[0] ?? null;
  }

  async touchGrant(id: string) {
    await this.db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, id));
  }

  async insertToken(values: typeof oauthTokens.$inferInsert) {
    return (await this.db.insert(oauthTokens).values(values).returning())[0]!;
  }

  async findToken(tokenHash: string) {
    const rows = await this.db.select().from(oauthTokens).where(eq(oauthTokens.tokenHash, tokenHash)).limit(1);
    return rows[0] ?? null;
  }

  /** Marks a refresh token spent; false if it already was (reuse → theft). */
  async spendToken(id: string) {
    const rows = await this.db
      .update(oauthTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthTokens.id, id), isNull(oauthTokens.usedAt)))
      .returning({ id: oauthTokens.id });
    return rows.length === 1;
  }
}
