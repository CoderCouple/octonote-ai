/**
 * Website traffic for the admin dashboard, read from PostHog with a
 * personal API key that can only query (POSTHOG_PERSONAL_API_KEY,
 * POSTHOG_PROJECT_ID, optional POSTHOG_API_HOST). The key stays on the
 * server. Results are cached for a few minutes: PostHog queries are slow
 * and the numbers don't need to be live.
 *
 * Staff: a visit (PostHog session) is staff when any event in it was sent
 * as a staff user (they're identified once signed in), so their anonymous
 * home-page views in the same visit drop out too. Visits from before a
 * browser was marked as staff can't be told apart.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AdminTraffic } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { staffUserIds } from "../common/staff";
import { Database, DRIZZLE } from "../db/database.module";

const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 20_000;

export interface PostHogReadConfig {
  key: string | null;
  projectId: string | null;
  host: string;
}

export function postHogReadConfigFromEnv(): PostHogReadConfig {
  return {
    key: process.env.POSTHOG_PERSONAL_API_KEY?.trim() || null,
    projectId: process.env.POSTHOG_PROJECT_ID?.trim() || null,
    host: (process.env.POSTHOG_API_HOST?.trim() || "https://us.posthog.com").replace(/\/$/, ""),
  };
}

export type HogRows = unknown[][];

/** Collapses ids in paths so pages group: /n/pag_… → /n/:id. */
export const PATH_EXPR = `replaceRegexpAll(properties.$pathname, '(pag|cnv|prj|ntb|fig|usr|wsp)_[0-9a-zA-Z-]+', ':id')`;

@Injectable()
export class AdminTrafficService {
  private readonly log = new Logger(AdminTrafficService.name);
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private readonly config = postHogReadConfigFromEnv();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  get configured(): boolean {
    return Boolean(this.config.key && this.config.projectId);
  }

  /** Runs a HogQL query (cached by its text). */
  async hogql(query: string): Promise<HogRows> {
    const hit = this.cache.get(query);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as HogRows;
    const res = await fetch(`${this.config.host}/api/projects/${this.config.projectId}/query/`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.key}`, "content-type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`PostHog answered ${res.status}`);
    const body = (await res.json()) as { results?: HogRows };
    const rows = body.results ?? [];
    this.cache.set(query, { at: Date.now(), value: rows });
    return rows;
  }

  /**
   * `and …` that leaves out staff visits, or "" when staff count. Staff ids
   * come from our database; they're `usr_<uuid>`, checked before use.
   */
  async staffClause(excludeStaff: boolean): Promise<string> {
    if (!excludeStaff) return "";
    const res = (await this.db.execute(sql`select id from ${staffUserIds()} s`)) as unknown;
    const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as { id: string }[];
    const ids = rows.map((r) => r.id).filter((id) => /^usr_[0-9a-f-]+$/i.test(id));
    if (!ids.length) return "";
    const list = ids.map((id) => `'${id}'`).join(", ");
    return ` and properties.$session_id not in (select properties.$session_id from events where distinct_id in (${list}) and timestamp > now() - interval 120 day and properties.$session_id is not null)`;
  }

  async traffic(days: number, excludeStaff: boolean, now = new Date()): Promise<AdminTraffic> {
    const base: AdminTraffic = {
      days,
      generatedAt: now.toISOString(),
      excludeStaff,
      configured: this.configured,
      visits: 0,
      pageviews: 0,
      signupClicks: 0,
      signupPageVisits: 0,
      series: [],
      topPages: [],
      referrers: [],
      countries: [],
      devices: [],
    };
    if (!this.configured) return base;
    try {
      const staff = await this.staffClause(excludeStaff);
      const range = `timestamp > now() - interval ${Math.trunc(days)} day`;
      const views = `event = '$pageview' and ${range}${staff}`;
      const session = "properties.$session_id";
      const [totals, clicks, series, pages, refs, countries, devices] = await Promise.all([
        this.hogql(`select count(distinct ${session}), count(), countIf(properties.$pathname = '/signup') from events where ${views}`),
        this.hogql(`select count() from events where event = 'signup_clicked' and ${range}${staff}`),
        this.hogql(`select toDate(timestamp) d, count(distinct ${session}), count() from events where ${views} group by d order by d`),
        this.hogql(`select ${PATH_EXPR} p, count(distinct ${session}) v from events where ${views} group by p order by v desc limit 15`),
        this.hogql(`select coalesce(nullIf(properties.$referring_domain, ''), '$direct') r, count(distinct ${session}) v from events where ${views} group by r order by v desc limit 12`),
        this.hogql(`select coalesce(properties.$geoip_country_code, '?') c, count(distinct ${session}) v from events where ${views} group by c order by v desc limit 10`),
        this.hogql(`select coalesce(properties.$device_type, '?') t, count(distinct ${session}) v from events where ${views} group by t order by v desc limit 5`),
      ]);
      const signupVisits = await this.hogql(
        `select count(distinct ${session}) from events where ${views} and properties.$pathname = '/signup'`,
      );
      const byDay = new Map(series.map((r) => [String(r[0]).slice(0, 10), r]));
      const today = now.toISOString().slice(0, 10);
      return {
        ...base,
        visits: num(totals[0]?.[0]),
        pageviews: num(totals[0]?.[1]),
        signupClicks: num(clicks[0]?.[0]),
        signupPageVisits: num(signupVisits[0]?.[0]),
        series: dayRange(addDays(today, -(days - 1)), today).map((day) => ({
          day,
          visits: num(byDay.get(day)?.[1]),
          pageviews: num(byDay.get(day)?.[2]),
        })),
        topPages: pages.map((r) => ({ path: String(r[0] ?? "?"), visits: num(r[1]) })),
        referrers: refs.map((r) => ({ domain: String(r[0]) === "$direct" ? "Direct" : String(r[0]), visits: num(r[1]) })),
        countries: countries.map((r) => ({ country: String(r[0]), visits: num(r[1]) })),
        devices: devices.map((r) => ({ device: String(r[0]), visits: num(r[1]) })),
      };
    } catch (err) {
      this.log.warn(`PostHog traffic failed: ${(err as Error).message}`);
      return { ...base, error: "PostHog couldn't be reached. Try again in a minute." };
    }
  }
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
