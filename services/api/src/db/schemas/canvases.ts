import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { generateId } from "@octonote/shared";
import { notebooks } from "./notebooks";
import { projects } from "./projects";
import { sharingColumns } from "./sharing-columns";
import { users } from "./users";
import { workspaces } from "./workspaces";

/** Canvases. Standalone (projectId null, optionally in a notebook) or owned by a project. */
export const canvases = pgTable(
  "canvases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("cnv")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").references(() => notebooks.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    /** Octodraw `CanvasDocument` (`{ version: 1, items }`); tldraw snapshots until converted. */
    document: jsonb("document").notNull(),
    /**
     * What `document` holds: "tldraw" (legacy store snapshot) or "octodraw".
     * Defaults to "tldraw" so rows written by an older API version are still
     * picked up by `db:convert-canvases`; new code always sets it explicitly.
     */
    documentFormat: text("document_format").default("tldraw").notNull(),
    /** The original tldraw snapshot, kept when a canvas is converted to octodraw. */
    documentTldraw: jsonb("document_tldraw"),
    thumbnailUrl: text("thumbnail_url"),
    settings: jsonb("settings").default(sql`'{}'::jsonb`).notNull(),
    ...sharingColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index("canvases_workspace_id_idx").on(table.workspaceId),
    projectIdx: index("canvases_project_id_idx").on(table.projectId),
    notebookIdx: index("canvases_notebook_id_idx").on(table.notebookId),
    createdByIdx: index("canvases_created_by_user_id_idx").on(table.createdByUserId),
    onePerProject: uniqueIndex("canvases_one_per_project_idx")
      .on(table.projectId)
      .where(sql`deleted_at IS NULL AND project_id IS NOT NULL`),
    projectXorNotebook: check(
      "canvases_project_xor_notebook",
      sql`${table.projectId} IS NULL OR ${table.notebookId} IS NULL`,
    ),
  }),
);
