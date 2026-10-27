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
  sources: ("web" | "mobile" | "cli" | "mcp")[];
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
  /** Pass as `before` to load older entries (microsecond time, so paging skips nothing). */
  cursor: string;
}

// --- Partners: creators and influencers ---------------------------------------

/** What kind of partner someone is, for reporting and filters. */
export const PARTNER_KINDS = ["creator", "influencer", "educator", "founder", "affiliate", "community"] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];
export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  creator: "Creator",
  influencer: "Influencer",
  educator: "Educator",
  founder: "Founder",
  affiliate: "Affiliate",
  community: "Community",
};

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
  kind: PartnerKind;
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

/**
 * A creator's own view (Settings → Creator program): their link, code and
 * numbers. Counts only — never who the people are.
 */
export interface CreatorDashboard {
  name: string;
  kind: PartnerKind;
  code: string;
  link: string;
  /** Their audience's offer, e.g. "Pro free for 1 month". */
  offer: string | null;
  commissionPercent: number;
  commissionMonths: number | null;
  /** Off: their link and code no longer count new people. */
  enabled: boolean;
  signups: number;
  activated: number;
  paying: number;
  earnedCents: number;
  paidOutCents: number;
  owedCents: number;
  /** Sign-ups per week (Monday, UTC) for the last 12 weeks, oldest first. */
  weekly: { week: string; signups: number }[];
}

// --- Follow-ups CRM (Admin → Inbox) --------------------------------------------

export const CRM_STATUSES = ["new", "contacted", "replied", "using", "paying", "not_interested"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];
export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  using: "Using it",
  paying: "Paying",
  not_interested: "Not interested",
};

/** What staff can log by hand. Emails (sent and received) come in later layers. */
export const CRM_LOG_KINDS = ["note", "linkedin", "call", "whatsapp", "meeting"] as const;
export type CrmLogKind = (typeof CRM_LOG_KINDS)[number];
export type CrmEntryKind = CrmLogKind | "email_out" | "email_in";
export const CRM_KIND_LABELS: Record<CrmEntryKind, string> = {
  note: "Note",
  linkedin: "LinkedIn",
  call: "Call",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  email_out: "Email",
  email_in: "Reply",
};

/**
 * Email templates for Admin → Inbox. {first} is the person's first name,
 * {me} the sender's. Staff edit the text before sending.
 */
export const CRM_TEMPLATES: { id: string; label: string; subject: string; body: string }[] = [
  {
    id: "welcome",
    label: "Welcome",
    subject: "Welcome to Octonote, {first}",
    body: "Hi {first},\n\nI'm {me}, one of the founders of Octonote. Thanks for signing up!\n\nWhat are you hoping to use it for? I read every reply, and I'm happy to help you get set up.\n\n{me}\nCo-founder, Octonote AI\nhttps://octonote.ai",
  },
  {
    id: "checkin",
    label: "How's it going?",
    subject: "How's Octonote going?",
    body: "Hi {first},\n\nHow's Octonote going so far? Is there anything that got in the way, or something you expected it to do that it didn't?\n\nJust reply, I read every message.\n\n{me}\nCo-founder, Octonote AI",
  },
  {
    id: "call",
    label: "15-min call",
    subject: "15 minutes to show me how you use Octonote?",
    body: "Hi {first},\n\nWould you have 15 minutes this week to show me how you use Octonote? It would help us a lot, and I can show you a few things you might not have found yet.\n\n{me}\nCo-founder, Octonote AI",
  },
  {
    id: "pro-ending",
    label: "Free Pro ends soon",
    subject: "Your free Pro ends soon",
    body: "Hi {first},\n\nA quick heads-up: your free Pro ends soon. Everything you made stays either way. If you'd like to keep Pro, it's $10 a month or $100 a year in Settings, Plan & billing.\n\n{me}\nCo-founder, Octonote AI",
  },
];

/** Fills {first} and {me} in a template's subject or body. */
export function fillCrmTemplate(text: string, first: string, me: string): string {
  return text.replace(/\{first\}/g, first).replace(/\{me\}/g, me);
}

export interface CrmFollowup {
  id: string;
  /** YYYY-MM-DD */
  dueOn: string;
  note: string;
  assignedTo: { id: string; name: string } | null;
  doneAt: string | null;
}

/** One row of the Inbox list. */
export interface CrmPersonRow {
  user: { id: string; name: string; email: string };
  joinedAt: string;
  /** Where they came from, in words: "Priya (creator)", "Published page", "Direct". */
  source: string;
  status: CrmStatus;
  /** The latest thing in their timeline, for the preview. */
  last: { kind: CrmEntryKind | "event"; title: string; preview: string; at: string } | null;
  /** The earliest open follow-up. */
  nextFollowup: CrmFollowup | null;
  /** Nothing logged, sent or received yet. */
  contacted: boolean;
  /** We've emailed them from the Inbox at least once. */
  emailed: boolean;
  /** Their reply is the latest thing in the timeline: it's our turn. */
  needsReply: boolean;
  /** A reply came in after staff last opened this person. */
  unread: boolean;
  /** The staff member who looks after this person. */
  owner: { id: string; name: string } | null;
}

/** An item in a person's timeline: something logged or sent, or an event we know about. */
export type CrmTimelineItem =
  | {
      type: "entry";
      id: string;
      kind: CrmEntryKind;
      subject: string | null;
      body: string;
      by: { id: string; name: string } | null;
      at: string;
    }
  | { type: "event"; title: string; at: string };

export interface CrmPersonDetail {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  joinedAt: string;
  source: string;
  status: CrmStatus;
  owner: { id: string; name: string } | null;
  plan: AdminPlan;
  made: { notes: number; canvases: number; projects: number; notebooks: number };
  /** Days active out of the last 30, and the last active day (YYYY-MM-DD). */
  activeDays: number;
  lastActive: string | null;
  /** The last 30 days (UTC), oldest first, and where they used Octonote each day. */
  activity: { day: string; sources: ("web" | "mobile" | "cli" | "mcp")[] }[];
  /** Oldest first. */
  timeline: CrmTimelineItem[];
  /** Open ones first (by due date), then done ones. */
  followups: CrmFollowup[];
}

/** Admin → Follow-ups: the CRM at a glance, for everyone or one owner. */
export interface CrmOverview {
  /** People by status (everyone who signed up, or one owner's people). */
  pipeline: { status: CrmStatus; count: number }[];
  /** Per week (Monday, UTC), oldest first: what staff sent (emails + logged messages) and replies received. */
  weekly: { week: string; sent: number; replies: number }[];
  /** Replies ÷ emails sent in the last 30 days, 0–1; null when nothing was sent. */
  replyRate30d: number | null;
  counts: { due: number; waitingOnUs: number; notContacted: number; comingUp: number };
  /** Open follow-ups due today or earlier, oldest first. */
  due: { followup: CrmFollowup; person: { id: string; name: string; email: string }; status: CrmStatus }[];
  /** People whose reply is the latest thing: our turn. */
  waitingOnUs: { person: { id: string; name: string; email: string }; at: string; subject: string | null; preview: string }[];
  /** Signed up in the last 30 days, nothing logged or sent yet. */
  notContacted: { person: { id: string; name: string; email: string }; joinedAt: string; source: string }[];
  /** Open follow-ups due in the next 7 days. */
  comingUp: { followup: CrmFollowup; person: { id: string; name: string; email: string } }[];
}
