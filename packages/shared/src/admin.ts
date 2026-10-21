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
  /** Admin's note. */
  label: string | null;
  enabled: boolean;
  /** "hipo": from the world university list; "manual": added or edited by staff. */
  source: "hipo" | "manual";
  university: string | null;
  /** ISO 3166-1 alpha-2, e.g. "GB"; null for endings that span countries ("edu"). */
  countryCode: string | null;
  country: string | null;
  /** State or province. */
  region: string | null;
  website: string | null;
  /** Students currently on the free year from this ending. */
  activeStudents: number;
  createdAt: string;
  updatedAt: string;
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

// --- Partners: creators and influencers ---------------------------------------

export interface PartnerStats {
  /** People who joined through the partner's link or code. */
  signups: number;
  /** Of those, how many have made at least one note, canvas, project or notebook. */
  activated: number;
  /** Workspaces owned by those people that pay right now. */
  paying: number;
  /** What those people have paid in total. */
  revenueCents: number;
  /** The partner's share of that. */
  earnedCents: number;
  /** Earned and not yet paid out. */
  owedCents: number;
}

export interface Partner {
  id: string;
  name: string;
  code: string;
  /** Their tracking link, e.g. https://octonote.ai/?ref=priya */
  link: string;
  email: string | null;
  commissionPercent: number;
  /** Months after a person's first payment that earn commission; null = always. */
  commissionMonths: number | null;
  /** The promo code their audience can use (same code), if any. */
  promo: { id: string; description: string; redemptions: number; enabled: boolean } | null;
  note: string | null;
  enabled: boolean;
  createdAt: string;
  stats: PartnerStats;
}

export interface PartnerReferral {
  user: { id: string; name: string; email: string };
  via: "link" | "code";
  joinedAt: string;
  madeItems: number;
  lastActive: string | null;
  plan: AdminPlan;
  paidCents: number;
}

export interface PartnerCommission {
  id: string;
  user: { id: string; name: string; email: string } | null;
  amountPaidCents: number;
  commissionCents: number;
  paidAt: string;
  paidOutAt: string | null;
}

export interface PartnerDetail extends Partner {
  referrals: PartnerReferral[];
  commissions: PartnerCommission[];
}
