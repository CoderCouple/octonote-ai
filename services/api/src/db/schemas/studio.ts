import { generateId } from "@octonote/shared";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Studio items: one interactive block (infographic, mind map, flashcards,
 * quiz, practice, matching or a summary) the AI made from a source. Private to
 * the person who made it until they publish it (`published_at`), which makes
 * it readable by anyone with the link.
 */
export const studioItems = pgTable(
  "studio_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("stu")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("running"),
    /** The block's JSON, without `kind`; null until it succeeds. */
    spec: jsonb("spec").$type<Record<string, unknown>>(),
    error: text("error"),
    sourceType: text("source_type").notNull(),
    /** What the person sees for the source: a page title, URL host, note title or file name. */
    sourceLabel: text("source_label").notNull(),
    /** The URL or note id it came from, if any. */
    sourceRef: text("source_ref"),
    /** The text the AI read (already cut to the Studio limit). */
    sourceText: text("source_text").notNull(),
    durationMs: integer("duration_ms"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("studio_items_user_idx").on(t.userId, t.workspaceId, t.updatedAt),
  ],
);

export type StudioItemRow = typeof studioItems.$inferSelect;
