/**
 * Admin → Explore: one measure of one dataset, grouped by a dimension and
 * optionally split by a second, with filters — the engine behind slice,
 * dice, drill down (add a filter, group by the next dimension) and roll up
 * (time by day → week → month, or drop a filter).
 *
 * Database datasets are a `base` subquery with plain columns (t, uid and
 * one column per dimension); traffic is the same shape in HogQL over
 * PostHog events. Dataset, measure and dimension names come only from
 * EXPLORE_DATASETS, so the only free text that reaches a query is filter
 * values — bound parameters in SQL, escaped literals in HogQL.
 */
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  EXPLORE_DATASETS,
  EXPLORE_RANGES,
  type ExploreFilter,
  type ExploreQuery,
  type ExploreResult,
} from "@octonote/shared";
import { sql, type SQL } from "drizzle-orm";
import { staffUserIds } from "../common/staff";
import { Database, DRIZZLE } from "../db/database.module";
import { AdminTrafficService, PATH_EXPR } from "./admin-traffic.service";

const MAX_GROUPS = 50;
const MAX_SPLITS = 6;
const OTHER = "Other";
const GRANULARITIES = ["day", "week", "month"] as const;

type Cell = { group: string; split: string | null; value: number };

/** The rows of each database dataset; every dimension column is non-null text. */
const BASES: Record<string, SQL> = {
  signups: sql`
    select u.created_at as t, u.id as uid,
      coalesce(split_part(u.signup_ref, ':', 1), 'direct') as source,
      coalesce(u.signup_ref, 'direct') as source_detail,
      split_part(lower(u.email), '@', 2) as email_domain,
      case when u.student_pro_until is not null then 'Student' else 'Not a student' end as student,
      case when exists (select 1 from pages p where p.created_by_user_id = u.id)
             or exists (select 1 from canvases c where c.created_by_user_id = u.id)
           then 'Made something' else 'Nothing yet' end as activated,
      case when exists (select 1 from activity_days a where a.user_id = u.id
                        and a.day > (u.created_at at time zone 'UTC')::date)
           then 'Came back' else 'Not yet' end as returned
    from users u`,
  activity: sql`
    select a.day::timestamptz as t, a.user_id as uid, a.source as app,
      case when u.student_pro_until is not null then 'Student' else 'Not a student' end as student
    from activity_days a join users u on u.id = a.user_id`,
  items: sql`
    select created_at as t, created_by_user_id as uid, 'Note' as kind,
      case when project_id is not null then 'In a project' when notebook_id is not null then 'In a notebook' else 'Standalone' end as place,
      case when published_at is not null then 'Published' else 'Private' end as published
    from pages where deleted_at is null
    union all
    select created_at, created_by_user_id, 'Canvas',
      case when project_id is not null then 'In a project' when notebook_id is not null then 'In a notebook' else 'Standalone' end,
      case when published_at is not null then 'Published' else 'Private' end
    from canvases where deleted_at is null
    union all
    select created_at, created_by_user_id, 'Project',
      case when notebook_id is not null then 'In a notebook' else 'Standalone' end,
      case when published_at is not null then 'Published' else 'Private' end
    from projects where archived_at is null
    union all
    select created_at, created_by_user_id, 'Notebook', 'Standalone',
      case when published_at is not null then 'Published' else 'Private' end
    from notebooks`,
  reads: sql`
    select rv.hour as t, null::text as uid, rv.views, rv.visitors,
      case rv.resource_kind when 'page' then 'Note' when 'canvas' then 'Canvas' when 'project' then 'Project' else 'Notebook' end as kind,
      coalesce(
        (select title from pages where id = rv.resource_id),
        (select title from canvases where id = rv.resource_id),
        (select name from projects where id = rv.resource_id),
        (select name from notebooks where id = rv.resource_id),
        rv.resource_id) as item
    from resource_views rv`,
};

const MEASURES_SQL: Record<string, string> = {
  signups: "count(*)",
  people: "count(distinct uid)",
  active_days: "count(*)",
  items: "count(*)",
  views: "coalesce(sum(views), 0)",
  visitors: "coalesce(sum(visitors), 0)",
};

/** HogQL for traffic: the events behind each measure, and each dimension's expression. */
const TRAFFIC_MEASURES: Record<string, { event: string; agg: string }> = {
  visits: { event: "$pageview", agg: "count(distinct properties.$session_id)" },
  pageviews: { event: "$pageview", agg: "count()" },
  signup_clicks: { event: "signup_clicked", agg: "count()" },
};
const TRAFFIC_DIMS: Record<string, string> = {
  section: `concat('/', splitByChar('/', coalesce(properties.$pathname, '/'))[2])`,
  path: `coalesce(${PATH_EXPR}, '?')`,
  referrer: `if(coalesce(properties.$referring_domain, '') in ('', '$direct'), 'Direct', properties.$referring_domain)`,
  utm_source: `coalesce(nullIf(toString(properties.utm_source), ''), '(none)')`,
  country: `coalesce(properties.$geoip_country_name, '?')`,
  device: `coalesce(properties.$device_type, '?')`,
  browser: `coalesce(properties.$browser, '?')`,
  os: `coalesce(properties.$os, '?')`,
};

@Injectable()
export class AdminExploreService {
  private readonly log = new Logger(AdminExploreService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly traffic: AdminTrafficService,
  ) {}

  async explore(q: ExploreQuery, now = new Date()): Promise<ExploreResult> {
    const query = this.validate(q);
    const result: ExploreResult = { query, generatedAt: now.toISOString(), groups: [], splits: [], cells: [], total: 0 };
    try {
      const { cells, total } = query.dataset === "traffic" ? await this.fromPostHog(query) : await this.fromDatabase(query, now);
      return { ...result, ...shape(cells, total, query, now) };
    } catch (err) {
      this.log.warn(`Explore failed: ${(err as Error).message}`);
      return {
        ...result,
        error: query.dataset === "traffic" ? "PostHog couldn't be reached. Try again in a minute." : "This view couldn't be loaded.",
      };
    }
  }

  private validate(q: ExploreQuery): ExploreQuery {
    const bad = (m: string) => new BadRequestException(m);
    const ds = EXPLORE_DATASETS.find((d) => d.key === q?.dataset);
    if (!ds) throw bad("Unknown dataset.");
    if (!ds.measures.some((m) => m.key === q.measure)) throw bad("Unknown measure.");
    const dims = new Set(ds.dimensions.map((d) => d.key));
    if (!dims.has(q.groupBy)) throw bad("Unknown dimension.");
    const splitBy = q.splitBy || null;
    if (splitBy && (!dims.has(splitBy) || splitBy === "time" || splitBy === q.groupBy)) throw bad("Unknown split.");
    if (!GRANULARITIES.includes(q.granularity)) throw bad("Unknown granularity.");
    if (!(EXPLORE_RANGES as readonly number[]).includes(q.days)) throw bad("Unknown range.");
    const filters = (q.filters ?? []).slice(0, 8).map((f): ExploreFilter => {
      if (!dims.has(f.dim) || f.dim === "time" || !["eq", "neq"].includes(f.op) || typeof f.value !== "string" || f.value.length > 300)
        throw bad("Bad filter.");
      return { dim: f.dim, op: f.op, value: f.value };
    });
    return { dataset: ds.key, measure: q.measure, groupBy: q.groupBy, splitBy, granularity: q.granularity, days: q.days, excludeStaff: Boolean(q.excludeStaff), filters };
  }

  private async fromDatabase(q: ExploreQuery, now: Date): Promise<{ cells: Cell[]; total: number }> {
    const from = new Date(now.getTime() - q.days * 86_400_000);
    const col = (dim: string) =>
      dim === "time" ? sql`to_char(date_trunc(${q.granularity}, t at time zone 'UTC'), 'YYYY-MM-DD')` : sql.raw(`"${dim}"`);
    const where: SQL[] = [sql`t >= ${from.toISOString()}::timestamptz`];
    for (const f of q.filters) where.push(f.op === "eq" ? sql`${col(f.dim)} = ${f.value}` : sql`${col(f.dim)} <> ${f.value}`);
    if (q.excludeStaff) where.push(sql`(uid is null or uid not in ${staffUserIds()})`);
    const cond = sql.join(where, sql` and `);
    const measure = sql.raw(MEASURES_SQL[q.measure]!);
    const base = BASES[q.dataset]!;
    const split = q.splitBy ? col(q.splitBy) : sql`null::text`;
    const rows = await this.rows(
      sql`select ${col(q.groupBy)} as g, ${split} as s, ${measure} as v from (${base}) b where ${cond} group by 1, 2`,
    );
    const [tot] = await this.rows(sql`select ${measure} as v from (${base}) b where ${cond}`);
    return {
      cells: rows.map((r) => ({ group: String(r.g), split: r.s == null ? null : String(r.s), value: num(r.v) })),
      total: num(tot?.v),
    };
  }

  private async fromPostHog(q: ExploreQuery): Promise<{ cells: Cell[]; total: number }> {
    if (!this.traffic.configured) throw new Error("PostHog read key not set");
    const m = TRAFFIC_MEASURES[q.measure]!;
    const expr = (dim: string) => {
      if (dim !== "time") return TRAFFIC_DIMS[dim]!;
      const start = q.granularity === "day" ? "toStartOfDay(timestamp)" : q.granularity === "week" ? "toStartOfWeek(timestamp, 1)" : "toStartOfMonth(timestamp)";
      return `toString(toDate(${start}))`;
    };
    const where = [`event = '${m.event}'`, `timestamp > now() - interval ${Math.trunc(q.days)} day`];
    for (const f of q.filters) where.push(`${expr(f.dim)} ${f.op === "eq" ? "=" : "!="} ${hogString(f.value)}`);
    const cond = where.join(" and ") + (await this.traffic.staffClause(q.excludeStaff));
    const split = q.splitBy ? expr(q.splitBy) : "null";
    const [rows, tot] = await Promise.all([
      this.traffic.hogql(`select ${expr(q.groupBy)} as g, ${split} as s, ${m.agg} as v from events where ${cond} group by g, s`),
      this.traffic.hogql(`select ${m.agg} from events where ${cond}`),
    ]);
    return {
      cells: rows.map((r) => ({ group: String(r[0] ?? "?"), split: r[1] == null ? null : String(r[1]), value: num(r[2]) })),
      total: num(tot[0]?.[0]),
    };
  }

  /** Runs a raw query; postgres-js returns an array, PGlite (tests) `{ rows }`. */
  private async rows(query: SQL): Promise<Record<string, unknown>[]> {
    const res = (await this.db.execute(query)) as unknown;
    return (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];
  }
}

/**
 * Orders groups (time ascending with empty buckets filled in, otherwise
 * largest first, capped) and folds small split values into "Other".
 */
function shape(cells: Cell[], total: number, q: ExploreQuery, now: Date): Omit<ExploreResult, "query" | "generatedAt"> {
  let splits: string[] = [];
  if (q.splitBy) {
    const bySplit = sum(cells, (c) => c.split ?? "?");
    const ranked = [...bySplit.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const keep = new Set(ranked.slice(0, MAX_SPLITS));
    cells = mergeCells(cells.map((c) => ({ ...c, split: keep.has(c.split ?? "?") ? (c.split ?? "?") : OTHER })));
    splits = ranked.slice(0, MAX_SPLITS);
    if (ranked.length > MAX_SPLITS) splits.push(OTHER);
  }
  let groups: string[];
  let truncated = false;
  if (q.groupBy === "time") {
    groups = timeBuckets(q.granularity, q.days, now);
    const known = new Set(groups);
    for (const c of cells) if (!known.has(c.group)) groups.push(c.group);
    groups.sort();
  } else {
    const byGroup = sum(cells, (c) => c.group);
    groups = [...byGroup.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    if (groups.length > MAX_GROUPS) {
      truncated = true;
      const keep = new Set(groups.slice(0, MAX_GROUPS));
      cells = cells.filter((c) => keep.has(c.group));
      groups = groups.slice(0, MAX_GROUPS);
    }
  }
  return { groups, splits, cells, total, ...(truncated ? { truncated } : {}) };
}

function sum(cells: Cell[], key: (c: Cell) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cells) out.set(key(c), (out.get(key(c)) ?? 0) + c.value);
  return out;
}

function mergeCells(cells: Cell[]): Cell[] {
  const out = new Map<string, Cell>();
  for (const c of cells) {
    const k = `${c.group}\u0000${c.split}`;
    const prev = out.get(k);
    out.set(k, prev ? { ...prev, value: prev.value + c.value } : c);
  }
  return [...out.values()];
}

/** Every bucket start ("YYYY-MM-DD") from the range start to today. Weeks start on Monday. */
export function timeBuckets(granularity: ExploreQuery["granularity"], days: number, now: Date): string[] {
  const start = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (granularity === "week") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    if (granularity === "month") x.setUTCDate(1);
    return x;
  };
  const out: string[] = [];
  const end = start(now);
  for (let d = start(new Date(now.getTime() - (days - 1) * 86_400_000)); d <= end; ) {
    out.push(d.toISOString().slice(0, 10));
    if (granularity === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (granularity === "week") d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** A HogQL string literal. */
function hogString(v: string): string {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}
