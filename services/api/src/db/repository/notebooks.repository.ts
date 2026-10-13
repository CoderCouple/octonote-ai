import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { canvases } from "../schemas/canvases";
import { notebooks } from "../schemas/notebooks";
import { pages } from "../schemas/pages";
import { projects } from "../schemas/projects";
import { BaseRepository } from "./base.repository";
import { liveShareCount } from "./share-count";

@Injectable()
export class NotebooksRepository extends BaseRepository<typeof notebooks> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, notebooks);
  }

  listByWorkspace(workspaceId: string) {
    return this.db
      .select({
        ...getTableColumns(notebooks),
        sharedCount: liveShareCount("notebook", notebooks),
        // What's inside, for grid cards ("5 notes · 3 canvases"). The outer
        // id is qualified by hand, as in liveShareCount.
        noteCount: sql<number>`(select count(*)::int from ${pages} where ${pages.notebookId} = "notebooks"."id" and ${pages.deletedAt} is null)`,
        canvasCount: sql<number>`(select count(*)::int from ${canvases} where ${canvases.notebookId} = "notebooks"."id" and ${canvases.deletedAt} is null)`,
        projectCount: sql<number>`(select count(*)::int from ${projects} where ${projects.notebookId} = "notebooks"."id" and ${projects.archivedAt} is null)`,
      })
      .from(notebooks)
      .where(eq(notebooks.workspaceId, workspaceId))
      .orderBy(desc(notebooks.updatedAt));
  }

  /** Children are released to the top level by ON DELETE SET NULL. */
  async hardDeleteById(id: string) {
    const rows = await this.db.delete(notebooks).where(eq(notebooks.id, id)).returning();
    return rows[0] ?? null;
  }
}
