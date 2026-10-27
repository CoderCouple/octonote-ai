import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
    sourceCheck: check("activity_days_source", sql`${table.source} in ('web', 'mobile', 'cli', 'mcp')`),
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

/**
 * Pro given by hand from the admin portal (support, partners, make-goods).
 * Each grant or extension is its own row; `endedAt` ends one early.
 */
export const proGrants = pgTable(
  "pro_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("pgr")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    months: integer("months").notNull(),
    proUntil: timestamp("pro_until", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("pro_grants_workspace_idx").on(table.workspaceId),
    monthsCheck: check("pro_grants_months", sql`${table.months} between 1 and 36`),
  }),
);

/**
 * Every change made from the admin portal: who, what, to which record, and
 * the details. Kept even if the admin's account is deleted.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("adm")),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Copied so the log still reads after the account is gone. */
    actorEmail: text("actor_email").notNull(),
    /** e.g. promo.create, promo.disable, grant.create, grant.end, subscription.cancel, student_domain.add */
    action: text("action").notNull(),
    targetKind: text("target_kind"),
    targetId: text("target_id"),
    /** What the target was, in words ("FOUNDER", "alice@example.com's workspace"). */
    targetLabel: text("target_label"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("admin_audit_created_at_idx").on(table.createdAt),
  }),
);
