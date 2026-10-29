import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Named preset; the client maps it to a font stack. */
  notesFontFamily: text("notes_font_family").default("source-serif").notNull(),
  notesFontSize: text("notes_font_size").default("md").notNull(),
  notesLineHeight: text("notes_line_height").default("normal").notNull(),
  theme: text("theme").default("system").notNull(),
  /** Email me when someone shares something with me. Invites to non-users always send. */
  emailOnShare: boolean("email_on_share").default(true).notNull(),
  /** "Help improve Octonote": usage analytics (PostHog) for this person. On by default; Settings turns it off. */
  analytics: boolean("analytics").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
