import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { generateId } from "@octonote/shared";
import { notebooks } from "./notebooks";
import { projects } from "./projects";
import { sharingColumns } from "./sharing-columns";
import { users } from "./users";
import { workspaces } from "./workspaces";

/** Notes. Standalone (projectId null, optionally in a notebook) or owned by a project. */
export const pages = pgTable(
  "pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("pag")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").references(() => notebooks.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    document: jsonb("document").notNull(),
    contentMd: text("content_md").default("").notNull(),
    settings: jsonb("settings").default(sql`'{}'::jsonb`).notNull(),
    ...sharingColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index("pages_workspace_id_idx").on(table.workspaceId),
    projectIdx: index("pages_project_id_idx").on(table.projectId),
    notebookIdx: index("pages_notebook_id_idx").on(table.notebookId),
    createdByIdx: index("pages_created_by_user_id_idx").on(table.createdByUserId),
    onePerProject: uniqueIndex("pages_one_per_project_idx")
      .on(table.projectId)
      .where(sql`deleted_at IS NULL AND project_id IS NOT NULL`),
    projectXorNotebook: check(
      "pages_project_xor_notebook",
      sql`${table.projectId} IS NULL OR ${table.notebookId} IS NULL`,
    ),
  }),
);
