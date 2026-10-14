/**
 * Plans (decided 2026-10-12). Billing sits on the workspace: individuals and
 * creators upgrade their personal workspace; organisations (later: a per-member
 * Team plan) upgrade a shared one.
 *
 * Free: up to 10 notes, 10 canvases, 10 projects and 10 notebooks per
 * workspace, and one workspace you own. Pro: no limits.
 */
export type Plan = "free" | "pro";
export type BillingInterval = "month" | "year";
export type LimitedKind = "page" | "canvas" | "project" | "notebook";

export const FREE_LIMIT = 10;
export const FREE_LIMITS: Record<LimitedKind, number> = {
  page: FREE_LIMIT,
  canvas: FREE_LIMIT,
  project: FREE_LIMIT,
  notebook: FREE_LIMIT,
};
/** Workspaces you can own without any Pro workspace. */
export const FREE_OWNED_WORKSPACES = 1;

/** Students get Pro free for this long (whitelist of email endings lives in the DB). */
export const STUDENT_PRO_MONTHS = 12;

/**
 * Every suffix an email domain could match, most specific first:
 * "Sam@CS.MIT.EDU" → ["cs.mit.edu", "mit.edu", "edu"]. The API looks these
 * up in the student_email_suffixes table.
 */
export function emailDomainSuffixes(email: string): string[] {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const parts = domain.split(".").filter(Boolean);
  return parts.map((_, i) => parts.slice(i).join("."));
}

/** Pro prices in USD. */
export const PRO_PRICE: Record<BillingInterval, number> = { month: 10, year: 100 };

/** Error code the API returns (HTTP 402) when a free limit is hit. */
export const PLAN_LIMIT_CODE = "PLAN_LIMIT";

export interface BillingSummary {
  plan: Plan;
  /** Why it's Pro: a Stripe subscription, a free promo code, or the free student year. */
  source: "stripe" | "promo" | "student" | "grant" | null;
  /** Stripe status when there is a subscription: active, trialing, past_due, canceled… */
  status: string | null;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: Record<LimitedKind, number>;
  /** null on Pro (no limits). */
  limits: Record<LimitedKind, number> | null;
  /** Whether payments are set up on this server (Stripe keys present). */
  billingEnabled: boolean;
  /** Owners and admins can upgrade or manage billing. */
  canManage: boolean;
  /** The code behind a free Pro period, or the discount on the subscription. */
  promo: {
    code: string;
    kind: PromoKind;
    description: string;
    /** The discount still taken off future payments; null once it has run out (or for free codes). */
    discount: PromoDiscount | null;
  } | null;
  /** Pro list price per interval, in cents (before any discount). */
  prices: { month: number; year: number };
}

// --- Promo codes -------------------------------------------------------------

export type PromoKind = "percent_off" | "amount_off" | "free_pro";
export type PromoAudience = "founder" | "creator" | "student" | "partner" | "general";
export type PromoDuration = "once" | "repeating" | "forever";

export interface PromoDiscount {
  percentOff: number | null;
  amountOffCents: number | null;
}

/** A price in cents after a discount (never below zero). */
export function discountedCents(cents: number, d: PromoDiscount | null | undefined): number {
  if (!d) return cents;
  if (d.percentOff) return Math.round((cents * (100 - d.percentOff)) / 100);
  if (d.amountOffCents) return Math.max(0, cents - d.amountOffCents);
  return cents;
}

/** What a code does, in words: "40% off forever", "$5 off for 3 months", "Pro free for 6 months". */
export function describePromo(p: {
  kind: PromoKind;
  percentOff?: number | null;
  amountOffCents?: number | null;
  duration?: PromoDuration | null;
  durationMonths?: number | null;
  freeMonths?: number | null;
}): string {
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
  if (p.kind === "free_pro") return `Pro free for ${months(p.freeMonths ?? 0)}`;
  const off =
    p.kind === "percent_off"
      ? `${p.percentOff}% off`
      : `$${((p.amountOffCents ?? 0) / 100).toFixed((p.amountOffCents ?? 0) % 100 ? 2 : 0)} off`;
  if (p.duration === "forever") return `${off} forever`;
  if (p.duration === "repeating") return `${off} for ${months(p.durationMonths ?? 0)}`;
  return `${off} the first payment`;
}

/** Result of entering a code in Plan & billing. */
export type PromoApplyResult =
  | { kind: "free_pro"; code: string; description: string; proUntil: string }
  | { kind: "percent_off" | "amount_off"; code: string; description: string };

/** One invoice on the Billing page. */
export interface BillingInvoice {
  id: string;
  number: string | null;
  date: string;
  /** Cents. */
  total: number;
  currency: string;
  status: string | null;
  /** Stripe's hosted invoice page and PDF. */
  url: string | null;
  pdfUrl: string | null;
}

/** A code as the admin page shows it. */
export interface PromoCodeDto {
  id: string;
  code: string;
  kind: PromoKind;
  audience: PromoAudience;
  description: string;
  percentOff: number | null;
  amountOffCents: number | null;
  duration: PromoDuration | null;
  durationMonths: number | null;
  freeMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  enabled: boolean;
  assignedEmail: string | null;
  note: string | null;
  createdAt: string;
}

export interface PromoRedemptionDto {
  id: string;
  workspace: { id: string; name: string } | null;
  user: { id: string; name: string; email: string } | null;
  proUntil: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

/** Kinds at or over their free limit — any one of these triggers the upgrade prompt. */
export function kindsAtLimit(b: Pick<BillingSummary, "usage" | "limits">): LimitedKind[] {
  if (!b.limits) return [];
  return (Object.keys(b.limits) as LimitedKind[]).filter((k) => b.usage[k] >= b.limits![k]);
}
