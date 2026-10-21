import { Inject, Injectable } from "@nestjs/common";
import type { AdminAuditEntry } from "@octonote/shared";
import { desc, eq, sql } from "drizzle-orm";
import { Database, DRIZZLE } from "../db/database.module";
import { adminAudit } from "../db/schemas/tracking";
import { users } from "../db/schemas/users";

export interface AuditInput {
  action: string;
  targetKind?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}

/** The admin portal's audit log: every change an admin makes, newest first. */
@Injectable()
export class AdminAuditService {
  /** The last time handed out, so two entries never share one (see record). */
  private lastAt = 0;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Every entry gets its own millisecond: two changes in the same instant would
   * otherwise share a time, so their order (and paging) would be a coin toss.
   */
  private nextTime(): Date {
    this.lastAt = Math.max(Date.now(), this.lastAt + 1);
    return new Date(this.lastAt);
  }

  async record(actorUserId: string, entry: AuditInput, db: Database = this.db): Promise<void> {
    const [actor] = await db.select({ email: users.email }).from(users).where(eq(users.id, actorUserId)).limit(1);
    await db.insert(adminAudit).values({
      actorUserId,
      actorEmail: actor?.email ?? actorUserId,
      action: entry.action,
      targetKind: entry.targetKind ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      details: entry.details ?? null,
      createdAt: this.nextTime(),
    });
  }

  /**
   * A page of entries older than `before`, newest first. `before` is the last
   * entry's `cursor`: its time exactly as Postgres stores it (to the
   * microsecond), so paging never skips or repeats an entry.
   */
  async list(limit = 50, before?: string): Promise<AdminAuditEntry[]> {
    const rows = await this.db
      .select({
        row: adminAudit,
        cursor: sql<string>`to_char(${adminAudit.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(adminAudit)
      .where(before ? sql`${adminAudit.createdAt} < ${before}::timestamptz` : undefined)
      .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
      .limit(limit);
    return rows.map(({ row: r, cursor }) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      action: r.action,
      targetKind: r.targetKind,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      details: (r.details as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
      cursor,
    }));
  }
}
