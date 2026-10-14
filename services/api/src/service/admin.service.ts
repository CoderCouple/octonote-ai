/**
 * The admin portal's tools: find people and workspaces, give or extend Pro,
 * end a grant early, cancel a subscription now, manage the student email
 * endings, and the one-time sign-in that opens the portal on its own
 * address. Every change is written to the admin audit log.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCancelInput,
  AdminGrant,
  AdminGrantInput,
  AdminPlan,
  AdminUserDetail,
  AdminUserRow,
  AdminWorkspaceDetail,
  StudentDomain,
  StudentDomainCreate,
} from "@octonote/shared";
import { and, desc, eq, gt, ilike, isNull, max, or, sql } from "drizzle-orm";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { AdminAuditService } from "../common/admin-audit.service";
import { BadRequest, Conflict, NotFound } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { studentEmailSuffixes, workspaceBilling } from "../db/schemas/billing";
import { cliTokens } from "../db/schemas/cli-tokens";
import { promoCodes, promoRedemptions } from "../db/schemas/promotions";
import { activityDays, billingEvents, proGrants } from "../db/schemas/tracking";
import { users } from "../db/schemas/users";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";
import { BillingService } from "./billing.service";
import { describeCode } from "./promotions.service";

const SEARCH_LIMIT = 25;

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly planLimits: PlanLimitsService,
    private readonly billing: BillingService,
    private readonly audit: AdminAuditService,
  ) {}

  // --- Sign-in handoff ---------------------------------------------------------

  /**
   * A one-time sign-in token for the portal's own address, so it gets its own
   * session instead of sharing (and fighting over) the main site's. Nothing is
   * emailed; the token is exchanged with `verifyOtp` within the hour.
   */
  async handoff(adminUserId: string): Promise<{ tokenHash: string }> {
    const [user] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, adminUserId)).limit(1);
    if (!user) throw NotFound("User not found.");
    const { data, error } = await this.supabase.auth.admin.generateLink({ type: "magiclink", email: user.email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) throw BadRequest(`Couldn't open the admin portal: ${error?.message ?? "no token"}`);
    return { tokenHash };
  }

  // --- People ------------------------------------------------------------------

  /** People by email, name or id (newest first when the search is empty). */
  async searchUsers(q: string): Promise<AdminUserRow[]> {
    const term = q.trim();
    const where = term
      ? or(eq(users.id, term), ilike(users.email, `%${escapeLike(term)}%`), ilike(users.name, `%${escapeLike(term)}%`))
      : undefined;
    const rows = await this.db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(SEARCH_LIMIT);
    return Promise.all(rows.map((u) => this.userRow(u)));
  }

  async user(userId: string): Promise<AdminUserDetail> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw NotFound("User not found.");
    const row = await this.userRow(u);
    const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const activity = await this.db
      .select({ day: activityDays.day, source: activityDays.source })
      .from(activityDays)
      .where(and(eq(activityDays.userId, userId), sql`${activityDays.day} >= ${monthAgo}::date`));
    const [tokens] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(cliTokens)
      .where(and(eq(cliTokens.userId, userId), isNull(cliTokens.revokedAt)));
    const memberships = await this.db
      .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(workspaces.createdAt);
    return {
      ...row,
      studentProUntil: u.studentProUntil?.toISOString() ?? null,
      sources: (["web", "mobile", "cli"] as const).filter((s) => activity.some((a) => a.source === s)),
      activeDays30: new Set(activity.map((a) => a.day)).size,
      cliTokens: Number(tokens?.n ?? 0),
      memberships: await Promise.all(
        memberships.map(async (m) => ({ id: m.id, name: m.name, role: m.role, plan: await this.plan(m.id) })),
      ),
    };
  }

  private async userRow(u: typeof users.$inferSelect): Promise<AdminUserRow> {
    const [last] = await this.db
      .select({ day: max(activityDays.day) })
      .from(activityDays)
      .where(eq(activityDays.userId, u.id));
    const memberships = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, u.id));
    const ownedIds = memberships.filter((m) => m.role === "OWNER").map((m) => m.workspaceId);
    let pro = false;
    for (const id of ownedIds) if ((await this.planLimits.planOf(id)) === "pro") pro = true;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      isAdmin: u.isAdmin,
      lastActive: last?.day ? String(last.day).slice(0, 10) : null,
      workspaces: memberships.length,
      pro,
    };
  }

  // --- Workspaces --------------------------------------------------------------

  async workspace(workspaceId: string): Promise<AdminWorkspaceDetail> {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!ws) throw NotFound("Workspace not found.");
    const [billing] = await this.db.select().from(workspaceBilling).where(eq(workspaceBilling.workspaceId, workspaceId)).limit(1);
    const members = await this.db
      .select({ userId: users.id, email: users.email, name: users.name, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const codes = await this.db
      .select({ code: promoCodes, proUntil: promoRedemptions.proUntil, createdAt: promoRedemptions.createdAt })
      .from(promoRedemptions)
      .innerJoin(promoCodes, eq(promoCodes.id, promoRedemptions.promoCodeId))
      .where(eq(promoRedemptions.workspaceId, workspaceId))
      .orderBy(desc(promoRedemptions.createdAt));
    const history = await this.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.workspaceId, workspaceId))
      .orderBy(desc(billingEvents.createdAt))
      .limit(30);
    const published = await this.publishedCount(workspaceId);
    const customer = billing?.stripeCustomerId;
    const testMode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test");
    return {
      id: ws.id,
      name: ws.name,
      createdAt: ws.createdAt.toISOString(),
      plan: await this.plan(workspaceId),
      billing: {
        status: billing?.status ?? null,
        interval: billing?.interval ?? null,
        currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: billing?.cancelAtPeriodEnd ?? false,
        hasSubscription: Boolean(billing?.stripeSubscriptionId && billing.status !== "canceled"),
        stripeUrl: customer ? `https://dashboard.stripe.com${testMode ? "/test" : ""}/customers/${customer}` : null,
      },
      members: members.map((m) => ({ ...m, role: m.role })),
      usage: await this.planLimits.usage(workspaceId),
      published,
      codes: codes.map((c) => ({
        code: c.code.code,
        description: describeCode(c.code),
        proUntil: c.proUntil?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      grants: await this.grants(workspaceId),
      history: history.map((e) => ({
        kind: e.kind,
        interval: e.interval,
        amountCents: e.amountCents,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  private async plan(workspaceId: string): Promise<AdminPlan> {
    const p = await this.planLimits.planDetails(workspaceId);
    return { plan: p.plan, source: p.source, until: p.until?.toISOString() ?? null };
  }

  private async publishedCount(workspaceId: string): Promise<number> {
    const res = (await this.db.execute(sql`
      select
        (select count(*)::int from pages where workspace_id = ${workspaceId} and published_at is not null and deleted_at is null)
        + (select count(*)::int from canvases where workspace_id = ${workspaceId} and published_at is not null and deleted_at is null)
        + (select count(*)::int from projects where workspace_id = ${workspaceId} and published_at is not null and archived_at is null)
        + (select count(*)::int from notebooks where workspace_id = ${workspaceId} and published_at is not null) as n
    `)) as unknown;
    const rows = (Array.isArray(res) ? res : (res as { rows: { n: number }[] }).rows) as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  }

  // --- Grants ------------------------------------------------------------------

  async grants(workspaceId: string): Promise<AdminGrant[]> {
    const rows = await this.db
      .select({ grant: proGrants, by: users.email })
      .from(proGrants)
      .leftJoin(users, eq(users.id, proGrants.grantedByUserId))
      .where(eq(proGrants.workspaceId, workspaceId))
      .orderBy(desc(proGrants.createdAt));
    return rows.map(({ grant: g, by }) => ({
      id: g.id,
      months: g.months,
      proUntil: g.proUntil.toISOString(),
      reason: g.reason,
      grantedBy: by,
      endedAt: g.endedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    }));
  }

  /**
   * Gives Pro for N months, or extends it: the months start when the
   * workspace's current free Pro (grant, code or student year) runs out.
   */
  async grant(workspaceId: string, input: AdminGrantInput, adminUserId: string): Promise<AdminWorkspaceDetail> {
    const ws = await this.requireWorkspace(workspaceId);
    const now = new Date();
    const current = await this.planLimits.planDetails(workspaceId, now);
    const start = current.source && current.source !== "stripe" && current.until && current.until > now ? current.until : now;
    const proUntil = new Date(start);
    proUntil.setMonth(proUntil.getMonth() + input.months);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(proGrants)
        .values({ workspaceId, months: input.months, proUntil, reason: input.reason, grantedByUserId: adminUserId })
        .returning({ id: proGrants.id });
      await this.audit.record(
        adminUserId,
        {
          action: "grant.create",
          targetKind: "workspace",
          targetId: workspaceId,
          targetLabel: ws.name,
          details: { grantId: row!.id, months: input.months, proUntil: proUntil.toISOString(), reason: input.reason },
        },
        tx as unknown as Database,
      );
    });
    return this.workspace(workspaceId);
  }

  /** Ends a grant now (Pro stops unless something else covers the workspace). */
  async endGrant(grantId: string, adminUserId: string): Promise<AdminWorkspaceDetail> {
    const [g] = await this.db.select().from(proGrants).where(eq(proGrants.id, grantId)).limit(1);
    if (!g) throw NotFound("Grant not found.");
    if (g.endedAt || g.proUntil <= new Date()) throw Conflict("This grant has already ended.");
    const ws = await this.requireWorkspace(g.workspaceId);
    await this.db.transaction(async (tx) => {
      await tx.update(proGrants).set({ endedAt: new Date() }).where(eq(proGrants.id, grantId));
      await this.audit.record(
        adminUserId,
        { action: "grant.end", targetKind: "workspace", targetId: g.workspaceId, targetLabel: ws.name, details: { grantId, reason: g.reason } },
        tx as unknown as Database,
      );
    });
    return this.workspace(g.workspaceId);
  }

  // --- Subscriptions -----------------------------------------------------------

  /** Cancels the subscription immediately (support and refunds), optionally refunding the last payment. */
  async cancelNow(workspaceId: string, input: AdminCancelInput, adminUserId: string): Promise<AdminWorkspaceDetail> {
    const ws = await this.requireWorkspace(workspaceId);
    const result = await this.billing.cancelNow(workspaceId, input.refundLastPayment);
    await this.audit.record(adminUserId, {
      action: "subscription.cancel",
      targetKind: "workspace",
      targetId: workspaceId,
      targetLabel: ws.name,
      details: { reason: input.reason, refundedCents: result.refundedCents },
    });
    return this.workspace(workspaceId);
  }

  // --- Student email endings ---------------------------------------------------

  async studentDomains(): Promise<StudentDomain[]> {
    const rows = await this.db.select().from(studentEmailSuffixes).orderBy(studentEmailSuffixes.suffix);
    const students = await this.db
      .select({ email: users.email })
      .from(users)
      .where(gt(users.studentProUntil, new Date()));
    const domains = students.map((s) => s.email.split("@")[1]?.toLowerCase() ?? "");
    return rows.map((r) => ({
      id: r.id,
      suffix: r.suffix,
      label: r.label,
      enabled: r.enabled,
      activeStudents: domains.filter((d) => d === r.suffix || d.endsWith(`.${r.suffix}`)).length,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async addStudentDomain(input: StudentDomainCreate, adminUserId: string): Promise<StudentDomain[]> {
    const [existing] = await this.db
      .select({ id: studentEmailSuffixes.id })
      .from(studentEmailSuffixes)
      .where(eq(studentEmailSuffixes.suffix, input.suffix))
      .limit(1);
    if (existing) throw Conflict(`"${input.suffix}" is already on the list.`);
    await this.db.insert(studentEmailSuffixes).values({ suffix: input.suffix, label: input.label ?? null, createdByUserId: adminUserId });
    await this.audit.record(adminUserId, {
      action: "student_domain.add",
      targetKind: "student_domain",
      targetLabel: input.suffix,
      details: input.label ? { label: input.label } : undefined,
    });
    return this.studentDomains();
  }

  async setStudentDomainEnabled(id: string, enabled: boolean, adminUserId: string): Promise<StudentDomain[]> {
    const [row] = await this.db
      .update(studentEmailSuffixes)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(studentEmailSuffixes.id, id))
      .returning();
    if (!row) throw NotFound("Email ending not found.");
    await this.audit.record(adminUserId, {
      action: enabled ? "student_domain.enable" : "student_domain.disable",
      targetKind: "student_domain",
      targetId: id,
      targetLabel: row.suffix,
    });
    return this.studentDomains();
  }

  private async requireWorkspace(workspaceId: string) {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!ws) throw NotFound("Workspace not found.");
    return ws;
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
