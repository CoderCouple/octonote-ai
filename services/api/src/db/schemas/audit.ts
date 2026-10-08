import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateId } from "@octonote/shared";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const changeEvents = pgTable(
  "change_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("evt")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    patch: jsonb("patch"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceCreatedIdx: index("change_events_workspace_id_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    entityIdx: index("change_events_entity_idx").on(table.entityType, table.entityId),
    userCreatedIdx: index("change_events_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
