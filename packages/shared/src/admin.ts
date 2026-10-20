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
     * Sign-ups in range by where they came from: "pub:<slug>" (the end of a
     * published page), "pub-header", … or "direct" (no source recorded).
     */
    signupSources: { ref: string; signups: number }[];
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

// --- Admin portal: people, workspaces, grants, student domains, audit -------

export type PlanSource = "stripe" | "promo" | "student" | "grant" | null;

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isAdmin: boolean;
  /** Last day they used Octonote (UTC "YYYY-MM-DD"), if seen since tracking began. */
  lastActive: string | null;
  workspaces: number;
  /** Whether any workspace they own is on Pro. */
  pro: boolean;
}

export interface AdminPlan {
  plan: "free" | "pro";
  source: PlanSource;
  until: string | null;
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  role: string;
  plan: AdminPlan;
}

export interface AdminUserDetail extends AdminUserRow {
  studentProUntil: string | null;
  /** Apps used in the last 30 days. */
  sources: ("web" | "mobile" | "cli")[];
  activeDays30: number;
  cliTokens: number;
  memberships: AdminWorkspaceRow[];
}

export interface AdminGrant {
  id: string;
  months: number;
  proUntil: string;
  reason: string;
  grantedBy: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface AdminWorkspaceDetail {
  id: string;
  name: string;
  createdAt: string;
  plan: AdminPlan;
  billing: {
    status: string | null;
    interval: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasSubscription: boolean;
    /** Link to the customer in the Stripe dashboard. */
    stripeUrl: string | null;
  };
  members: { userId: string; email: string; name: string; role: string }[];
  usage: Record<"page" | "canvas" | "project" | "notebook", number>;
  published: number;
  codes: {
    code: string;
    description: string;
    proUntil: string | null;
    createdAt: string;
  }[];
  grants: AdminGrant[];
  history: {
    kind: string;
    interval: string | null;
    amountCents: number | null;
    createdAt: string;
  }[];
}

export interface StudentDomain {
  id: string;
  suffix: string;
  label: string | null;
  enabled: boolean;
  /** Students currently on the free year from this ending. */
  activeStudents: number;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
