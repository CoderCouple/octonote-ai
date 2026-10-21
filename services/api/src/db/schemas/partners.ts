import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { promoCodes } from "./promotions";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Creators and influencers who bring people to Octonote. Each has one unique
 * code (PRIYA): their link is octonote.ai/?ref=priya, and the same code can be
 * a promo code for their audience (`promo_code_id`). They earn
 * `commission_percent` of what the people they brought pay, for
 * `commission_months` after that person's first payment (null = for as long
 * as they pay).
 */
export const partners = pgTable(
  "partners",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("prt")),
    name: text("name").notNull(),
    /** Upper-case, same shape as promo codes; the link uses it lower-cased. */
    code: text("code").notNull().unique(),
    /** Where to send reports; lower-case. */
    email: text("email"),
    commissionPercent: integer("commission_percent").default(30).notNull(),
    commissionMonths: integer("commission_months").default(12),
    /** The discount for their audience, when they have one (same code). */
    promoCodeId: text("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    note: text("note"),
    /** Off: the link and code stop bringing in new people and new earnings. */
    enabled: boolean("enabled").default(true).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("partners_code_upper", sql`${t.code} = upper(${t.code}) and ${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'`),
    check("partners_commission_percent", sql`${t.commissionPercent} between 0 and 100`),
    check("partners_commission_months", sql`${t.commissionMonths} is null or ${t.commissionMonths} between 1 and 60`),
    check("partners_email_lower", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
  ],
);

/**
 * Who brought whom: one row per person, set once. The first partner wins:
 * their link before sign-up, or their code if the person had none.
 */
export const partnerReferrals = pgTable(
  "partner_referrals",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    /** link | code */
    via: text("via").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("partner_referrals_partner_idx").on(t.partnerId),
    check("partner_referrals_via", sql`${t.via} in ('link', 'code')`),
  ],
);

/**
 * A partner's share of one paid Stripe invoice, written by the webhook
 * (`invoice.paid`). The invoice id makes retries count once. Kept when the
 * workspace or person goes, so payout history stays whole.
 */
export const partnerCommissions = pgTable(
  "partner_commissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("pcm")),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    amountPaidCents: integer("amount_paid_cents").notNull(),
    currency: text("currency").default("usd").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    /** When the invoice was paid. */
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    /** When we paid the partner; null = still owed. */
    paidOutAt: timestamp("paid_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("partner_commissions_partner_idx").on(t.partnerId),
    index("partner_commissions_workspace_idx").on(t.workspaceId),
    check("partner_commissions_amounts", sql`${t.amountPaidCents} >= 0 and ${t.commissionCents} >= 0`),
  ],
);
