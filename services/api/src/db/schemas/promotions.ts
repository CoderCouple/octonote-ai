import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Promo codes, created on the admin page. Three kinds:
 *   percent_off / amount_off — a discount on Pro: Octonote checks the code,
 *     then applies its Stripe coupon (created with it) at Checkout;
 *   free_pro — Pro for `free_months`, granted by Octonote, no card needed.
 * Codes are stored upper-case and matched case-insensitively. They're never
 * deleted — switch `enabled` off — so redemptions keep their history. The
 * CHECK constraints keep each kind's fields consistent even for rows edited
 * by hand in Supabase Studio. (They use coalesce(…, false): in SQL a check on
 * an empty field is "unknown", which Postgres would otherwise let through.)
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: text("id")
      .primaryKey()
      .default(sql`('pmc_' || gen_random_uuid()::text)`)
      .$defaultFn(() => generateId("pmc")),
    code: text("code").notNull().unique(),
    kind: text("kind").notNull(),
    /** founder | creator | student | partner | general — for reporting. */
    audience: text("audience").default("general").notNull(),
    percentOff: integer("percent_off"),
    amountOffCents: integer("amount_off_cents"),
    currency: text("currency").default("usd").notNull(),
    /** Discounts: once | repeating (for `duration_months`) | forever. */
    duration: text("duration"),
    durationMonths: integer("duration_months"),
    /** free_pro: how many months of Pro a redemption grants. */
    freeMonths: integer("free_months"),
    /** null = unlimited. */
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true).notNull(),
    /** A personal code: only this (lower-case) email can use it. */
    assignedEmail: text("assigned_email"),
    note: text("note"),
    stripeCouponId: text("stripe_coupon_id"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeUpper: check("promo_codes_code_upper", sql`${t.code} = upper(${t.code}) and ${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'`),
    kind: check("promo_codes_kind", sql`${t.kind} in ('percent_off', 'amount_off', 'free_pro')`),
    audience: check(
      "promo_codes_audience",
      sql`${t.audience} in ('founder', 'creator', 'student', 'partner', 'general')`,
    ),
    shape: check(
      "promo_codes_shape",
      sql`(
        (${t.kind} = 'percent_off' and coalesce(${t.percentOff} between 1 and 100, false) and ${t.amountOffCents} is null and ${t.freeMonths} is null and ${t.duration} is not null)
        or (${t.kind} = 'amount_off' and coalesce(${t.amountOffCents} > 0, false) and ${t.percentOff} is null and ${t.freeMonths} is null and ${t.duration} is not null)
        or (${t.kind} = 'free_pro' and coalesce(${t.freeMonths} between 1 and 36, false) and ${t.percentOff} is null and ${t.amountOffCents} is null and ${t.duration} is null)
      )`,
    ),
    duration: check(
      "promo_codes_duration",
      sql`(${t.duration} is null and ${t.durationMonths} is null)
        or (${t.duration} in ('once', 'forever') and ${t.durationMonths} is null)
        or (${t.duration} = 'repeating' and coalesce(${t.durationMonths} between 1 and 36, false))`,
    ),
    uses: check(
      "promo_codes_uses",
      sql`${t.redemptionCount} >= 0 and (${t.maxRedemptions} is null or (${t.maxRedemptions} > 0 and ${t.redemptionCount} <= ${t.maxRedemptions}))`,
    ),
    email: check("promo_codes_email_lower", sql`${t.assignedEmail} is null or ${t.assignedEmail} = lower(${t.assignedEmail})`),
  }),
);

/**
 * One row per use of a code by a workspace. Free codes are recorded when
 * redeemed (with `pro_until`); discounts when Stripe Checkout completes (with
 * the subscription). A workspace can use a code once, and one free code ever.
 */
export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("pmr")),
    promoCodeId: text("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Who redeemed it; kept null if they delete their account. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Copied from the code, so the one-free-code rule can be a unique index. */
    kind: text("kind").notNull(),
    proUntil: timestamp("pro_until", { withTimezone: true }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oncePerWorkspace: uniqueIndex("promo_redemptions_code_workspace_idx").on(t.promoCodeId, t.workspaceId),
    oneFreeCode: uniqueIndex("promo_redemptions_one_free_idx")
      .on(t.workspaceId)
      .where(sql`${t.kind} = 'free_pro'`),
    byWorkspace: index("promo_redemptions_workspace_idx").on(t.workspaceId),
    kind: check("promo_redemptions_kind", sql`${t.kind} in ('percent_off', 'amount_off', 'free_pro')`),
    freeHasEnd: check(
      "promo_redemptions_free_has_end",
      sql`(${t.kind} = 'free_pro') = (${t.proUntil} is not null)`,
    ),
  }),
);
