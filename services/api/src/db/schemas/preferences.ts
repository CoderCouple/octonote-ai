import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Named preset; the client maps it to a font stack. */
  notesFontFamily: text("notes_font_family").default("inter").notNull(),
  notesFontSize: text("notes_font_size").default("md").notNull(),
  notesLineHeight: text("notes_line_height").default("normal").notNull(),
  theme: text("theme").default("system").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
