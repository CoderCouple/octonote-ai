import { Inject, Injectable } from "@nestjs/common";
import type { AdminAuditEntry } from "@octonote/shared";
import { desc, eq, lt } from "drizzle-orm";
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
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
    });
  }

  /** A page of entries older than `before` (ISO time), newest first. */
  async list(limit = 50, before?: string): Promise<AdminAuditEntry[]> {
    const rows = await this.db
      .select()
      .from(adminAudit)
      .where(before ? lt(adminAudit.createdAt, new Date(before)) : undefined)
      .orderBy(desc(adminAudit.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      action: r.action,
      targetKind: r.targetKind,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      details: (r.details as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
