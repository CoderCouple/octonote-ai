import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { generateId } from "@octonote/shared";
import { notebooks } from "./notebooks";
import { sharingColumns } from "./sharing-columns";
import { users } from "./users";
import { workspaces } from "./workspaces";

/** An eraser-style file: exactly one note (page) and one canvas, owned by the project. */
export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("prj")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").references(() => notebooks.id, { onDelete: "set null" }),
    // RESTRICT: a user can't be deleted while they still own content.
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    settings: jsonb("settings").default(sql`'{}'::jsonb`).notNull(),
    ...sharingColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index("projects_workspace_id_idx").on(table.workspaceId),
    notebookIdx: index("projects_notebook_id_idx").on(table.notebookId),
    createdByIdx: index("projects_created_by_user_id_idx").on(table.createdByUserId),
  }),
);
