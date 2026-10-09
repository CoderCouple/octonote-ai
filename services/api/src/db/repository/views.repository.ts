import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { analyticsSalts, resourceViews, visitorHashes } from "../schemas/analytics";
import type { ResourceKind } from "../../model/sharing.model";

export type BucketUnit = "hour" | "day" | "week" | "month";

export interface Counts {
  views: number;
  visitors: number;
}

@Injectable()
export class ViewsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** +1 view (and +1 visitor when `newVisitor`) on the resource's counter for `hour`. */
  async record(kind: ResourceKind, id: string, hour: Date, newVisitor: boolean): Promise<void> {
    const visitors = newVisitor ? 1 : 0;
    await this.db
      .insert(resourceViews)
      .values({ resourceKind: kind, resourceId: id, hour, views: 1, visitors })
      .onConflictDoUpdate({
        target: [resourceViews.resourceKind, resourceViews.resourceId, resourceViews.hour],
        set: {
          views: sql`${resourceViews.views} + 1`,
          visitors: sql`${resourceViews.visitors} + ${visitors}`,
        },
      });
  }

  /**
   * The salt for `day` (YYYY-MM-DD, UTC), created on first use. Creating a new
   * day's salt deletes every older salt and hash, so nothing outlives its day.
   */
  async saltFor(day: string, fresh: () => string): Promise<string> {
    const existing = await this.db.select().from(analyticsSalts).where(eq(analyticsSalts.day, day));
    if (existing[0]) return existing[0].salt;
    await this.db.insert(analyticsSalts).values({ day, salt: fresh() }).onConflictDoNothing();
    await this.db.delete(analyticsSalts).where(lt(analyticsSalts.day, day));
    await this.db.delete(visitorHashes).where(lt(visitorHashes.day, day));
    const [row] = await this.db.select().from(analyticsSalts).where(eq(analyticsSalts.day, day));
    return row!.salt;
  }

  /** True the first time `hash` is seen on `day`. */
  async firstSighting(day: string, hash: string): Promise<boolean> {
    const rows = await this.db
      .insert(visitorHashes)
      .values({ day, hash })
      .onConflictDoNothing()
      .returning({ hash: visitorHashes.hash });
    return rows.length > 0;
  }

  /** Counts per bucket in [from, to), keyed by bucket start (UTC epoch ms). */
  async series(kind: ResourceKind, id: string, unit: BucketUnit, from: Date, to: Date): Promise<Map<number, Counts>> {
    const bucket = sql<number>`extract(epoch from date_trunc(${sql.raw(`'${unit}'`)}, ${resourceViews.hour} at time zone 'UTC')) * 1000`;
    const rows = await this.db
      .select({
        bucket,
        views: sql<number>`sum(${resourceViews.views})::int`,
        visitors: sql<number>`sum(${resourceViews.visitors})::int`,
      })
      .from(resourceViews)
      .where(this.within(kind, id, from, to))
      .groupBy(bucket);
    return new Map(rows.map((r) => [Number(r.bucket), { views: Number(r.views), visitors: Number(r.visitors) }]));
  }

  async total(kind: ResourceKind, id: string, from: Date, to: Date): Promise<Counts> {
    const [row] = await this.db
      .select(this.sums())
      .from(resourceViews)
      .where(this.within(kind, id, from, to));
    return { views: Number(row?.views ?? 0), visitors: Number(row?.visitors ?? 0) };
  }

  /** All-time counts and the most recent hour with any views. */
  async lifetime(kind: ResourceKind, id: string): Promise<Counts & { lastHour: Date | null }> {
    const [row] = await this.db
      .select({ ...this.sums(), lastHour: sql<Date | null>`max(${resourceViews.hour})` })
      .from(resourceViews)
      .where(and(eq(resourceViews.resourceKind, kind), eq(resourceViews.resourceId, id)));
    const last = row?.lastHour;
    return {
      views: Number(row?.views ?? 0),
      visitors: Number(row?.visitors ?? 0),
      lastHour: last ? new Date(last) : null,
    };
  }

  private sums() {
    return {
      views: sql<number>`coalesce(sum(${resourceViews.views}), 0)::int`,
      visitors: sql<number>`coalesce(sum(${resourceViews.visitors}), 0)::int`,
    };
  }

  private within(kind: ResourceKind, id: string, from: Date, to: Date) {
    return and(
      eq(resourceViews.resourceKind, kind),
      eq(resourceViews.resourceId, id),
      gte(resourceViews.hour, from),
      lt(resourceViews.hour, to),
    );
  }
}
