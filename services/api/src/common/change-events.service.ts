import { Inject, Injectable, Optional } from "@nestjs/common";
import { Database, DRIZZLE } from "../db/database.module";
import { changeEvents } from "../db/schema";
import { ProductAnalytics, type ProductEvent } from "./product-analytics.service";

/** Change-log actions that are also product-analytics events. */
const PRODUCT_EVENTS: Record<string, ProductEvent> = {
  "workspace.create": "workspace_created",
  "page.create": "note_created",
  "canvas.create": "canvas_created",
  "project.create": "project_created",
  "notebook.create": "notebook_created",
  "share.grant": "item_shared",
  "share.invite": "item_shared",
};

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
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() private readonly analytics: ProductAnalytics | null = null,
  ) {}

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
    this.track(input);
    return row;
  }

  private track(input: RecordChangeInput) {
    if (!this.analytics?.enabled || !input.userId) return;
    // Shares record the shared item's kind in `after` (never the email or role are sent).
    const entity = input.entityType === "resource_share" ? (input.after as { kind?: string } | null)?.kind : input.entityType;
    const kind = entity === "page" ? "note" : entity;
    if (input.action.endsWith(".publish")) {
      void this.analytics.capture(input.userId, "item_published", { kind });
      return;
    }
    const event = PRODUCT_EVENTS[input.action];
    if (!event) return;
    void this.analytics.capture(
      input.userId,
      event,
      event === "item_shared" ? { kind, toNewPerson: input.action === "share.invite" } : {},
    );
  }
}
