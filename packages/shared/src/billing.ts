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
  /** Why it's Pro: a Stripe subscription, or the free student year. */
  source: "stripe" | "student" | null;
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
}

/** Kinds at or over their free limit — any one of these triggers the upgrade prompt. */
export function kindsAtLimit(b: Pick<BillingSummary, "usage" | "limits">): LimitedKind[] {
  if (!b.limits) return [];
  return (Object.keys(b.limits) as LimitedKind[]).filter((k) => b.usage[k] >= b.limits![k]);
}
