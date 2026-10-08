import { Inject, Injectable } from "@nestjs/common";
import { Database, DRIZZLE } from "../db/database.module";
import { changeEvents } from "../db/schema";

export interface RecordChangeInput {
  workspaceId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  patch?: unknown;
}

@Injectable()
export class ChangeEventsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(input: RecordChangeInput) {
    const [row] = await this.db
      .insert(changeEvents)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        before: (input.before as never) ?? null,
        after: (input.after as never) ?? null,
        patch: (input.patch as never) ?? null,
      })
      .returning();
    return row;
  }
}
