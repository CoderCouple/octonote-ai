import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { changeEvents } from "../schemas/audit";
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
}
