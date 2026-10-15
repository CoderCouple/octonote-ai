#!/usr/bin/env node
/**
 * Creates the Founding offer in Stripe: a 40%-off-forever coupon and the
 * promotion code customers type at Checkout (Checkout already shows the
 * "Add promotion code" field: billing.service.ts sets allow_promotion_codes).
 *
 *   set -a; . ./.env.hosted; set +a; node scripts/stripe-founder-code.mjs [--dry-run]
 *
 * Reads STRIPE_SECRET_KEY from the environment and never prints it. Safe to
 * re-run: it reuses the coupon and code if they already exist. Works on test
 * or live keys; run it once per mode.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../services/api/package.json", import.meta.url));
const Stripe = require("stripe");

const CODE = "FOUNDER";
const COUPON_ID = "founder-40-forever";
const PERCENT_OFF = 40;
const MAX_REDEMPTIONS = 100;
// End of Dec 31, 2026 (UTC).
const REDEEM_BY = Math.floor(Date.UTC(2026, 11, 31, 23, 59, 59) / 1000);

const dryRun = process.argv.includes("--dry-run");
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error(
    "STRIPE_SECRET_KEY is not set. Run: set -a; . ./.env.hosted; set +a; node scripts/stripe-founder-code.mjs",
  );
  process.exit(1);
}
const mode = key.includes("_live_") ? "LIVE" : "test";
const stripe = new Stripe(key);

console.log(`Stripe ${mode} mode${dryRun ? " (dry run: nothing is created)" : ""}`);

// 1. Coupon
let coupon = await stripe.coupons.retrieve(COUPON_ID).catch((e) => {
  if (e?.code === "resource_missing") return null;
  throw e;
});
if (coupon) {
  console.log(`coupon   ${coupon.id}: exists (${coupon.percent_off}% off, ${coupon.duration})`);
} else if (dryRun) {
  console.log(`coupon   ${COUPON_ID}: would create (${PERCENT_OFF}% off, forever)`);
} else {
  coupon = await stripe.coupons.create({
    id: COUPON_ID,
    name: "Founding member: 40% off forever",
    percent_off: PERCENT_OFF,
    duration: "forever",
    max_redemptions: MAX_REDEMPTIONS,
    redeem_by: REDEEM_BY,
  });
  console.log(`coupon   ${coupon.id}: created`);
}

// 2. Promotion code customers type
const existing = await stripe.promotionCodes.list({ code: CODE, limit: 1 });
const promo = existing.data[0];
if (promo) {
  console.log(
    `code     ${promo.code}: exists (${promo.active ? "active" : "INACTIVE"}, ${promo.times_redeemed} used)`,
  );
} else if (dryRun) {
  console.log(`code     ${CODE}: would create, first-time customers only`);
} else {
  const created = await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    code: CODE,
    max_redemptions: MAX_REDEMPTIONS,
    expires_at: REDEEM_BY,
    restrictions: { first_time_transaction: true },
  });
  console.log(`code     ${created.code}: created`);
}

console.log(
  `\nCustomers enter ${CODE} at Checkout: Pro $10/mo → $6/mo, $100/yr → $60/yr, forever.` +
    `\nLimit ${MAX_REDEMPTIONS} customers; expires Dec 31, 2026; first-time customers only.`,
);
