import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateId } from "@octonote/shared";
import { sharingColumns } from "./sharing-columns";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Folder-like collection of standalone notes, standalone canvases and
 * projects. Hard-deleted; children reference it with ON DELETE SET NULL so
 * deleting a notebook moves its items back to the top level.
 */
export const notebooks = pgTable(
  "notebooks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("ntb")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    icon: text("icon"),
    ...sharingColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("notebooks_workspace_id_idx").on(table.workspaceId),
  }),
);
