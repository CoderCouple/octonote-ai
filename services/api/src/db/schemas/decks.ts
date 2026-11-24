import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { generateId } from "@octonote/shared";
import { notebooks } from "./notebooks";
import { sharingColumns } from "./sharing-columns";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Presentations. `document` is a @octonote/slides deck (`{ version: 1,
 * slides }`); `source` records the note, project or notebook it was made
 * from, if any, so the app can offer "Update from source".
 */
export const decks = pgTable(
  "decks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("dck")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").references(() => notebooks.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    document: jsonb("document").notNull(),
    source: jsonb("source").$type<{ kind: "page" | "project" | "notebook"; id: string; split: "heading" | "divider" }>(),
    ...sharingColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index("decks_workspace_id_idx").on(table.workspaceId),
    notebookIdx: index("decks_notebook_id_idx").on(table.notebookId),
    createdByIdx: index("decks_created_by_user_id_idx").on(table.createdByUserId),
  }),
);
