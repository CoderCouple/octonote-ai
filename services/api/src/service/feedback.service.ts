/**
 * Bug reports and feature requests. Anyone signed in can send one; only staff
 * can read them (Admin → Feedback). Screenshots go in a private bucket and are
 * shown to staff through links that expire, because they can show private notes.
 */
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  generateId,
  type FeedbackCreate,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackList,
  type FeedbackStatus,
  type FeedbackUpdate,
} from "@octonote/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, count, desc, eq, gte, type SQL } from "drizzle-orm";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { AdminAuditService } from "../common/admin-audit.service";
import { EmailService } from "../common/email.service";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { BadRequest, NotFound, ServerError } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { feedbackItems } from "../db/schemas/feedback";
import { users } from "../db/schemas/users";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";

export const FEEDBACK_BUCKET = "feedback-screenshots";
const MAX_PER_HOUR = 10;
const LINK_SECONDS = 60 * 60;

/** Checks the file really is what it says, by its first bytes. */
function imageType(b: Buffer): { contentType: string; ext: string } | null {
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { contentType: "image/png", ext: "png" };
  if (b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { contentType: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
    return { contentType: "image/webp", ext: "webp" };
  return null;
}

type Row = typeof feedbackItems.$inferSelect;

function toItem(r: Row): FeedbackItem {
  const opt = (v: string | null) => v ?? undefined;
  return {
    id: r.id,
    kind: r.kind as FeedbackKind,
    status: r.status as FeedbackStatus,
    message: r.message,
    teamNote: r.teamNote,
    userId: r.userId,
    email: r.email,
    workspaceId: r.workspaceId,
    workspaceName: r.workspaceName,
    plan: r.plan,
    hasScreenshot: Boolean(r.screenshotPath),
    platform: opt(r.platform),
    appVersion: opt(r.appVersion),
    system: opt(r.system),
    device: opt(r.device),
    screen: opt(r.screen),
    page: opt(r.page),
    timeZone: opt(r.timeZone),
    city: opt(r.city),
    region: opt(r.region),
    country: opt(r.country),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly email: EmailService,
    private readonly planLimits: PlanLimitsService,
    private readonly audit: AdminAuditService,
  ) {}

  async create(userId: string, input: FeedbackCreate): Promise<{ id: string }> {
    const [recent] = await this.db
      .select({ n: count() })
      .from(feedbackItems)
      .where(and(eq(feedbackItems.userId, userId), gte(feedbackItems.createdAt, new Date(Date.now() - 3_600_000))));
    if ((recent?.n ?? 0) >= MAX_PER_HOUR) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        "That's a lot of reports in one hour. Please try again a little later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = generateId("fbk");
    let screenshotPath: string | null = null;
    if (input.screenshot) {
      const bytes = Buffer.from(input.screenshot.data, "base64");
      const type = imageType(bytes);
      if (!type) throw BadRequest("The screenshot must be a PNG, JPG or WebP image.");
      if (bytes.length > FEEDBACK_SCREENSHOT_MAX_BYTES) throw BadRequest("The screenshot must be under 5 MB.");
      screenshotPath = `${id}.${type.ext}`;
      const { error } = await this.supabase.storage
        .from(FEEDBACK_BUCKET)
        .upload(screenshotPath, bytes, { contentType: type.contentType });
      if (error) throw ServerError(`Screenshot upload failed: ${error.message}`);
    }

    const [user] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw NotFound("Account not found.");
    const workspace = input.workspaceId ? await this.memberWorkspace(userId, input.workspaceId) : null;
    const c = input.context;
    const [row] = await this.db
      .insert(feedbackItems)
      .values({
        id,
        userId,
        email: user.email,
        workspaceId: workspace?.id ?? null,
        workspaceName: workspace?.name ?? null,
        plan: workspace ? await this.planLimits.planOf(workspace.id) : null,
        kind: input.kind,
        message: input.message,
        screenshotPath,
        platform: c.platform ?? null,
        appVersion: c.appVersion ?? null,
        system: c.system ?? null,
        device: c.device ?? null,
        screen: c.screen ?? null,
        page: c.page ?? null,
        timeZone: c.timeZone ?? null,
        city: c.city ?? null,
        region: c.region ?? null,
        country: c.country ?? null,
      })
      .returning();

    // The report is saved; a failed heads-up email mustn't tell them it wasn't.
    await this.email
      .sendFeedbackNotification({
        id,
        kindLabel: FEEDBACK_KIND_LABEL[input.kind],
        message: input.message,
        fromEmail: user.email,
        hasScreenshot: Boolean(screenshotPath),
      })
      .catch((err: unknown) => this.logger.warn(`Feedback email failed for ${id}: ${String(err)}`));
    return { id: row!.id };
  }

  /** Only a workspace they belong to is recorded, whatever the client claims. */
  private async memberWorkspace(userId: string, workspaceId: string) {
    const [row] = await this.db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
      .limit(1);
    return row ?? null;
  }

  async list(filter: { status?: FeedbackStatus; kind?: FeedbackKind } = {}): Promise<FeedbackList> {
    const where: SQL[] = [];
    if (filter.status) where.push(eq(feedbackItems.status, filter.status));
    if (filter.kind) where.push(eq(feedbackItems.kind, filter.kind));
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(feedbackItems)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(feedbackItems.createdAt))
        .limit(200),
      this.db
        .select({ kind: feedbackItems.kind, status: feedbackItems.status, n: count() })
        .from(feedbackItems)
        .groupBy(feedbackItems.kind, feedbackItems.status),
    ]);
    const total = (match: (t: (typeof totals)[number]) => boolean) =>
      totals.filter(match).reduce((sum, t) => sum + t.n, 0);
    return {
      items: rows.map(toItem),
      counts: {
        newBugs: total((t) => t.status === "new" && t.kind === "bug"),
        newRequests: total((t) => t.status === "new" && t.kind === "feature"),
        planned: total((t) => t.status === "planned"),
      },
    };
  }

  async get(id: string): Promise<FeedbackItem> {
    const row = await this.row(id);
    let screenshotUrl: string | null = null;
    if (row.screenshotPath) {
      const { data, error } = await this.supabase.storage
        .from(FEEDBACK_BUCKET)
        .createSignedUrl(row.screenshotPath, LINK_SECONDS);
      if (error) this.logger.warn(`Screenshot link failed for ${id}: ${error.message}`);
      screenshotUrl = data?.signedUrl ?? null;
    }
    return { ...toItem(row), screenshotUrl };
  }

  async update(id: string, input: FeedbackUpdate, actorUserId: string): Promise<FeedbackItem> {
    const before = await this.row(id);
    await this.db
      .update(feedbackItems)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.teamNote !== undefined ? { teamNote: input.teamNote || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(feedbackItems.id, id));
    await this.audit.record(actorUserId, {
      action: "feedback.update",
      targetKind: "feedback",
      targetId: id,
      targetLabel: before.email,
      details: {
        ...(input.status ? { from: before.status, to: input.status } : {}),
        ...(input.teamNote !== undefined ? { noteChanged: true } : {}),
      },
    });
    return this.get(id);
  }

  private async row(id: string): Promise<Row> {
    const [row] = await this.db.select().from(feedbackItems).where(eq(feedbackItems.id, id)).limit(1);
    if (!row) throw NotFound("Report not found.");
    return row;
  }
}
