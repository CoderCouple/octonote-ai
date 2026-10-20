import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * A workspace's paid plan, mirrored from Stripe by the billing webhook. No
 * row (or a non-active status) means the Free plan.
 */
export const workspaceBilling = pgTable("workspace_billing", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  plan: text("plan").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Stripe subscription status: active, trialing, past_due, canceled, … */
  status: text("status"),
  interval: text("interval"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Email endings that qualify for the free student year, without the leading
 * dot: "edu", "ac.uk", "edu.au", or a single school like "ox.ac.uk". A
 * domain matches when it equals a suffix or ends with "." + suffix. Add rows
 * (e.g. in Supabase Studio) to extend it — no deploy needed; set `enabled`
 * to false to retire one without losing the record.
 */
export const studentEmailSuffixes = pgTable("student_email_suffixes", {
  // DB-side default too: rows are mostly added by hand in SQL, where $defaultFn doesn't run.
  id: text("id")
    .primaryKey()
    .default(sql`('sfx_' || gen_random_uuid()::text)`)
    .$defaultFn(() => generateId("sfx")),
  suffix: text("suffix").notNull().unique(),
  /** Free-text note, e.g. "UK universities". */
  label: text("label"),
  enabled: boolean("enabled").default(true).notNull(),
  /** "hipo" for rows from the world university list (scripts/university-domains-sql.mjs), else "manual". */
  source: text("source").default("manual").notNull(),
  /** The school, when the ending is one school ("University of Oxford"). */
  university: text("university"),
  /** ISO 3166-1 alpha-2 ("GB"); null for endings that span countries, like "edu". */
  countryCode: text("country_code"),
  country: text("country"),
  /** State or province, when the list has it ("British Columbia"). */
  region: text("region"),
  website: text("website"),
  /** Who added it, when added through the app; null for rows added in SQL. */
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("student_email_suffixes_country_idx").on(t.countryCode),
  check("student_email_suffixes_country_code_check", sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  check("student_email_suffixes_source_check", sql`${t.source} in ('hipo', 'manual')`),
]);
