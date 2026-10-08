import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { notebooks } from "../schemas/notebooks";
import { BaseRepository } from "./base.repository";

@Injectable()
export class NotebooksRepository extends BaseRepository<typeof notebooks> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, notebooks);
  }

  listByWorkspace(workspaceId: string) {
    return this.db
      .select()
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
