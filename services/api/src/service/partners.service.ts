/**
 * Partners: creators and influencers who bring people to Octonote.
 *
 *   - Each partner gets one unique code made from their name (PRIYA, PRIYA2…).
 *     Their link is octonote.ai/?ref=priya; the same code can also be a promo
 *     code for their audience (created here with the partner).
 *   - People who sign up through the link, or use the code, become theirs
 *     (common/partner-attribution.ts). The first partner wins.
 *   - Every paid Stripe invoice from a workspace owned by one of their people
 *     is recorded here (from the webhook); the partner earns
 *     `commission_percent` of it for `commission_months` after that person's
 *     first payment. Invoices outside that window are kept with no commission,
 *     so revenue per partner stays complete.
 *   - Payouts are marked by hand once the partner has been paid.
 * Every change is written to the admin audit log.
 */
import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminPlan,
  Partner,
  PartnerCreate,
  PartnerDetail,
  PartnerStats,
  PartnerUpdate,
} from "@octonote/shared";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { AdminAuditService } from "../common/admin-audit.service";
import { Conflict, NotFound } from "../common/error/error-factory";
import { PAID_STATUSES, PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { partnerCommissions, partnerReferrals, partners } from "../db/schemas/partners";
import { promoCodes } from "../db/schemas/promotions";
import { users } from "../db/schemas/users";
import { workspaceMembers } from "../db/schemas/workspaces";
import { appUrl } from "./lib/resource-url";
import { describeCode, PromotionsService } from "./promotions.service";

type PartnerRow = typeof partners.$inferSelect;
type Row = Record<string, unknown>;

const CODE_SHAPE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** "Priya Bagde" → "PRIYA"; short names use more of the name ("Al Li" → "ALLI"). */
export function codeStem(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  let stem = words[0] ?? "";
  if (stem.length < 3) stem = words.join("");
  if (stem.length < 3) stem = `${stem}CREATOR`;
  return stem.slice(0, 20);
}

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

@Injectable()
export class PartnersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly promotions: PromotionsService,
    private readonly planLimits: PlanLimitsService,
    private readonly audit: AdminAuditService,
  ) {}

  // --- Codes -------------------------------------------------------------------

  /** A free code for this name: PRIYA, else PRIYA2, PRIYA3… (never one a promo code already uses). */
  async suggestCode(name: string): Promise<string> {
    const stem = codeStem(name);
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? stem : `${stem}${n}`;
      if (!(await this.codeTaken(candidate))) return candidate;
    }
    return `${stem}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private async codeTaken(code: string): Promise<boolean> {
    const [p] = await this.db.select({ id: partners.id }).from(partners).where(eq(partners.code, code)).limit(1);
    if (p) return true;
    const [c] = await this.db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    return Boolean(c);
  }

  // --- Admin -----------------------------------------------------------------

  async create(input: PartnerCreate, adminUserId: string): Promise<PartnerDetail> {
    const code = input.code ?? (await this.suggestCode(input.name));
    if (!CODE_SHAPE.test(code)) throw Conflict(`"${code}" isn't a valid code.`);
    if (await this.codeTaken(code)) throw Conflict(`The code ${code} is already taken.`);

    // The audience offer is an ordinary promo code with the same name.
    let promoCodeId: string | null = null;
    if (input.discount) {
      const promo = await this.promotions.create(
        {
          code,
          audience: "creator",
          note: `Partner: ${input.name}`,
          ...(input.discount.kind === "free_pro"
            ? { kind: "free_pro", freeMonths: input.discount.freeMonths }
            : {
                kind: "percent_off",
                percentOff: input.discount.percentOff,
                duration: input.discount.duration,
                durationMonths: input.discount.durationMonths,
              }),
        },
        adminUserId,
      );
      promoCodeId = promo.id;
    }

    const [row] = await this.db
      .insert(partners)
      .values({
        name: input.name,
        code,
        email: input.email ?? null,
        commissionPercent: input.commissionPercent,
        commissionMonths: input.commissionMonths,
        promoCodeId,
        note: input.note ?? null,
        createdByUserId: adminUserId,
      })
      .returning();
    await this.audit.record(adminUserId, {
      action: "partner.create",
      targetKind: "partner",
      targetId: row!.id,
      targetLabel: `${input.name} (${code})`,
      details: {
        commissionPercent: input.commissionPercent,
        commissionMonths: input.commissionMonths,
        ...(input.discount ? { discount: input.discount } : {}),
      },
    });
    return this.detail(row!.id);
  }

  async update(id: string, input: PartnerUpdate, adminUserId: string): Promise<PartnerDetail> {
    const before = await this.require(id);
    const changes = Object.fromEntries(
      Object.entries(input).filter(([k, v]) => v !== undefined && v !== before[k as keyof PartnerRow]),
    );
    if (Object.keys(changes).length > 0) {
      await this.db
        .update(partners)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(partners.id, id));
      await this.audit.record(adminUserId, {
        action: "partner.update",
        targetKind: "partner",
        targetId: id,
        targetLabel: `${before.name} (${before.code})`,
        details: Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [k, { from: before[k as keyof PartnerRow] ?? null, to: v }]),
        ),
      });
    }
    return this.detail(id);
  }

  async list(): Promise<Partner[]> {
    const rows = await this.db.select().from(partners).orderBy(desc(partners.createdAt));
    const stats = await this.stats();
    return Promise.all(rows.map((r) => this.toPartner(r, stats.get(r.id))));
  }

  async detail(id: string): Promise<PartnerDetail> {
    const row = await this.require(id);
    const stats = await this.stats(id);

    const people = await this.rows(sql`
      select u.id, u.name, u.email, r.via, u.created_at as joined_at,
        (select count(*)::int from pages where created_by_user_id = u.id)
          + (select count(*)::int from canvases where created_by_user_id = u.id)
          + (select count(*)::int from projects where created_by_user_id = u.id)
          + (select count(*)::int from notebooks where created_by_user_id = u.id) as made_items,
        (select max(day)::text from activity_days where user_id = u.id) as last_active,
        (select m.workspace_id from workspace_members m where m.user_id = u.id and m.role = 'OWNER'
          order by m.created_at limit 1) as workspace_id,
        (select coalesce(sum(amount_paid_cents), 0)::int from partner_commissions c
          where c.partner_id = r.partner_id and c.user_id = u.id) as paid_cents
      from partner_referrals r
      join users u on u.id = r.user_id
      where r.partner_id = ${id}
      order by u.created_at desc
    `);
    const referrals = await Promise.all(
      people.map(async (p) => ({
        user: { id: String(p.id), name: String(p.name), email: String(p.email) },
        via: p.via as "link" | "code",
        joinedAt: new Date(p.joined_at as string).toISOString(),
        madeItems: Number(p.made_items),
        lastActive: (p.last_active as string | null) ?? null,
        plan: p.workspace_id ? await this.plan(String(p.workspace_id)) : { plan: "free" as const, source: null, until: null },
        paidCents: Number(p.paid_cents),
      })),
    );

    const commissions = await this.db
      .select({ c: partnerCommissions, u: { id: users.id, name: users.name, email: users.email } })
      .from(partnerCommissions)
      .leftJoin(users, eq(users.id, partnerCommissions.userId))
      .where(eq(partnerCommissions.partnerId, id))
      .orderBy(desc(partnerCommissions.paidAt));

    return {
      ...(await this.toPartner(row, stats.get(id))),
      referrals,
      commissions: commissions.map(({ c, u }) => ({
        id: c.id,
        user: u?.id ? u : null,
        amountPaidCents: c.amountPaidCents,
        commissionCents: c.commissionCents,
        paidAt: c.paidAt.toISOString(),
        paidOutAt: c.paidOutAt?.toISOString() ?? null,
      })),
    };
  }

  /** Marks everything owed as paid out (after paying the partner yourself). */
  async markPaidOut(id: string, adminUserId: string): Promise<PartnerDetail> {
    const row = await this.require(id);
    const paid = await this.db
      .update(partnerCommissions)
      .set({ paidOutAt: new Date() })
      .where(
        and(
          eq(partnerCommissions.partnerId, id),
          isNull(partnerCommissions.paidOutAt),
          sql`${partnerCommissions.commissionCents} > 0`,
        ),
      )
      .returning({ cents: partnerCommissions.commissionCents });
    if (paid.length > 0) {
      await this.audit.record(adminUserId, {
        action: "partner.payout",
        targetKind: "partner",
        targetId: id,
        targetLabel: `${row.name} (${row.code})`,
        details: { invoices: paid.length, totalCents: paid.reduce((n, p) => n + p.cents, 0) },
      });
    }
    return this.detail(id);
  }

  // --- From the Stripe webhook -------------------------------------------------

  /**
   * One paid invoice. If the workspace's owner was brought by a partner, the
   * invoice is recorded with the partner's share (zero once the commission
   * window has passed or the partner is switched off). Retries count once.
   */
  async recordInvoicePaid(invoice: {
    workspaceId: string;
    invoiceId: string;
    amountPaidCents: number;
    currency: string;
    paidAt: Date;
  }): Promise<void> {
    if (invoice.amountPaidCents <= 0) return;
    const [owner] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, invoice.workspaceId), eq(workspaceMembers.role, "OWNER")))
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);
    if (!owner) return;
    const [ref] = await this.db
      .select({ partner: partners })
      .from(partnerReferrals)
      .innerJoin(partners, eq(partners.id, partnerReferrals.partnerId))
      .where(eq(partnerReferrals.userId, owner.userId))
      .limit(1);
    if (!ref) return;
    const p = ref.partner;

    // The window runs from this person's first recorded payment.
    const [first] = await this.db
      .select({ paidAt: sql<Date>`min(${partnerCommissions.paidAt})` })
      .from(partnerCommissions)
      .where(and(eq(partnerCommissions.partnerId, p.id), eq(partnerCommissions.userId, owner.userId)));
    const firstPaid = first?.paidAt ? new Date(first.paidAt) : invoice.paidAt;
    const inWindow = p.commissionMonths === null || invoice.paidAt < addMonths(firstPaid, p.commissionMonths);
    const commissionCents = p.enabled && inWindow ? Math.round((invoice.amountPaidCents * p.commissionPercent) / 100) : 0;

    await this.db
      .insert(partnerCommissions)
      .values({
        partnerId: p.id,
        workspaceId: invoice.workspaceId,
        userId: owner.userId,
        stripeInvoiceId: invoice.invoiceId,
        amountPaidCents: invoice.amountPaidCents,
        currency: invoice.currency,
        commissionCents,
        paidAt: invoice.paidAt,
      })
      .onConflictDoNothing();
  }

  // --- Helpers -----------------------------------------------------------------

  private async require(id: string): Promise<PartnerRow> {
    const [row] = await this.db.select().from(partners).where(eq(partners.id, id)).limit(1);
    if (!row) throw NotFound("Partner not found.");
    return row;
  }

  private async toPartner(r: PartnerRow, stats: PartnerStats | undefined): Promise<Partner> {
    const [promo] = r.promoCodeId
      ? await this.db.select().from(promoCodes).where(eq(promoCodes.id, r.promoCodeId)).limit(1)
      : [];
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      link: `${appUrl()}/?ref=${r.code.toLowerCase()}`,
      email: r.email,
      commissionPercent: r.commissionPercent,
      commissionMonths: r.commissionMonths,
      promo: promo
        ? { id: promo.id, description: describeCode(promo), redemptions: promo.redemptionCount, enabled: promo.enabled }
        : null,
      note: r.note,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      stats: stats ?? { signups: 0, activated: 0, paying: 0, revenueCents: 0, earnedCents: 0, owedCents: 0 },
    };
  }

  /** Sign-ups, activation, paying workspaces and money, per partner (or for one). */
  private async stats(onlyId?: string): Promise<Map<string, PartnerStats>> {
    const paid = sql.join(
      PAID_STATUSES.map((s) => sql`${s}`),
      sql`, `,
    );
    const rows = await this.rows(sql`
      select p.id,
        (select count(*)::int from partner_referrals r where r.partner_id = p.id) as signups,
        (select count(*)::int from partner_referrals r where r.partner_id = p.id and (
          exists (select 1 from pages where created_by_user_id = r.user_id)
          or exists (select 1 from canvases where created_by_user_id = r.user_id)
          or exists (select 1 from projects where created_by_user_id = r.user_id)
          or exists (select 1 from notebooks where created_by_user_id = r.user_id))) as activated,
        (select count(distinct b.workspace_id)::int from partner_referrals r
          join workspace_members m on m.user_id = r.user_id and m.role = 'OWNER'
          join workspace_billing b on b.workspace_id = m.workspace_id
          where r.partner_id = p.id and b.status in (${paid})) as paying,
        (select coalesce(sum(amount_paid_cents), 0)::int from partner_commissions c where c.partner_id = p.id) as revenue,
        (select coalesce(sum(commission_cents), 0)::int from partner_commissions c where c.partner_id = p.id) as earned,
        (select coalesce(sum(commission_cents), 0)::int from partner_commissions c
          where c.partner_id = p.id and c.paid_out_at is null) as owed
      from partners p
      ${onlyId ? sql`where p.id = ${onlyId}` : sql``}
    `);
    return new Map(
      rows.map((r) => [
        String(r.id),
        {
          signups: Number(r.signups),
          activated: Number(r.activated),
          paying: Number(r.paying),
          revenueCents: Number(r.revenue),
          earnedCents: Number(r.earned),
          owedCents: Number(r.owed),
        },
      ]),
    );
  }

  private async plan(workspaceId: string): Promise<AdminPlan> {
    const p = await this.planLimits.planDetails(workspaceId);
    return { plan: p.plan, source: p.source, until: p.until?.toISOString() ?? null };
  }

  /** Runs a raw query; postgres-js returns an array, PGlite (tests) `{ rows }`. */
  private async rows(query: SQL): Promise<Row[]> {
    const res = (await this.db.execute(query)) as unknown;
    return (Array.isArray(res) ? res : ((res as { rows?: Row[] }).rows ?? [])) as Row[];
  }
}
