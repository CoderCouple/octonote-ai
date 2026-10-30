import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pages } from "./pages";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Edit requests made from the assistant-app card (ChatGPT, Claude): a reader
 * selects part of a note, writes what to change, and the assistant applies it.
 * Not people-to-people comments: the editor doesn't show these.
 *
 * `blockIds` are the top-level blocks the selection covers; `quote` is the
 * exact text selected. `seenHash` fingerprints those blocks when the assistant
 * read them, so an apply over blocks that changed since is refused.
 */
export const noteComments = pgTable(
  "note_comments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("cmt")),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockIds: jsonb("block_ids").$type<string[]>().notNull(),
    quote: text("quote").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    /** Why it failed or was declined, shown in the card. */
    reason: text("reason"),
    seenHash: text("seen_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (table) => ({
    pageIdx: index("note_comments_page_idx").on(table.pageId, table.createdAt),
    status: check(
      "note_comments_status",
      sql`${table.status} in ('pending', 'working', 'done', 'failed', 'declined', 'cancelled')`,
    ),
  }),
);
