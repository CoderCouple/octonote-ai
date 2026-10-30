/**
 * Support access: a user grants Octonote support a read-only look at their
 * account (Settings → Privacy, 1 or 7 days); staff start short sessions
 * inside a grant, or override without one in an emergency (written reason,
 * the user is emailed). Sessions use `ons_…` bearer tokens that the auth
 * guards accept for reads only. Starts and ends go to the admin audit log;
 * each request a session makes is recorded too.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  SUPPORT_SESSION_MINUTES,
  SUPPORT_TOKEN_PREFIX,
  type AdminSupportStatus,
  type SupportAccessStatus,
  type SupportSessionInfo,
  type SupportSessionStartInput,
  type SupportSessionStarted,
  type SupportSessionSummary,
  type SupportSessionVia,
} from "@octonote/shared";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { AdminAuditService } from "../common/admin-audit.service";
import { EmailService } from "../common/email.service";
import { BadRequest, Forbidden, NotFound, ServerError } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { supportAccessGrants, supportSessionRequests, supportSessions } from "../db/schemas/support";
import { users } from "../db/schemas/users";
import { appUrl } from "./lib/resource-url";

export function isSupportToken(token: string) {
  return token.startsWith(SUPPORT_TOKEN_PREFIX);
}

function hashToken(plaintext: string) {
  return createHash("sha256").update(plaintext).digest("hex");
}

type SessionRow = typeof supportSessions.$inferSelect;
type UserRow = typeof users.$inferSelect;

function summary(row: SessionRow): SupportSessionSummary {
  return {
    id: row.id,
    via: row.via as SupportSessionVia,
    startedAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

@Injectable()
export class SupportAccessService {
  private readonly logger = new Logger(SupportAccessService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AdminAuditService,
    private readonly email: EmailService,
  ) {}

  // ---------- the user's side ----------

  private async activeGrant(userId: string) {
    const [row] = await this.db
      .select()
      .from(supportAccessGrants)
      .where(
        and(
          eq(supportAccessGrants.userId, userId),
          isNull(supportAccessGrants.revokedAt),
          gt(supportAccessGrants.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(supportAccessGrants.expiresAt))
      .limit(1);
    return row ?? null;
  }

  private async sessionsFor(userId: string, limit = 20) {
    return this.db
      .select()
      .from(supportSessions)
      .where(eq(supportSessions.targetUserId, userId))
      .orderBy(desc(supportSessions.createdAt))
      .limit(limit);
  }

  async status(userId: string): Promise<SupportAccessStatus> {
    const grant = await this.activeGrant(userId);
    const sessions = await this.sessionsFor(userId);
    return { grantedUntil: grant?.expiresAt.toISOString() ?? null, sessions: sessions.map(summary) };
  }

  /** Replaces any current grant. */
  async grant(userId: string, days: 1 | 7): Promise<SupportAccessStatus> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(supportAccessGrants)
        .set({ revokedAt: new Date() })
        .where(and(eq(supportAccessGrants.userId, userId), isNull(supportAccessGrants.revokedAt)));
      await tx.insert(supportAccessGrants).values({
        userId,
        expiresAt: new Date(Date.now() + days * 86_400_000),
      });
    });
    return this.status(userId);
  }

  /** Withdraws the grant and ends any session running on it, at once. */
  async revoke(userId: string): Promise<SupportAccessStatus> {
    const now = new Date();
    await this.db
      .update(supportAccessGrants)
      .set({ revokedAt: now })
      .where(and(eq(supportAccessGrants.userId, userId), isNull(supportAccessGrants.revokedAt)));
    await this.db
      .update(supportSessions)
      .set({ endedAt: now })
      .where(
        and(
          eq(supportSessions.targetUserId, userId),
          eq(supportSessions.via, "grant"),
          isNull(supportSessions.endedAt),
        ),
      );
    return this.status(userId);
  }

  // ---------- staff ----------

  async adminStatus(targetUserId: string): Promise<AdminSupportStatus> {
    const grant = await this.activeGrant(targetUserId);
    const rows = await this.db
      .select({ s: supportSessions, adminEmail: users.email })
      .from(supportSessions)
      .innerJoin(users, eq(users.id, supportSessions.adminUserId))
      .where(eq(supportSessions.targetUserId, targetUserId))
      .orderBy(desc(supportSessions.createdAt))
      .limit(20);
    const sessions = [];
    for (const { s, adminEmail } of rows) {
      const [c] = await this.db
        .select({ n: count() })
        .from(supportSessionRequests)
        .where(eq(supportSessionRequests.sessionId, s.id));
      sessions.push({ ...summary(s), adminEmail, reason: s.reason, requests: Number(c?.n ?? 0) });
    }
    return { grantedUntil: grant?.expiresAt.toISOString() ?? null, sessions };
  }

  async start(adminUserId: string, input: SupportSessionStartInput): Promise<SupportSessionStarted> {
    if (input.userId === adminUserId) throw BadRequest("That's your own account.");
    const [target] = await this.db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw NotFound("User not found.");

    const grant = await this.activeGrant(target.id);
    if (!grant && !input.override) {
      throw Forbidden("This person hasn't allowed support access.", { code: "SUPPORT_NO_GRANT" });
    }
    const via: SupportSessionVia = grant ? "grant" : "override";
    const now = new Date();
    let expiresAt = new Date(now.getTime() + SUPPORT_SESSION_MINUTES * 60_000);
    if (grant && grant.expiresAt < expiresAt) expiresAt = grant.expiresAt;

    // An override is only allowed if the user hears about it.
    if (via === "override") {
      try {
        await this.email.sendSupportAccessNotice({
          to: target.email,
          name: target.name || target.email,
          reason: input.reason,
          at: now,
          settingsUrl: `${appUrl()}/workspace/settings`,
        });
      } catch (err) {
        this.logger.error(`Support notice to ${target.id} failed: ${(err as Error).message}`);
        throw ServerError("Couldn't email the person, so the session wasn't started. Try again.");
      }
    }

    const plaintext = `${SUPPORT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const [row] = await this.db
      .insert(supportSessions)
      .values({
        tokenHash: hashToken(plaintext),
        adminUserId,
        targetUserId: target.id,
        grantId: grant?.id ?? null,
        via,
        reason: input.reason,
        createdAt: now,
        expiresAt,
      })
      .returning();
    await this.audit.record(adminUserId, {
      action: via === "override" ? "support.override" : "support.start",
      targetKind: "user",
      targetId: target.id,
      targetLabel: target.email,
      details: { sessionId: row!.id, reason: input.reason, expiresAt: expiresAt.toISOString() },
    });
    return { id: row!.id, token: plaintext, expiresAt: expiresAt.toISOString() };
  }

  /** Ends a session; staff end it from the portal, or the support tab's Exit. */
  async end(sessionId: string, actorUserId: string): Promise<void> {
    const [row] = await this.db.select().from(supportSessions).where(eq(supportSessions.id, sessionId)).limit(1);
    if (!row) throw NotFound("Session not found.");
    if (row.endedAt) return;
    await this.db.update(supportSessions).set({ endedAt: new Date() }).where(eq(supportSessions.id, sessionId));
    await this.audit.record(actorUserId, {
      action: "support.end",
      targetKind: "user",
      targetId: row.targetUserId,
      details: { sessionId },
    });
  }

  // ---------- the auth guards ----------

  /** The session and the person it views, if the token is live. */
  async verify(token: string): Promise<{ session: SessionRow; user: UserRow } | null> {
    if (!isSupportToken(token)) return null;
    const now = new Date();
    const [found] = await this.db
      .select({ session: supportSessions, user: users })
      .from(supportSessions)
      .innerJoin(users, eq(users.id, supportSessions.targetUserId))
      .where(
        and(
          eq(supportSessions.tokenHash, hashToken(token)),
          isNull(supportSessions.endedAt),
          gt(supportSessions.expiresAt, now),
        ),
      )
      .limit(1);
    if (!found) return null;
    // A session started on a grant stops when the grant is withdrawn.
    if (found.session.via === "grant" && !(await this.activeGrant(found.user.id))) return null;
    void this.db
      .update(supportSessions)
      .set({ lastUsedAt: now })
      .where(eq(supportSessions.id, found.session.id))
      .catch(() => undefined);
    return found;
  }

  /** Fire-and-forget: the record of what the session looked at. */
  logRequest(sessionId: string, method: string, path: string): void {
    void this.db
      .insert(supportSessionRequests)
      .values({ sessionId, method, path: path.slice(0, 500) })
      .catch((err: Error) => this.logger.warn(`support request log failed: ${err.message}`));
  }

  async info(sessionId: string): Promise<SupportSessionInfo> {
    const [row] = await this.db
      .select({ s: supportSessions, target: users })
      .from(supportSessions)
      .innerJoin(users, eq(users.id, supportSessions.targetUserId))
      .where(eq(supportSessions.id, sessionId))
      .limit(1);
    if (!row) throw NotFound("Session not found.");
    const [admin] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.s.adminUserId))
      .limit(1);
    return {
      id: row.s.id,
      via: row.s.via as SupportSessionVia,
      userName: row.target.name,
      userEmail: row.target.email,
      adminEmail: admin?.email ?? "",
      expiresAt: row.s.expiresAt.toISOString(),
    };
  }
}
