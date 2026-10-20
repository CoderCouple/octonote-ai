/**
 * The admin dashboard's numbers: growth, revenue, codes & offers, product
 * usage. Read-only aggregate queries over Octonote's own tables — sign-ups
 * and items from their created_at, active users from `activity_days`,
 * subscription history from `billing_events`, current plans from
 * `workspace_billing`, views from `resource_views`.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  discountedCents,
  PRO_PRICE,
  type AdminMetrics,
  type ItemKind,
} from "@octonote/shared";
import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { PAID_STATUSES } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { workspaceBilling } from "../db/schemas/billing";
import { promoCodes, promoRedemptions } from "../db/schemas/promotions";
import { describeCode, discountInForce } from "./promotions.service";

const KINDS: ItemKind[] = ["note", "canvas", "project", "notebook"];

/** Standalone, live items per kind (a project's own note and canvas belong to the project). */
const ITEM_SOURCES: Record<ItemKind, { table: string; live: string }> = {
  note: { table: "pages", live: "deleted_at is null and project_id is null" },
  canvas: {
    table: "canvases",
    live: "deleted_at is null and project_id is null",
  },
  project: { table: "projects", live: "archived_at is null" },
  notebook: { table: "notebooks", live: "true" },
};

type Row = Record<string, unknown>;

@Injectable()
export class AdminMetricsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async metrics(days: number, now = new Date()): Promise<AdminMetrics> {
    const today = utcDay(now);
    const from = addDays(today, -(days - 1));
    const [growth, revenue, codes, usage] = await Promise.all([
      this.growth(days, from, today),
      this.revenue(from, today),
      this.codes(from),
      this.usage(from, today),
    ]);
    return {
      days,
      generatedAt: now.toISOString(),
      growth,
      revenue,
      codes,
      usage,
    };
  }

  private async growth(
    days: number,
    from: string,
    today: string,
  ): Promise<AdminMetrics["growth"]> {
    const before = addDays(from, -days);
    const weekAgo = addDays(today, -6);
    const monthAgo = addDays(today, -29);
    const lastCohortDay = addDays(today, -7);
    const [totals] = await this.rows(sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from workspaces) as workspaces,
        (select count(*)::int from users where created_at >= ${from}::date) as signups,
        (select count(*)::int from users where created_at >= ${before}::date and created_at < ${from}::date) as signups_before,
        (select count(distinct user_id)::int from activity_days where day = ${today}::date) as active_day,
        (select count(distinct user_id)::int from activity_days where day >= ${weekAgo}::date) as active_week,
        (select count(distinct user_id)::int from activity_days where day >= ${monthAgo}::date) as active_month,
        (select count(distinct user_id)::int from activity_days where day >= ${from}::date and source = 'web') as web,
        (select count(distinct user_id)::int from activity_days where day >= ${from}::date and source = 'mobile') as mobile,
        (select count(distinct user_id)::int from activity_days where day >= ${from}::date and source = 'cli') as cli
    `);
    const signups = await this.perDay(
      sql`select (created_at at time zone 'UTC')::date as day, count(*)::int as n from users where created_at >= ${from}::date group by 1`,
    );
    const active = await this.perDay(
      sql`select day, count(distinct user_id)::int as n from activity_days where day >= ${from}::date group by 1`,
    );
    const sources = await this.rows(sql`
      select coalesce(signup_ref, 'direct') as ref, count(*)::int as n
      from users where created_at >= ${from}::date
      group by 1 order by 2 desc, 1 limit 15
    `);
    const [cohort] = await this.rows(sql`
      select count(*)::int as cohort,
        count(*) filter (where exists (
          select 1 from activity_days a
          where a.user_id = u.id
            and a.day > (u.created_at at time zone 'UTC')::date
            and a.day <= (u.created_at at time zone 'UTC')::date + 7
        ))::int as returned
      from users u
      where u.created_at >= ${from}::date and (u.created_at at time zone 'UTC')::date <= ${lastCohortDay}::date
    `);
    return {
      users: num(totals?.users),
      workspaces: num(totals?.workspaces),
      signups: num(totals?.signups),
      signupsBefore: num(totals?.signups_before),
      active: {
        day: num(totals?.active_day),
        week: num(totals?.active_week),
        month: num(totals?.active_month),
      },
      bySource: {
        web: num(totals?.web),
        mobile: num(totals?.mobile),
        cli: num(totals?.cli),
      },
      series: dayRange(from, today).map((day) => ({
        day,
        signups: signups.get(day) ?? 0,
        active: active.get(day) ?? 0,
      })),
      weekOneReturn: {
        cohort: num(cohort?.cohort),
        returned: num(cohort?.returned),
      },
      signupSources: sources.map((r) => ({
        ref: String(r.ref),
        signups: num(r.n),
      })),
    };
  }

  private async revenue(
    from: string,
    today: string,
  ): Promise<AdminMetrics["revenue"]> {
    const paying = await this.payingWorkspaces();
    const [events] = await this.rows(sql`
      select
        count(*) filter (where kind = 'started')::int as started,
        count(*) filter (where kind = 'ended')::int as ended,
        count(*) filter (where kind = 'payment_failed')::int as failed
      from billing_events where created_at >= ${from}::date
    `);
    const started = await this.perDay(
      sql`select (created_at at time zone 'UTC')::date as day, count(*)::int as n from billing_events where kind = 'started' and created_at >= ${from}::date group by 1`,
    );
    const ended = await this.perDay(
      sql`select (created_at at time zone 'UTC')::date as day, count(*)::int as n from billing_events where kind = 'ended' and created_at >= ${from}::date group by 1`,
    );
    const [ws] = await this.rows(
      sql`select count(*)::int as n from workspaces`,
    );
    return {
      mrrCents: paying.reduce((sum, p) => sum + p.monthlyCents, 0),
      paying: paying.length,
      monthly: paying.filter((p) => p.interval === "month").length,
      yearly: paying.filter((p) => p.interval === "year").length,
      cancelScheduled: paying.filter((p) => p.cancelAtPeriodEnd).length,
      pastDue: paying.filter((p) => p.status === "past_due").length,
      started: num(events?.started),
      ended: num(events?.ended),
      paymentFailures: num(events?.failed),
      conversion: { workspaces: num(ws?.n), paying: paying.length },
      series: dayRange(from, today).map((day) => ({
        day,
        started: started.get(day) ?? 0,
        ended: ended.get(day) ?? 0,
      })),
    };
  }

  private async codes(from: string): Promise<AdminMetrics["codes"]> {
    const paying = await this.payingWorkspaces();
    const payingIds = new Set(paying.map((p) => p.workspaceId));
    const [counts] = await this.rows(sql`
      select
        (select count(*)::int from promo_redemptions where created_at >= ${from}::date) as redemptions,
        (select count(distinct workspace_id)::int from promo_redemptions where kind = 'free_pro' and pro_until > now()) as free_active,
        (select count(*)::int from users where student_pro_until > now()) as students
    `);
    const freeRedeemers = await this.rows(
      sql`select distinct workspace_id from promo_redemptions where kind = 'free_pro'`,
    );
    const byAudience = await this.rows(sql`
      select c.audience, count(*)::int as n
      from promo_redemptions r join promo_codes c on c.id = r.promo_code_id
      where r.created_at >= ${from}::date
      group by c.audience order by n desc
    `);
    const top = await this.rows(sql`
      select c.id, count(r.id) filter (where r.created_at >= ${from}::date)::int as in_range
      from promo_codes c left join promo_redemptions r on r.promo_code_id = c.id
      group by c.id
      order by c.redemption_count desc, c.created_at desc
      limit 10
    `);
    const topIds = top.map((t) => String(t.id));
    const codeRows = topIds.length
      ? await this.db
          .select()
          .from(promoCodes)
          .where(inArray(promoCodes.id, topIds))
      : [];
    const byId = new Map(codeRows.map((c) => [c.id, c]));
    return {
      redemptions: num(counts?.redemptions),
      freeActive: num(counts?.free_active),
      studentsActive: num(counts?.students),
      freeToPaid: {
        redeemed: freeRedeemers.length,
        nowPaying: freeRedeemers.filter((r) =>
          payingIds.has(String(r.workspace_id)),
        ).length,
      },
      discountMonthlyCents: paying.reduce(
        (sum, p) => sum + (p.listMonthlyCents - p.monthlyCents),
        0,
      ),
      byAudience: byAudience.map((r) => ({
        audience: String(r.audience),
        redemptions: num(r.n),
      })),
      top: top.flatMap((t) => {
        const c = byId.get(String(t.id));
        return c
          ? [
              {
                code: c.code,
                description: describeCode(c),
                audience: c.audience,
                enabled: c.enabled,
                uses: c.redemptionCount,
                usesInRange: num(t.in_range),
              },
            ]
          : [];
      }),
    };
  }

  private async usage(
    from: string,
    today: string,
  ): Promise<AdminMetrics["usage"]> {
    const totals = {} as Record<ItemKind, number>;
    const created = {} as Record<ItemKind, number>;
    const perKind = {} as Record<ItemKind, Map<string, number>>;
    for (const kind of KINDS) {
      const { table, live } = ITEM_SOURCES[kind];
      const t = sql.raw(table);
      const where = sql.raw(live);
      const [row] = await this.rows(sql`
        select count(*) filter (where ${where})::int as total,
               count(*) filter (where ${where} and created_at >= ${from}::date)::int as created
        from ${t}
      `);
      totals[kind] = num(row?.total);
      created[kind] = num(row?.created);
      perKind[kind] = await this.perDay(
        sql`select (created_at at time zone 'UTC')::date as day, count(*)::int as n from ${t} where ${where} and created_at >= ${from}::date group by 1`,
      );
    }
    const [row] = await this.rows(sql`
      select
        (select count(*)::int from pages where published_at is not null and deleted_at is null)
          + (select count(*)::int from canvases where published_at is not null and deleted_at is null)
          + (select count(*)::int from projects where published_at is not null and archived_at is null)
          + (select count(*)::int from notebooks where published_at is not null) as published,
        (select coalesce(sum(views), 0)::int from resource_views where hour >= ${from}::date) as views,
        (select coalesce(sum(visitors), 0)::int from resource_views where hour >= ${from}::date) as visitors,
        (select count(*)::int from resource_shares where created_at >= ${from}::date) as shares,
        (select count(distinct user_id)::int from activity_days where source = 'cli' and day >= ${from}::date) as cli_users,
        (select count(*)::int from cli_tokens where revoked_at is null and (expires_at is null or expires_at > now())) as cli_tokens
    `);
    return {
      totals,
      created,
      series: dayRange(from, today).map((day) => ({
        day,
        note: perKind.note.get(day) ?? 0,
        canvas: perKind.canvas.get(day) ?? 0,
        project: perKind.project.get(day) ?? 0,
        notebook: perKind.notebook.get(day) ?? 0,
      })),
      published: num(row?.published),
      views: num(row?.views),
      visitors: num(row?.visitors),
      shares: num(row?.shares),
      cliUsers: num(row?.cli_users),
      cliTokens: num(row?.cli_tokens),
    };
  }

  /**
   * Workspaces paying through Stripe right now, with what each pays per
   * month after its code's discount (yearly plans spread over 12 months).
   */
  private async payingWorkspaces() {
    const rows = await this.db
      .select({
        billing: workspaceBilling,
        code: promoCodes,
        redeemedAt: promoRedemptions.createdAt,
      })
      .from(workspaceBilling)
      .leftJoin(
        promoRedemptions,
        and(
          eq(promoRedemptions.workspaceId, workspaceBilling.workspaceId),
          eq(
            promoRedemptions.stripeSubscriptionId,
            workspaceBilling.stripeSubscriptionId,
          ),
        ),
      )
      .leftJoin(promoCodes, eq(promoCodes.id, promoRedemptions.promoCodeId))
      .where(
        and(
          eq(workspaceBilling.plan, "pro"),
          isNotNull(workspaceBilling.stripeSubscriptionId),
          inArray(workspaceBilling.status, PAID_STATUSES),
        ),
      );
    return rows.map(({ billing, code, redeemedAt }) => {
      const interval = billing.interval === "year" ? "year" : "month";
      const list = PRO_PRICE[interval] * 100;
      const paid = discountedCents(
        list,
        code && redeemedAt ? discountInForce(code, redeemedAt) : null,
      );
      const perMonth = (cents: number) =>
        interval === "year" ? Math.round(cents / 12) : cents;
      return {
        workspaceId: billing.workspaceId,
        interval,
        status: billing.status,
        cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
        listMonthlyCents: perMonth(list),
        monthlyCents: perMonth(paid),
      };
    });
  }

  /** Runs a raw query; postgres-js returns an array, PGlite (tests) `{ rows }`. */
  private async rows(query: SQL): Promise<Row[]> {
    const res = (await this.db.execute(query)) as unknown;
    return (
      Array.isArray(res) ? res : ((res as { rows?: Row[] }).rows ?? [])
    ) as Row[];
  }

  /** A `(day, n)` query as a map keyed by "YYYY-MM-DD". */
  private async perDay(query: SQL): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const r of await this.rows(query)) out.set(dayKey(r.day), num(r.n));
    return out;
  }
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDay(d);
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Postgres dates come back as "YYYY-MM-DD" strings or Date objects depending on the driver. */
function dayKey(v: unknown): string {
  return v instanceof Date ? utcDay(v) : String(v).slice(0, 10);
}
