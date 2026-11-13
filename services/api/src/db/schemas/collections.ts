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
 * Research collections: named containers of clips (passages kept from
 * ChatGPT, Claude, Gemini or anywhere else) that a note can later be written
 * from, strictly from those clips. Private to the person who made them.
 */
export const collections = pgTable(
  "collections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("clc")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("collections_user_idx").on(t.userId, t.workspaceId, t.updatedAt),
  ],
);

/** Where a clip came from, so a note can cite it. */
export interface ClipSource {
  app: "chatgpt" | "claude" | "gemini" | "octonote" | "web" | "other";
  url?: string;
  title?: string;
}

export const clips = pgTable(
  "clips",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("clp")),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    /** The clipped text as Markdown (tables, code and maths kept). */
    content: text("content").notNull(),
    source: jsonb("source").$type<ClipSource>().notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("clips_collection_idx").on(t.collectionId, t.position)],
);

export type Collection = typeof collections.$inferSelect;
export type Clip = typeof clips.$inferSelect;
