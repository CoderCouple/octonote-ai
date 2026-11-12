import { generateId } from "@octonote/shared";
import { index, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Manim explainer videos made for notes (@octonote/manim). A job row: it moves
 * queued → storyboard → code → render → join → done (or failed), with progress
 * the note block polls. The MP4 and poster are objects in the public
 * `note-videos` bucket under an unguessable path, like note images.
 */
export const videos = pgTable(
  "videos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("vid")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    concept: text("concept").notNull(),
    orientation: text("orientation").notNull().default("landscape"),
    status: text("status").notNull().default("queued"),
    progress: jsonb("progress"),
    title: text("title"),
    chapters: jsonb("chapters"),
    videoPath: text("video_path"),
    posterPath: text("poster_path"),
    durationSeconds: real("duration_seconds"),
    bytes: integer("bytes"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("videos_created_by_idx").on(t.createdByUserId, t.createdAt)],
);
