import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Who used Octonote on which day, and from where — the base of daily /
 * weekly / monthly active users on the admin dashboard. One row per user,
 * UTC day and source; nothing about what they did.
 */
export const activityDays = pgTable(
  "activity_days",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    /** web | mobile | cli */
    source: text("source").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.day, table.source] }),
    dayIdx: index("activity_days_day_idx").on(table.day),
    sourceCheck: check("activity_days_source", sql`${table.source} in ('web', 'mobile', 'cli')`),
  }),
);

/**
 * Subscription history, derived from the Stripe webhook: what changed and
 * when. `workspace_billing` holds only the current state; this keeps the
 * story (new subscriptions, cancellations, failed payments) for the
 * revenue dashboard.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("bev")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** started | cancel_scheduled | resumed | ended | interval_changed | past_due | payment_failed */
    kind: text("kind").notNull(),
    interval: text("interval"),
    /** Money involved, when there is one (a failed payment's amount). */
    amountCents: integer("amount_cents"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Set for events that come straight from one Stripe event, so retries count once. */
    stripeEventId: text("stripe_event_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("billing_events_created_at_idx").on(table.createdAt),
    workspaceIdx: index("billing_events_workspace_idx").on(table.workspaceId),
    kindCheck: check(
      "billing_events_kind",
      sql`${table.kind} in ('started', 'cancel_scheduled', 'resumed', 'ended', 'interval_changed', 'past_due', 'payment_failed')`,
    ),
  }),
);
