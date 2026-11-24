import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { decks } from "../schemas/decks";
import { users } from "../schemas/users";
import type { LinkAccess } from "../../model/sharing.model";
import { BaseRepository } from "./base.repository";
import { liveShareCount } from "./share-count";

// jsonb_array_length errors on a non-array; a malformed document counts as 0.
const sqlSlideCount = sql<number>`(case when jsonb_typeof(${decks.document} -> 'slides') = 'array' then jsonb_array_length(${decks.document} -> 'slides') else 0 end)`;

export interface DeckSummaryRow {
  id: string;
  title: string;
  notebookId: string | null;
  /** How many slides it has (hidden ones included). */
  slideCount: number;
  createdAt: Date;
  updatedAt: Date;
  creator: { id: string; name: string; email: string } | null;
  linkAccess: LinkAccess;
  /** ISO time it was published, or null. */
  publishedAt: string | null;
  /** Live per-person grants ("people with access"). */
  sharedCount: number;
}

@Injectable()
export class DecksRepository extends BaseRepository<typeof decks> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, decks);
  }

  listInWorkspace(workspaceId: string): Promise<DeckSummaryRow[]> {
    return this.listSummaries(eq(decks.workspaceId, workspaceId));
  }

  listByNotebook(notebookId: string): Promise<DeckSummaryRow[]> {
    return this.listSummaries(eq(decks.notebookId, notebookId));
  }

  async findActiveById(id: string) {
    const [row] = await this.db
      .select()
      .from(decks)
      .where(and(eq(decks.id, id), isNull(decks.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async softDeleteById(id: string) {
    const [row] = await this.db.update(decks).set({ deletedAt: new Date() }).where(eq(decks.id, id)).returning();
    return row ?? null;
  }

  private async listSummaries(where: SQL): Promise<DeckSummaryRow[]> {
    const rows = await this.db
      .select({
        id: decks.id,
        title: decks.title,
        notebookId: decks.notebookId,
        // Counted in the database: lists never load whole decks.
        slideCount: sqlSlideCount,
        createdAt: decks.createdAt,
        updatedAt: decks.updatedAt,
        creatorId: users.id,
        creatorName: users.name,
        creatorEmail: users.email,
        linkAccess: decks.linkAccess,
        publishedAt: decks.publishedAt,
        sharedCount: liveShareCount("deck", decks),
      })
      .from(decks)
      .leftJoin(users, eq(decks.createdByUserId, users.id))
      .where(and(where, isNull(decks.deletedAt)))
      .orderBy(desc(decks.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      notebookId: r.notebookId,
      slideCount: Number(r.slideCount) || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      creator: r.creatorId && r.creatorName && r.creatorEmail ? { id: r.creatorId, name: r.creatorName, email: r.creatorEmail } : null,
      linkAccess: r.linkAccess,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      sharedCount: Number(r.sharedCount),
    }));
  }
}
