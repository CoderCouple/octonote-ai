/**
 * The follow-ups CRM (Admin → Inbox), layer 1: where each person stands, the
 * conversations staff log with them, follow-ups, and a timeline that also
 * shows what we already know (signed up, first note, codes, payments) — read
 * from those tables, never copied. Staff only; nothing here reaches users.
 *
 * Status moves on its own in one case: logging the first conversation with
 * someone still "new" makes them "contacted". The rest staff set by hand.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  CRM_STATUSES,
  PARTNER_KIND_LABELS,
  type AdminPlan,
  type CrmContactUpdate,
  type CrmEmailInput,
  type CrmEntryKind,
  type CrmFollowup,
  type CrmFollowupCreate,
  type CrmFollowupUpdate,
  type CrmLogInput,
  type CrmOverview,
  type CrmPersonDetail,
  type CrmPersonRow,
  type CrmStatus,
  type CrmTimelineItem,
  type PartnerKind,
} from "@octonote/shared";
import { generateId } from "@octonote/shared";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { AdminAuditService } from "../common/admin-audit.service";
import {
  CRM_MAILER,
  emailOf,
  entryIdFromAddresses,
  htmlToText,
  renderCrmEmail,
  replyAddressFor,
  trimQuotedReply,
  type CrmMailer,
} from "../common/crm-mailer";
import { BadRequest, NotFound, ServerError, Unauthorized } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { crmContacts, crmEntries, crmFollowups } from "../db/schemas/crm";
import { users } from "../db/schemas/users";

type Row = Record<string, unknown>;
const LOGGED_KINDS = ["note", "linkedin", "call", "whatsapp", "meeting"];

/** "pub:some-page" → "Published page"; null → "Direct". Partners are named separately. */
function sourceOf(ref: string | null, partnerName: string | null, partnerKind: string | null): string {
  if (partnerName) return `${partnerName} (${PARTNER_KIND_LABELS[(partnerKind ?? "creator") as PartnerKind].toLowerCase()})`;
  if (!ref) return "Direct";
  if (ref === "pub" || ref.startsWith("pub:") || ref.startsWith("pub-")) return "Published page";
  return ref;
}

const preview = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 160);

@Injectable()
export class AdminCrmService {
  private readonly logger = new Logger(AdminCrmService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly planLimits: PlanLimitsService,
    private readonly audit: AdminAuditService,
    @Inject(CRM_MAILER) private readonly mailer: CrmMailer,
  ) {}

  /** Everyone who signed up (not staff), newest first, with what the Inbox list needs. */
  async people(): Promise<CrmPersonRow[]> {
    const rows = await this.rows(sql`
      select u.id, u.name, u.email, u.created_at, u.signup_ref,
        p.name as partner_name, p.kind as partner_kind,
        coalesce(c.status, 'new') as status, c.last_seen_at, c.owner_user_id, o.name as owner_name,
        (select max(occurred_at) from crm_entries y where y.user_id = u.id and y.kind = 'email_in') as last_in,
        e.kind as last_kind, e.subject as last_subject, e.body as last_body, e.occurred_at as last_at,
        exists (select 1 from crm_entries x where x.user_id = u.id and x.kind = 'email_out') as emailed,
        f.id as f_id, f.due_on::text as f_due, f.note as f_note, f.assigned_to_user_id as f_to, a.name as f_to_name
      from users u
      left join crm_contacts c on c.user_id = u.id
      left join users o on o.id = c.owner_user_id
      left join partner_referrals r on r.user_id = u.id
      left join partners p on p.id = r.partner_id
      left join lateral (
        select kind, subject, body, occurred_at from crm_entries
        where user_id = u.id order by occurred_at desc, created_at desc limit 1
      ) e on true
      left join lateral (
        select id, due_on, note, assigned_to_user_id from crm_followups
        where user_id = u.id and done_at is null order by due_on, created_at limit 1
      ) f on true
      left join users a on a.id = f.assigned_to_user_id
      where u.is_admin = false
      order by u.created_at desc
    `);
    return rows.map((r) => ({
      user: { id: String(r.id), name: String(r.name), email: String(r.email) },
      joinedAt: new Date(r.created_at as string).toISOString(),
      source: sourceOf(r.signup_ref as string | null, r.partner_name as string | null, r.partner_kind as string | null),
      status: r.status as CrmStatus,
      last: r.last_kind
        ? {
            kind: r.last_kind as CrmEntryKind,
            title: (r.last_subject as string | null) ?? "",
            preview: preview(String(r.last_body ?? "")),
            at: new Date(r.last_at as string).toISOString(),
          }
        : { kind: "event", title: "Signed up", preview: "", at: new Date(r.created_at as string).toISOString() },
      nextFollowup: r.f_id
        ? {
            id: String(r.f_id),
            dueOn: String(r.f_due),
            note: String(r.f_note),
            assignedTo: r.f_to ? { id: String(r.f_to), name: String(r.f_to_name) } : null,
            doneAt: null,
          }
        : null,
      contacted: Boolean(r.last_kind),
      emailed: Boolean(r.emailed),
      needsReply: r.last_kind === "email_in",
      owner: r.owner_user_id ? { id: String(r.owner_user_id), name: String(r.owner_name) } : null,
      unread: Boolean(r.last_in) && (!r.last_seen_at || new Date(r.last_in as string) > new Date(r.last_seen_at as string)),
    }));
  }

  async person(userId: string): Promise<CrmPersonDetail> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw NotFound("Person not found.");

    const [facts] = await this.rows(sql`
      select
        (select count(*)::int from pages where created_by_user_id = ${userId}) as notes,
        (select count(*)::int from canvases where created_by_user_id = ${userId}) as canvases,
        (select count(*)::int from projects where created_by_user_id = ${userId}) as projects,
        (select count(*)::int from notebooks where created_by_user_id = ${userId}) as notebooks,
        (select count(distinct day)::int from activity_days where user_id = ${userId} and day >= current_date - 29) as active_days,
        (select max(day)::text from activity_days where user_id = ${userId}) as last_active,
        (select m.workspace_id from workspace_members m where m.user_id = ${userId} and m.role = 'OWNER'
          order by m.created_at limit 1) as workspace_id,
        (select coalesce(c.status, 'new') from (select 1) x left join crm_contacts c on c.user_id = ${userId}) as status,
        (select o.id from crm_contacts c join users o on o.id = c.owner_user_id where c.user_id = ${userId}) as owner_id,
        (select o.name from crm_contacts c join users o on o.id = c.owner_user_id where c.user_id = ${userId}) as owner_name,
        (select p.name from partner_referrals r join partners p on p.id = r.partner_id where r.user_id = ${userId}) as partner_name,
        (select p.kind from partner_referrals r join partners p on p.id = r.partner_id where r.user_id = ${userId}) as partner_kind
    `);
    const f = facts!;
    const plan: AdminPlan = f.workspace_id
      ? await this.plan(String(f.workspace_id))
      : { plan: "free", source: null, until: null };

    return {
      user: { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl },
      joinedAt: u.createdAt.toISOString(),
      source: sourceOf(u.signupRef, f.partner_name as string | null, f.partner_kind as string | null),
      status: f.status as CrmStatus,
      owner: f.owner_id ? { id: String(f.owner_id), name: String(f.owner_name) } : null,
      plan,
      made: {
        notes: Number(f.notes),
        canvases: Number(f.canvases),
        projects: Number(f.projects),
        notebooks: Number(f.notebooks),
      },
      activeDays: Number(f.active_days),
      lastActive: (f.last_active as string | null) ?? null,
      timeline: await this.timeline(u, f),
      followups: await this.followupsOf(userId),
    };
  }

  /** Status and/or owner; each change is audited. Owners must be staff. */
  async updateContact(userId: string, input: CrmContactUpdate, adminUserId: string): Promise<CrmPersonDetail> {
    if (input.status !== undefined) await this.setStatus(userId, input.status, adminUserId);
    if (input.ownerUserId !== undefined) {
      const person = await this.requireUser(userId);
      if (input.ownerUserId) await this.requireStaff(input.ownerUserId, "Only staff can look after people.");
      const [before] = await this.db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).limit(1);
      if ((before?.ownerUserId ?? null) !== input.ownerUserId) {
        await this.db
          .insert(crmContacts)
          .values({ userId, ownerUserId: input.ownerUserId })
          .onConflictDoUpdate({ target: crmContacts.userId, set: { ownerUserId: input.ownerUserId, updatedAt: new Date() } });
        await this.audit.record(adminUserId, {
          action: "crm.owner",
          targetKind: "user",
          targetId: userId,
          targetLabel: person.email,
          details: { from: before?.ownerUserId ?? null, to: input.ownerUserId },
        });
      }
    }
    return this.person(userId);
  }

  async setStatus(userId: string, status: CrmStatus, adminUserId: string): Promise<CrmPersonDetail> {
    const person = await this.requireUser(userId);
    const [before] = await this.db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).limit(1);
    const from = (before?.status ?? "new") as CrmStatus;
    if (from !== status) {
      await this.upsertStatus(userId, status);
      await this.audit.record(adminUserId, {
        action: "crm.status",
        targetKind: "user",
        targetId: userId,
        targetLabel: person.email,
        details: { from, to: status },
      });
    }
    return this.person(userId);
  }

  /** Log a conversation. The first one with someone still "new" makes them "contacted". */
  async log(userId: string, input: CrmLogInput, adminUserId: string): Promise<CrmPersonDetail> {
    await this.requireUser(userId);
    await this.db.insert(crmEntries).values({
      userId,
      kind: input.kind,
      body: input.body,
      actorUserId: adminUserId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    });
    await this.markContacted(userId);
    return this.person(userId);
  }

  /**
   * Sends an email as the staff member ("Sunil from Octonote <hello@…>"), with
   * a hidden copy to the team inbox, and keeps it in the timeline. Replies go
   * to the team address. Nothing is saved if Resend refuses it.
   */
  async sendEmail(userId: string, input: CrmEmailInput, adminUserId: string): Promise<CrmPersonDetail> {
    const person = await this.requireUser(userId);
    const sender = await this.requireUser(adminUserId);
    const senderFirst = sender.name.split(/\s+/)[0] || "The Octonote team";
    const copy = this.mailer.bcc && this.mailer.bcc.toLowerCase() !== person.email.toLowerCase() ? [this.mailer.bcc] : [];
    // The entry's id is decided now, so the email can carry its own reply address.
    const entryId = generateId("crm");
    let sent: { id: string };
    try {
      sent = await this.mailer.send({
        from: `${senderFirst} from Octonote <${this.mailer.fromAddress}>`,
        to: person.email,
        bcc: copy,
        replyTo: replyAddressFor(entryId, this.mailer.replyDomain) ?? this.mailer.fromAddress,
        subject: input.subject,
        text: input.body,
        html: renderCrmEmail(input.body),
      });
    } catch (err) {
      throw ServerError(`The email wasn't sent: ${err instanceof Error ? err.message : "Resend refused it."}`);
    }
    await this.db.insert(crmEntries).values({
      id: entryId,
      userId,
      kind: "email_out",
      subject: input.subject,
      body: input.body,
      actorUserId: adminUserId,
      providerEmailId: sent.id,
    });
    await this.markContacted(userId);
    await this.audit.record(adminUserId, {
      action: "crm.email.send",
      targetKind: "user",
      targetId: userId,
      targetLabel: person.email,
      details: { subject: input.subject, copyTo: copy[0] ?? null },
    });
    return this.person(userId);
  }

  /**
   * Resend's `email.received` webhook. A reply to one of our emails lands on
   * that person (by its reply address, else by the sender's email), trimmed of
   * the quoted older message; they become "replied" if they were new or
   * contacted. Every received email is also forwarded to the team inbox.
   * Retries count once. A forged webhook is refused.
   */
  async receive(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }): Promise<void> {
    let event;
    try {
      event = this.mailer.verifyInbound(rawBody, headers);
    } catch {
      throw Unauthorized("Not a valid Resend webhook.");
    }
    if (event.type !== "email.received" || !event.emailId) return;
    const [seen] = await this.db
      .select({ id: crmEntries.id })
      .from(crmEntries)
      .where(eq(crmEntries.providerEmailId, event.emailId))
      .limit(1);
    if (seen) return;

    const mail = await this.mailer.getReceived(event.emailId);
    const replyToEntryId = entryIdFromAddresses([...mail.to, ...event.to], this.mailer.replyDomain);
    let userId: string | null = null;
    if (replyToEntryId) {
      const [ours] = await this.db
        .select({ userId: crmEntries.userId })
        .from(crmEntries)
        .where(and(eq(crmEntries.id, replyToEntryId), eq(crmEntries.kind, "email_out")))
        .limit(1);
      userId = ours?.userId ?? null;
    }
    if (!userId) {
      const [byEmail] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${emailOf(mail.from)}`)
        .limit(1);
      userId = byEmail?.id ?? null;
    }
    if (!userId) {
      this.logger.log(`A reply from ${emailOf(mail.from)} matched nobody; it was only forwarded.`);
      await this.forward(event.emailId);
      return;
    }

    const body = trimQuotedReply(mail.text ?? htmlToText(mail.html ?? ""));
    await this.db
      .insert(crmEntries)
      .values({
        userId,
        kind: "email_in",
        subject: mail.subject || null,
        body,
        providerEmailId: event.emailId,
        replyToEntryId: replyToEntryId && userId ? replyToEntryId : null,
        occurredAt: mail.receivedAt ? new Date(mail.receivedAt) : new Date(),
      })
      .onConflictDoNothing();
    const [c] = await this.db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).limit(1);
    if (!c || c.status === "new" || c.status === "contacted") await this.upsertStatus(userId, "replied");
    // After it's saved, so a retry never sends the team inbox a second copy.
    await this.forward(event.emailId);
  }

  /** The team inbox gets a copy of every received email; failing to forward never loses the reply. */
  private async forward(emailId: string) {
    await this.mailer.forwardToTeam(emailId).catch((err) => this.logger.warn(`Forward failed: ${String(err)}`));
  }

  /** Staff opened this person: their replies so far are read. */
  async markSeen(userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.db
      .insert(crmContacts)
      .values({ userId, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: crmContacts.userId, set: { lastSeenAt: new Date() } });
  }

  /** Removes something logged by hand (never an email: those are a record of what was sent). */
  async deleteEntry(entryId: string, adminUserId: string): Promise<CrmPersonDetail> {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, entryId)).limit(1);
    if (!e) throw NotFound("Entry not found.");
    if (!LOGGED_KINDS.includes(e.kind)) throw BadRequest("Emails can't be deleted from the timeline.");
    await this.db.delete(crmEntries).where(eq(crmEntries.id, entryId));
    const person = await this.requireUser(e.userId);
    await this.audit.record(adminUserId, {
      action: "crm.entry.delete",
      targetKind: "user",
      targetId: e.userId,
      targetLabel: person.email,
      details: { kind: e.kind, body: preview(e.body).slice(0, 120) },
    });
    return this.person(e.userId);
  }

  async addFollowup(userId: string, input: CrmFollowupCreate, adminUserId: string): Promise<CrmPersonDetail> {
    await this.requireUser(userId);
    const assignee = input.assignedToUserId === undefined ? adminUserId : input.assignedToUserId;
    if (assignee) await this.requireStaff(assignee);
    await this.db.insert(crmFollowups).values({
      userId,
      dueOn: input.dueOn,
      note: input.note,
      assignedToUserId: assignee,
      createdByUserId: adminUserId,
    });
    return this.person(userId);
  }

  async updateFollowup(id: string, input: CrmFollowupUpdate): Promise<CrmPersonDetail> {
    const [f] = await this.db.select().from(crmFollowups).where(eq(crmFollowups.id, id)).limit(1);
    if (!f) throw NotFound("Follow-up not found.");
    await this.db
      .update(crmFollowups)
      .set({
        ...(input.dueOn !== undefined && { dueOn: input.dueOn }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.done !== undefined && { doneAt: input.done ? (f.doneAt ?? new Date()) : null }),
      })
      .where(eq(crmFollowups.id, id));
    return this.person(f.userId);
  }

  /** Staff who can own people and follow-ups. */
  async staff(): Promise<{ id: string; name: string; email: string }[]> {
    return this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.isAdmin, true))
      .orderBy(asc(users.name));
  }

  // --- Overview -----------------------------------------------------------------

  /**
   * Admin → Follow-ups. With an owner: their people, the follow-ups assigned
   * to them, and what they sent. Days are UTC.
   */
  async overview(ownerId: string | null, weeks = 8): Promise<CrmOverview> {
    const mine = (alias: string) =>
      ownerId ? sql`and exists (select 1 from crm_contacts oc where oc.user_id = ${sql.raw(alias)}.id and oc.owner_user_id = ${ownerId})` : sql``;

    const pipelineRows = await this.rows(sql`
      select coalesce(c.status, 'new') as status, count(*)::int as n
      from users u left join crm_contacts c on c.user_id = u.id
      where u.is_admin = false ${mine("u")}
      group by 1
    `);
    const byStatus = new Map(pipelineRows.map((r) => [String(r.status), Number(r.n)]));

    // Sent = emails and logged messages (not notes) by staff; replies = emails received.
    const weekRows = await this.rows(sql`
      select to_char(date_trunc('week', e.occurred_at at time zone 'UTC'), 'YYYY-MM-DD') as week,
        count(*) filter (where e.kind in ('email_out', 'linkedin', 'call', 'whatsapp', 'meeting')
          ${ownerId ? sql`and e.actor_user_id = ${ownerId}` : sql``})::int as sent,
        count(*) filter (where e.kind = 'email_in' ${mine("u")})::int as replies
      from crm_entries e join users u on u.id = e.user_id
      where e.occurred_at >= date_trunc('week', now() at time zone 'UTC') - make_interval(weeks => ${weeks - 1})
      group by 1
    `);
    const wk = new Map(weekRows.map((r) => [String(r.week), r]));
    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weekly = Array.from({ length: weeks }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
      const week = d.toISOString().slice(0, 10);
      const r = wk.get(week);
      return { week, sent: Number(r?.sent ?? 0), replies: Number(r?.replies ?? 0) };
    });

    const [rate] = await this.rows(sql`
      select
        count(*) filter (where e.kind = 'email_out' ${ownerId ? sql`and e.actor_user_id = ${ownerId}` : sql``})::int as sent,
        count(*) filter (where e.kind = 'email_in' ${mine("u")})::int as replies
      from crm_entries e join users u on u.id = e.user_id
      where e.occurred_at >= now() - interval '30 days'
    `);
    const sent30 = Number(rate?.sent ?? 0);

    const assigned = ownerId ? sql`and f.assigned_to_user_id = ${ownerId}` : sql``;
    const followupRows = await this.rows(sql`
      select f.id, f.due_on::text as due_on, f.note, f.assigned_to_user_id, a.name as a_name,
        u.id as uid, u.name as uname, u.email as uemail, coalesce(c.status, 'new') as status,
        (f.due_on <= (now() at time zone 'UTC')::date) as is_due
      from crm_followups f
      join users u on u.id = f.user_id
      left join users a on a.id = f.assigned_to_user_id
      left join crm_contacts c on c.user_id = u.id
      where f.done_at is null ${assigned}
        and f.due_on <= (now() at time zone 'UTC')::date + 7
      order by f.due_on, f.created_at
    `);
    const fup = (r: Row) => ({
      id: String(r.id),
      dueOn: String(r.due_on),
      note: String(r.note),
      assignedTo: r.assigned_to_user_id ? { id: String(r.assigned_to_user_id), name: String(r.a_name) } : null,
      doneAt: null,
    });
    const who = (r: Row) => ({ id: String(r.uid), name: String(r.uname), email: String(r.uemail) });
    const due = followupRows.filter((r) => r.is_due).map((r) => ({ followup: fup(r), person: who(r), status: r.status as CrmStatus }));
    const comingUp = followupRows.filter((r) => !r.is_due).map((r) => ({ followup: fup(r), person: who(r) }));

    const waitingRows = await this.rows(sql`
      select u.id as uid, u.name as uname, u.email as uemail, e.occurred_at, e.subject, e.body
      from users u
      join lateral (
        select kind, subject, body, occurred_at from crm_entries
        where user_id = u.id order by occurred_at desc, created_at desc limit 1
      ) e on true
      where e.kind = 'email_in' and u.is_admin = false ${mine("u")}
      order by e.occurred_at
    `);
    const waitingOnUs = waitingRows.map((r) => ({
      person: who(r),
      at: new Date(r.occurred_at as string).toISOString(),
      subject: (r.subject as string | null) ?? null,
      preview: preview(String(r.body ?? "")),
    }));

    const freshRows = await this.rows(sql`
      select u.id as uid, u.name as uname, u.email as uemail, u.created_at, u.signup_ref, p.name as partner_name, p.kind as partner_kind
      from users u
      left join partner_referrals r on r.user_id = u.id
      left join partners p on p.id = r.partner_id
      where u.is_admin = false and u.created_at >= now() - interval '30 days'
        and not exists (select 1 from crm_entries e where e.user_id = u.id) ${mine("u")}
      order by u.created_at desc
    `);
    const notContacted = freshRows.map((r) => ({
      person: who(r),
      joinedAt: new Date(r.created_at as string).toISOString(),
      source: sourceOf(r.signup_ref as string | null, r.partner_name as string | null, r.partner_kind as string | null),
    }));

    return {
      pipeline: CRM_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 })),
      weekly,
      replyRate30d: sent30 ? Number(rate?.replies ?? 0) / sent30 : null,
      counts: { due: due.length, waitingOnUs: waitingOnUs.length, notContacted: notContacted.length, comingUp: comingUp.length },
      due,
      waitingOnUs,
      notContacted,
      comingUp,
    };
  }

  // --- Helpers -----------------------------------------------------------------

  private async timeline(u: typeof users.$inferSelect, f: Row): Promise<CrmTimelineItem[]> {
    const items: CrmTimelineItem[] = [];
    const from = sourceOf(u.signupRef, f.partner_name as string | null, f.partner_kind as string | null);
    items.push({ type: "event", title: from === "Direct" ? "Signed up" : `Signed up · ${from}`, at: u.createdAt.toISOString() });
    if (u.studentProUntil) items.push({ type: "event", title: "Got student Pro", at: u.createdAt.toISOString() });

    // Firsts: when they first made each kind of thing (never titles: that's their content).
    const firsts = await this.rows(sql`
      select 'note' as kind, min(created_at) as at from pages where created_by_user_id = ${u.id}
      union all select 'canvas', min(created_at) from canvases where created_by_user_id = ${u.id}
      union all select 'project', min(created_at) from projects where created_by_user_id = ${u.id}
      union all select 'notebook', min(created_at) from notebooks where created_by_user_id = ${u.id}
    `);
    for (const r of firsts) {
      if (r.at) items.push({ type: "event", title: `Made a first ${r.kind}`, at: new Date(r.at as string).toISOString() });
    }

    // Codes, Pro given by staff, and payments, for the workspaces they own.
    const money = await this.rows(sql`
      select 'code' as what, c.code as detail, null as extra, pr.created_at as at
        from promo_redemptions pr join promo_codes c on c.id = pr.promo_code_id where pr.user_id = ${u.id}
      union all
      select 'grant', g.months::text, null, g.created_at from pro_grants g
        join workspace_members m on m.workspace_id = g.workspace_id and m.role = 'OWNER' where m.user_id = ${u.id}
      union all
      select 'billing', b.kind, b.interval, b.created_at from billing_events b
        join workspace_members m on m.workspace_id = b.workspace_id and m.role = 'OWNER' where m.user_id = ${u.id}
    `);
    const billingTitle: Record<string, string> = {
      started: "Started paying",
      cancel_scheduled: "Scheduled a cancellation",
      resumed: "Kept their subscription",
      ended: "Stopped paying",
      interval_changed: "Switched billing period",
      past_due: "Payment overdue",
      payment_failed: "A payment failed",
    };
    for (const r of money) {
      const at = new Date(r.at as string).toISOString();
      if (r.what === "code") items.push({ type: "event", title: `Used the code ${r.detail}`, at });
      else if (r.what === "grant") items.push({ type: "event", title: `Given ${r.detail} months of Pro by staff`, at });
      else {
        const t = billingTitle[String(r.detail)] ?? String(r.detail);
        items.push({ type: "event", title: r.extra ? `${t} (${r.extra === "year" ? "yearly" : "monthly"})` : t, at });
      }
    }

    const entries = await this.db
      .select({ e: crmEntries, by: { id: users.id, name: users.name } })
      .from(crmEntries)
      .leftJoin(users, eq(users.id, crmEntries.actorUserId))
      .where(eq(crmEntries.userId, u.id));
    for (const { e, by } of entries) {
      items.push({
        type: "entry",
        id: e.id,
        kind: e.kind as CrmEntryKind,
        subject: e.subject,
        body: e.body,
        by: by?.id ? by : null,
        at: e.occurredAt.toISOString(),
      });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }

  private async followupsOf(userId: string): Promise<CrmFollowup[]> {
    const rows = await this.db
      .select({ f: crmFollowups, to: { id: users.id, name: users.name } })
      .from(crmFollowups)
      .leftJoin(users, eq(users.id, crmFollowups.assignedToUserId))
      .where(eq(crmFollowups.userId, userId))
      .orderBy(sql`${crmFollowups.doneAt} is not null`, asc(crmFollowups.dueOn), asc(crmFollowups.createdAt));
    return rows.map(({ f, to }) => ({
      id: f.id,
      dueOn: f.dueOn,
      note: f.note,
      assignedTo: to?.id ? to : null,
      doneAt: f.doneAt?.toISOString() ?? null,
    }));
  }

  private async markContacted(userId: string) {
    const [c] = await this.db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).limit(1);
    if (!c || c.status === "new") await this.upsertStatus(userId, "contacted");
  }

  private async upsertStatus(userId: string, status: CrmStatus) {
    if (!CRM_STATUSES.includes(status)) throw BadRequest("Unknown status.");
    await this.db
      .insert(crmContacts)
      .values({ userId, status })
      .onConflictDoUpdate({ target: crmContacts.userId, set: { status, updatedAt: new Date() } });
  }

  private async requireUser(id: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw NotFound("Person not found.");
    return u;
  }

  private async requireStaff(id: string, message = "Follow-ups can only be assigned to staff.") {
    const [u] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isAdmin, true)))
      .limit(1);
    if (!u) throw BadRequest(message);
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
