import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PermissionsService, type Role } from "../common/permissions.service";
import { ViewsRepository, type BucketUnit } from "../db/repository/views.repository";
import type { ResourceKind } from "../model/sharing.model";

export type AnalyticsRange = "24h" | "7d" | "30d" | "6mo" | "1y";

const RANGES: Record<AnalyticsRange, { unit: BucketUnit; count: number }> = {
  "24h": { unit: "hour", count: 24 },
  "7d": { unit: "day", count: 7 },
  "30d": { unit: "day", count: 30 },
  "6mo": { unit: "week", count: 26 },
  "1y": { unit: "month", count: 12 },
};

/** Link-preview fetchers, crawlers and uptime checks shouldn't count as readers. */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|slack|skype|vkshare|pinterest|bitly/i;

const EDITOR_ROLES = new Set<Role>(["owner", "editor"]);

export interface AnalyticsBucket {
  start: Date;
  views: number;
  /** People seen for the first time that UTC day. */
  visitors: number;
}

export interface Analytics {
  range: AnalyticsRange;
  unit: BucketUnit;
  buckets: AnalyticsBucket[];
  total: number;
  visitors: number;
  /** Same-length period immediately before this one. */
  previousTotal: number;
  previousVisitors: number;
  allTime: number;
  allTimeVisitors: number;
  lastViewedAt: Date | null;
}

/** Who opened a published page, as far as the counter needs to know. */
export interface Visit {
  userAgent: string | undefined;
  /** Client IP — used only to compute today's anonymous hash, never stored. */
  ip: string | undefined;
  /** Signed-in reader, if any. */
  userId: string | null;
}

/** UTC start of the bucket containing `d` (weeks start Monday, like Postgres). */
export function truncUtc(d: Date, unit: BucketUnit): Date {
  const t = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
    ),
  );
  if (unit === "hour") return t;
  t.setUTCHours(0);
  if (unit === "day") return t;
  if (unit === "week") {
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t;
  }
  t.setUTCDate(1);
  return t;
}

export function stepUtc(d: Date, unit: BucketUnit, n: number): Date {
  const t = new Date(d);
  if (unit === "hour") t.setUTCHours(t.getUTCHours() + n);
  else if (unit === "day") t.setUTCDate(t.getUTCDate() + n);
  else if (unit === "week") t.setUTCDate(t.getUTCDate() + 7 * n);
  else t.setUTCMonth(t.getUTCMonth() + n);
  return t;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly views: ViewsRepository,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Counts one view of a published item. Bots are ignored, and so are the
   * item's own owners and editors. Unique visitors use the Plausible approach:
   * a hash of today's secret salt + the item + the reader (account id when
   * signed in, else IP + browser), kept for today only. Nothing that
   * identifies the reader is stored.
   */
  async recordView(kind: ResourceKind, id: string, visit: Visit, now = new Date()): Promise<void> {
    const ua = visit.userAgent;
    if (!ua || BOT_UA.test(ua)) return;
    if (visit.userId && (await this.canEdit(visit.userId, kind, id))) return;

    const reader = visit.userId ? `u:${visit.userId}` : visit.ip ? `a:${visit.ip}|${ua}` : null;
    let newVisitor = false;
    if (reader) {
      const day = now.toISOString().slice(0, 10);
      const salt = await this.views.saltFor(day, () => randomBytes(32).toString("hex"));
      const hash = createHash("sha256").update(`${salt}|${kind}|${id}|${reader}`).digest("hex");
      newVisitor = await this.views.firstSighting(day, hash);
    }
    await this.views.record(kind, id, truncUtc(now, "hour"), newVisitor);
  }

  /** Owners and editors only — view counts aren't for viewers or the public. */
  async get(
    userId: string,
    kind: ResourceKind,
    id: string,
    range: AnalyticsRange,
    now = new Date(),
  ): Promise<Analytics> {
    await this.permissions.require(userId, { kind, id }, "edit");
    const { unit, count } = RANGES[range];
    const end = stepUtc(truncUtc(now, unit), unit, 1);
    const start = stepUtc(end, unit, -count);
    const prevStart = stepUtc(start, unit, -count);
    const [series, previous, life] = await Promise.all([
      this.views.series(kind, id, unit, start, end),
      this.views.total(kind, id, prevStart, start),
      this.views.lifetime(kind, id),
    ]);
    const buckets = Array.from({ length: count }, (_, i) => {
      const s = stepUtc(start, unit, i);
      const c = series.get(s.getTime());
      return { start: s, views: c?.views ?? 0, visitors: c?.visitors ?? 0 };
    });
    return {
      range,
      unit,
      buckets,
      total: buckets.reduce((a, b) => a + b.views, 0),
      visitors: buckets.reduce((a, b) => a + b.visitors, 0),
      previousTotal: previous.views,
      previousVisitors: previous.visitors,
      allTime: life.views,
      allTimeVisitors: life.visitors,
      lastViewedAt: life.lastHour,
    };
  }

  private async canEdit(userId: string, kind: ResourceKind, id: string): Promise<boolean> {
    try {
      return EDITOR_ROLES.has((await this.permissions.resolve(userId, { kind, id })).role);
    } catch {
      return false;
    }
  }
}
