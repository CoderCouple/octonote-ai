/**
 * The admin dashboard's numbers (GET /admin/metrics?days=N). Everything comes
 * from Octonote's own database: no third-party analytics. "In range" means
 * the last `days` UTC days, today included.
 */

export const ADMIN_METRIC_RANGES = [7, 30, 90] as const;
export type AdminMetricRange = (typeof ADMIN_METRIC_RANGES)[number];

export type ItemKind = "note" | "canvas" | "project" | "notebook";

export interface AdminMetrics {
  days: number;
  generatedAt: string;
  growth: {
    users: number;
    workspaces: number;
    /** Sign-ups in range, and in the range before it (for the change). */
    signups: number;
    signupsBefore: number;
    /** Distinct active users today, in the last 7 days, in the last 30 days. */
    active: { day: number; week: number; month: number };
    /** Distinct active users in range per app. */
    bySource: { web: number; mobile: number; cli: number };
    series: { day: string; signups: number; active: number }[];
    /**
     * People who signed up in range (and at least 7 days ago) and came back
     * on any of the 7 days after signing up.
     */
    weekOneReturn: { cohort: number; returned: number };
  };
  revenue: {
    /** Monthly recurring revenue after discounts, in cents (yearly plans ÷ 12). */
    mrrCents: number;
    paying: number;
    monthly: number;
    yearly: number;
    /** Paying, but set to end at the period's end. */
    cancelScheduled: number;
    pastDue: number;
    /** In range. */
    started: number;
    ended: number;
    paymentFailures: number;
    /** All workspaces vs the ones paying now. */
    conversion: { workspaces: number; paying: number };
    series: { day: string; started: number; ended: number }[];
  };
  codes: {
    /** Code uses in range. */
    redemptions: number;
    /** Workspaces on Pro through a free code right now. */
    freeActive: number;
    /** Students on the free year right now. */
    studentsActive: number;
    /** Workspaces that used a free code, and how many of them pay now. */
    freeToPaid: { redeemed: number; nowPaying: number };
    /** Monthly revenue given up to discounts on current subscriptions, in cents. */
    discountMonthlyCents: number;
    byAudience: { audience: string; redemptions: number }[];
    top: {
      code: string;
      description: string;
      audience: string;
      enabled: boolean;
      uses: number;
      usesInRange: number;
    }[];
  };
  usage: {
    /** Standalone items (a project's own note and canvas count as the project). */
    totals: Record<ItemKind, number>;
    created: Record<ItemKind, number>;
    series: ({ day: string } & Record<ItemKind, number>)[];
    /** Items published to the web right now. */
    published: number;
    /** Views and new daily visitors on published pages, in range. */
    views: number;
    visitors: number;
    /** People invited to an item, in range. */
    shares: number;
    /** People who used the CLI in range, and CLI tokens in use. */
    cliUsers: number;
    cliTokens: number;
  };
}
