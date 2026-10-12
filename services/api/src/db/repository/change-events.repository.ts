import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { changeEvents } from "../schemas/audit";
import { canvases } from "../schemas/canvases";
import { pages } from "../schemas/pages";
import { projects } from "../schemas/projects";
import { BaseRepository } from "./base.repository";

@Injectable()
export class ChangeEventsRepository extends BaseRepository<typeof changeEvents> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, changeEvents);
  }

  async listByWorkspace(
    workspaceId: string,
    options: { limit: number; entityType?: string; entityId?: string },
  ) {
    const filters: SQL[] = [eq(changeEvents.workspaceId, workspaceId)];
    if (options.entityType) filters.push(eq(changeEvents.entityType, options.entityType));
    if (options.entityId) filters.push(eq(changeEvents.entityId, options.entityId));
    return this.db
      .select()
      .from(changeEvents)
      .where(and(...filters))
      .orderBy(desc(changeEvents.createdAt))
      .limit(options.limit);
  }

  /**
   * The last time `userId` changed each note, canvas, project or notebook in
   * the workspace, with where the item lives (its project, its notebook — or
   * its project's notebook) so callers can roll edits up to the container.
   */
  async lastEditsByUser(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({
        entityType: changeEvents.entityType,
        entityId: changeEvents.entityId,
        at: sql<string>`max(${changeEvents.createdAt})`,
        projectId: projects.id,
        notebookId: sql<
          string | null
        >`coalesce(${pages.notebookId}, ${canvases.notebookId}, ${projects.notebookId})`,
      })
      .from(changeEvents)
      .leftJoin(
        pages,
        and(
          eq(changeEvents.entityType, "page"),
          eq(pages.id, changeEvents.entityId),
          isNull(pages.deletedAt),
        ),
      )
      .leftJoin(
        canvases,
        and(
          eq(changeEvents.entityType, "canvas"),
          eq(canvases.id, changeEvents.entityId),
          isNull(canvases.deletedAt),
        ),
      )
      .leftJoin(
        projects,
        sql`${projects.id} = coalesce(${pages.projectId}, ${canvases.projectId}, case when ${changeEvents.entityType} = 'project' then ${changeEvents.entityId} end)`,
      )
      .where(
        and(
          eq(changeEvents.workspaceId, workspaceId),
          eq(changeEvents.userId, userId),
          inArray(changeEvents.entityType, ["page", "canvas", "project", "notebook"]),
        ),
      )
      .groupBy(
        changeEvents.entityType,
        changeEvents.entityId,
        projects.id,
        pages.notebookId,
        canvases.notebookId,
        projects.notebookId,
      );
    return rows.map((r) => ({ ...r, at: new Date(r.at) }));
  }
}
