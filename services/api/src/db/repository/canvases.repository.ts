import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { canvases } from "../schemas/canvases";
import { projects } from "../schemas/projects";
import { users } from "../schemas/users";
import type { LinkAccess } from "../../model/sharing.model";
import { BaseRepository } from "./base.repository";
import { liveShareCount } from "./share-count";

export interface CanvasSummaryRow {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  notebookId: string | null;
  thumbnailUrl: string | null;
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
export class CanvasesRepository extends BaseRepository<typeof canvases> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, canvases);
  }

  /** Standalone canvases (not owned by a project), in or out of notebooks. */
  listStandalone(workspaceId: string): Promise<CanvasSummaryRow[]> {
    return this.listSummaries(
      and(eq(canvases.workspaceId, workspaceId), isNull(canvases.projectId))!,
    );
  }

  /** Every canvas incl. project-owned ones — feeds the notes `/canvas` picker. */
  listAllInWorkspace(workspaceId: string): Promise<CanvasSummaryRow[]> {
    return this.listSummaries(eq(canvases.workspaceId, workspaceId));
  }

  listByNotebook(notebookId: string): Promise<CanvasSummaryRow[]> {
    return this.listSummaries(eq(canvases.notebookId, notebookId));
  }

  async findActiveByProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(canvases)
      .where(and(eq(canvases.projectId, projectId), isNull(canvases.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async hasActiveInProject(projectId: string): Promise<boolean> {
    return (await this.findActiveByProject(projectId)) !== null;
  }

  async softDeleteById(id: string) {
    const rows = await this.db
      .update(canvases)
      .set({ deletedAt: new Date() })
      .where(eq(canvases.id, id))
      .returning();
    return rows[0] ?? null;
  }

  private async listSummaries(where: SQL): Promise<CanvasSummaryRow[]> {
    const rows = await this.db
      .select({
        id: canvases.id,
        title: canvases.title,
        projectId: canvases.projectId,
        projectName: projects.name,
        notebookId: canvases.notebookId,
        thumbnailUrl: canvases.thumbnailUrl,
        createdAt: canvases.createdAt,
        updatedAt: canvases.updatedAt,
        creatorId: users.id,
        creatorName: users.name,
        creatorEmail: users.email,
        linkAccess: canvases.linkAccess,
        publishedAt: canvases.publishedAt,
        sharedCount: liveShareCount("canvas", canvases),
      })
      .from(canvases)
      .leftJoin(projects, eq(canvases.projectId, projects.id))
      .leftJoin(users, eq(canvases.createdByUserId, users.id))
      .where(and(where, isNull(canvases.deletedAt)))
      .orderBy(desc(canvases.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.projectName,
      notebookId: r.notebookId,
      thumbnailUrl: r.thumbnailUrl,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
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
