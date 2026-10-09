import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { pages } from "../schemas/pages";
import { users } from "../schemas/users";
import type { LinkAccess } from "../../model/sharing.model";
import { BaseRepository } from "./base.repository";
import { liveShareCount } from "./share-count";

export interface PageSummaryRow {
  id: string;
  title: string;
  notebookId: string | null;
  contentMd: string;
  updatedAt: Date;
  createdAt: Date;
  creator: { id: string; name: string; email: string } | null;
  linkAccess: LinkAccess;
  /** ISO time it was published, or null. */
  publishedAt: string | null;
  /** Live per-person grants ("people with access"). */
  sharedCount: number;
}

@Injectable()
export class PagesRepository extends BaseRepository<typeof pages> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, pages);
  }

  /** Standalone notes (not owned by a project), in or out of notebooks. */
  listStandalone(workspaceId: string): Promise<PageSummaryRow[]> {
    return this.listSummaries(and(eq(pages.workspaceId, workspaceId), isNull(pages.projectId))!);
  }

  listByNotebook(notebookId: string): Promise<PageSummaryRow[]> {
    return this.listSummaries(eq(pages.notebookId, notebookId));
  }

  async findActiveByProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(pages)
      .where(and(eq(pages.projectId, projectId), isNull(pages.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** True if the project already has a non-deleted page (1:1 invariant). */
  async hasActiveInProject(projectId: string): Promise<boolean> {
    return (await this.findActiveByProject(projectId)) !== null;
  }

  async softDeleteById(id: string) {
    const rows = await this.db
      .update(pages)
      .set({ deletedAt: new Date() })
      .where(eq(pages.id, id))
      .returning();
    return rows[0] ?? null;
  }

  private async listSummaries(where: SQL): Promise<PageSummaryRow[]> {
    const rows = await this.db
      .select({
        id: pages.id,
        title: pages.title,
        notebookId: pages.notebookId,
        contentMd: pages.contentMd,
        updatedAt: pages.updatedAt,
        createdAt: pages.createdAt,
        creatorId: users.id,
        creatorName: users.name,
        creatorEmail: users.email,
        linkAccess: pages.linkAccess,
        publishedAt: pages.publishedAt,
        sharedCount: liveShareCount("page", pages),
      })
      .from(pages)
      .leftJoin(users, eq(pages.createdByUserId, users.id))
      .where(and(where, isNull(pages.deletedAt)))
      .orderBy(desc(pages.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      notebookId: r.notebookId,
      contentMd: r.contentMd,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      creator:
        r.creatorId && r.creatorName && r.creatorEmail
          ? { id: r.creatorId, name: r.creatorName, email: r.creatorEmail }
          : null,
      linkAccess: r.linkAccess,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      sharedCount: Number(r.sharedCount),
    }));
  }
}
