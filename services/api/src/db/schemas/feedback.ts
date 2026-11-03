import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Bug reports and feature requests, kept so the team can work through them.
 * Email, workspace name and plan are copied as they were when it was sent.
 * Goes with the account when the person deletes it; the screenshot is an object
 * in the private `feedback-screenshots` bucket, removed by AccountService.
 */
export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("fbk")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    workspaceName: text("workspace_name"),
    plan: text("plan"),
    kind: text("kind").notNull(),
    status: text("status").default("new").notNull(),
    message: text("message").notNull(),
    teamNote: text("team_note"),
    screenshotPath: text("screenshot_path"),
    platform: text("platform"),
    appVersion: text("app_version"),
    system: text("system"),
    device: text("device"),
    screen: text("screen"),
    page: text("page"),
    timeZone: text("time_zone"),
    /** Approximate, from the connection. The IP address itself is never stored. */
    city: text("city"),
    region: text("region"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    kindCheck: check("feedback_items_kind", sql`${table.kind} in ('bug', 'feature')`),
    statusCheck: check("feedback_items_status", sql`${table.status} in ('new', 'planned', 'done', 'wont_do')`),
    createdIdx: index("feedback_items_created_idx").on(table.createdAt),
    userIdx: index("feedback_items_user_idx").on(table.userId, table.createdAt),
  }),
);
