/**
 * Follow-ups CRM (Admin → Inbox), layer 1.
 *   - The list: everyone who signed up (never staff), their source, status, latest entry and next follow-up.
 *   - A person's timeline mixes logged conversations with what we already know, oldest first,
 *     without their content (no titles).
 *   - Logging the first conversation makes "new" → "contacted"; status changes are audited.
 *   - Follow-ups: open first, done later, assignable to staff only.
 *   - Logged entries can be deleted (audited); emails can't.
 */
import { CRM_TEMPLATES, CrmEmailSchema, CrmFollowupCreateSchema, CrmLogSchema, fillCrmTemplate, PartnerCreateSchema } from "@octonote/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { trimQuotedReply } from "../../src/common/crm-mailer";
import { crmEntries } from "../../src/db/schemas/crm";
import { users } from "../../src/db/schemas/users";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let admin: Awaited<ReturnType<Harness["signIn"]>>;
let maya: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  admin = await h.signIn("staff@octonote.ai");
  await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id));
  maya = await h.signIn("maya@example.com");
});

const log = (userId: string, kind: string, body: string) =>
  h.crm.log(userId, CrmLogSchema.parse({ kind, body }), admin.id);

describe("the Inbox list", () => {
  it("lists people who signed up, not staff, with where they came from", async () => {
    await h.partners.create(PartnerCreateSchema.parse({ name: "Priya", kind: "influencer" }), admin.id);
    await h.me.sync(
      { id: "usr_00000000-0000-4000-8000-000000000777", email: "ana@example.com", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "" } as never,
      { signupRef: "priya" },
    );
    const rows = await h.crm.people();
    expect(rows.map((r) => r.user.email).sort()).toEqual(["ana@example.com", "maya@example.com"]);
    expect(rows.find((r) => r.user.email === "ana@example.com")).toMatchObject({
      source: "Priya (influencer)",
      status: "new",
      contacted: false,
      last: { kind: "event", title: "Signed up" },
      nextFollowup: null,
    });
  });

  it("shows the latest entry and the earliest open follow-up", async () => {
    await log(maya.id, "linkedin", "Thanked her for signing up.\nAsked what she studies.");
    await h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: "2026-11-05", note: "Later one" }), admin.id);
    await h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: "2026-11-01", note: "Sooner one" }), admin.id);
    const [row] = (await h.crm.people()).filter((r) => r.user.id === maya.id);
    expect(row).toMatchObject({
      status: "contacted",
      contacted: true,
      last: { kind: "linkedin", preview: "Thanked her for signing up. Asked what she studies." },
      nextFollowup: { dueOn: "2026-11-01", note: "Sooner one", assignedTo: { id: admin.id } },
    });
  });
});

describe("a person's timeline", () => {
  it("mixes what we know with what was logged, oldest first, without their content", async () => {
    await h.pages.create(maya.workspaceId, { title: "Secret thesis notes" }, maya.id);
    await log(maya.id, "call", "Wants PDF export.");
    const d = await h.crm.person(maya.id);
    expect(d.timeline.map((t) => (t.type === "event" ? t.title : `${t.kind}: ${t.body}`))).toEqual([
      "Signed up",
      "Made a first note",
      "call: Wants PDF export.",
    ]);
    expect(d.made).toEqual({ notes: 1, canvases: 0, projects: 0, notebooks: 0 });
    expect(d.plan.plan).toBe("free");
    expect(JSON.stringify(d)).not.toContain("Secret thesis");
  });

  it("shows codes, staff Pro and payments", async () => {
    await h.promotions.create({ code: "WELCOME", kind: "free_pro", audience: "general", freeMonths: 1 } as never, admin.id);
    await h.promotions.apply(maya.workspaceId, "WELCOME", maya.id);
    const titles = (await h.crm.person(maya.id)).timeline.filter((t) => t.type === "event").map((t) => t.title);
    expect(titles).toContain("Used the code WELCOME");
  });
});

describe("status", () => {
  it("moves new → contacted on the first logged conversation, but never backwards", async () => {
    expect((await h.crm.person(maya.id)).status).toBe("new");
    await log(maya.id, "note", "Met at a meetup.");
    expect((await h.crm.person(maya.id)).status).toBe("contacted");
    await h.crm.setStatus(maya.id, "using", admin.id);
    await log(maya.id, "whatsapp", "Sent the CLI link.");
    expect((await h.crm.person(maya.id)).status).toBe("using");
  });

  it("audits changes made by hand", async () => {
    await h.crm.setStatus(maya.id, "paying", admin.id);
    await h.crm.setStatus(maya.id, "paying", admin.id); // no change, no entry
    const entries = (await h.adminAudit.list(10)).filter((e) => e.action === "crm.status");
    expect(entries).toEqual([expect.objectContaining({ targetLabel: "maya@example.com", details: { from: "new", to: "paying" } })]);
  });
});

describe("follow-ups", () => {
  it("are listed open first, can be done and undone, and go to staff only", async () => {
    await h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: "2026-11-01", note: "Ask about the CLI" }), admin.id);
    let d = await h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: "2026-10-30", note: "Answer PDF" }), admin.id);
    const pdf = d.followups.find((f) => f.note === "Answer PDF")!;
    d = await h.crm.updateFollowup(pdf.id, { done: true });
    expect(d.followups.map((f) => [f.note, f.doneAt !== null])).toEqual([
      ["Ask about the CLI", false],
      ["Answer PDF", true],
    ]);
    d = await h.crm.updateFollowup(pdf.id, { done: false });
    expect(d.followups[0]!.note).toBe("Answer PDF");

    expect(
      await statusOf(h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: "2026-11-01", note: "x", assignedToUserId: maya.id }), admin.id)),
    ).toBe(400);
  });
});

describe("deleting", () => {
  it("removes a logged entry (audited) but never an email", async () => {
    let d = await log(maya.id, "note", "Typo'd note");
    const note = d.timeline.find((t) => t.type === "entry")!;
    d = await h.crm.deleteEntry(note.type === "entry" ? note.id : "", admin.id);
    expect(d.timeline.filter((t) => t.type === "entry")).toHaveLength(0);
    expect((await h.adminAudit.list(1))[0]).toMatchObject({ action: "crm.entry.delete", details: { kind: "note" } });

    const [email] = await h.db.insert(crmEntries).values({ userId: maya.id, kind: "email_out", subject: "Hi", body: "Hello" }).returning();
    expect(await statusOf(h.crm.deleteEntry(email!.id, admin.id))).toBe(400);
  });

  it("refuses a logged time in the future", () => {
    expect(CrmLogSchema.safeParse({ kind: "call", body: "x", occurredAt: "2099-01-01T00:00:00Z" }).success).toBe(false);
  });
});

describe("sending email (layer 2)", () => {
  const email = (subject: string, body: string) =>
    h.crm.sendEmail(maya.id, CrmEmailSchema.parse({ subject, body }), admin.id);

  it("sends as the staff member from the team address, with a copy to hello@, and keeps it in the timeline", async () => {
    await h.db.update(users).set({ name: "Sunil Tiwari" }).where(eq(users.id, admin.id));
    const d = await email("Welcome to Octonote, Maya", "Hi Maya,\n\nThanks for signing up! See https://octonote.ai/cli.\n\nSunil");
    expect(h.crmMailer.sent).toEqual([
      expect.objectContaining({
        from: "Sunil from Octonote <hello@octonote.ai>",
        to: "maya@example.com",
        bcc: ["hello@octonote.ai"],
        replyTo: expect.stringMatching(/^r-[0-9a-f-]{36}@reply\.octonote\.ai$/),
        subject: "Welcome to Octonote, Maya",
      }),
    ]);
    const html = h.crmMailer.sent[0]!.html;
    expect(html).toContain('<a href="https://octonote.ai/cli">https://octonote.ai/cli</a>');
    expect(html).toContain("<p");

    const sentEntry = d.timeline.find((t) => t.type === "entry");
    expect(sentEntry).toMatchObject({ kind: "email_out", subject: "Welcome to Octonote, Maya", by: { id: admin.id } });
    expect(d.status).toBe("contacted");
    const [row] = (await h.crm.people()).filter((r) => r.user.id === maya.id);
    expect(row).toMatchObject({ emailed: true, last: { kind: "email_out", title: "Welcome to Octonote, Maya" } });
    expect((await h.adminAudit.list(1))[0]).toMatchObject({
      action: "crm.email.send",
      targetLabel: "maya@example.com",
      details: { subject: "Welcome to Octonote, Maya", copyTo: "hello@octonote.ai" },
    });
  });

  it("escapes what staff write, so it can't become HTML", async () => {
    await email("Hi", "<script>alert(1)</script> & <b>bold</b>");
    expect(h.crmMailer.sent[0]!.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
  });

  it("saves nothing when Resend refuses the email", async () => {
    h.crmMailer.failNext = true;
    expect(await statusOf(email("Hi", "Hello"))).toBe(500);
    const d = await h.crm.person(maya.id);
    expect(d.timeline.filter((t) => t.type === "entry")).toHaveLength(0);
    expect(d.status).toBe("new");
  });

  it("fills templates with both first names", () => {
    const t = CRM_TEMPLATES.find((x) => x.id === "welcome")!;
    expect(fillCrmTemplate(t.subject, "Maya", "Sunil")).toBe("Welcome to Octonote, Maya");
    expect(fillCrmTemplate(t.body, "Maya", "Sunil")).toMatch(/^Hi Maya,[\s\S]*I'm Sunil/);
  });
});

describe("replies (layer 3)", () => {
  const inbound = (emailId: string, to: string[], from = "Maya <maya@example.com>", signature = "valid") =>
    h.crm.receive(JSON.stringify({ type: "email.received", data: { email_id: emailId, from, to } }), {
      id: "msg_1",
      timestamp: "1",
      signature,
    });

  async function sendOne() {
    await h.crm.sendEmail(maya.id, CrmEmailSchema.parse({ subject: "Welcome", body: "Hi Maya" }), admin.id);
    return h.crmMailer.sent.at(-1)!.replyTo;
  }

  it("gives each email its own reply address on the reply subdomain", async () => {
    const replyTo = await sendOne();
    expect(replyTo).toMatch(/^r-[0-9a-f-]{36}@reply\.octonote\.ai$/);
    const sent = (await h.crm.person(maya.id)).timeline.find((t) => t.type === "entry");
    expect(sent!.type === "entry" && replyTo.includes(sent!.id.replace("crm_", ""))).toBe(true);
  });

  it("puts a reply on the right person, trimmed, marks it replied and unread, and forwards a copy", async () => {
    const replyTo = await sendOne();
    h.crmMailer.received.e1 = {
      from: "Maya Chen <maya.personal@gmail.com>", // a different account: matched by the reply address
      to: [replyTo],
      subject: "Re: Welcome",
      text: "Thanks! Is there PDF export?\n\nOn Tue, Oct 21, 2026 at 10:05 AM Sunil from Octonote <hello@octonote.ai> wrote:\n> Hi Maya\n",
      html: null,
      receivedAt: "", // no time from Resend: the moment it arrives
    };
    await inbound("e1", [replyTo], "Maya Chen <maya.personal@gmail.com>");
    await inbound("e1", [replyTo], "Maya Chen <maya.personal@gmail.com>"); // Resend retry

    const d = await h.crm.person(maya.id);
    const replies = d.timeline.filter((t) => t.type === "entry" && t.kind === "email_in");
    expect(replies).toEqual([expect.objectContaining({ subject: "Re: Welcome", body: "Thanks! Is there PDF export?" })]);
    expect(d.status).toBe("replied");
    expect(h.crmMailer.forwarded).toEqual(["e1"]);

    let [row] = (await h.crm.people()).filter((r) => r.user.id === maya.id);
    expect(row).toMatchObject({ needsReply: true, unread: true });
    await h.crm.markSeen(maya.id);
    [row] = (await h.crm.people()).filter((r) => r.user.id === maya.id);
    expect(row).toMatchObject({ needsReply: true, unread: false });

    // Our answer makes it our-turn no more.
    await h.crm.sendEmail(maya.id, CrmEmailSchema.parse({ subject: "Re: Welcome", body: "Yes, soon!" }), admin.id);
    [row] = (await h.crm.people()).filter((r) => r.user.id === maya.id);
    expect(row!.needsReply).toBe(false);
  });

  it("falls back to the sender's email, and keeps a paying customer's status", async () => {
    await h.crm.setStatus(maya.id, "paying", admin.id);
    h.crmMailer.received.e2 = {
      from: "MAYA@example.com",
      to: ["hello@octonote.ai"],
      subject: "Question",
      text: null,
      html: "<p>Hello <b>team</b>,</p><p>Can I add a seat?</p><blockquote>old stuff</blockquote>",
      receivedAt: "2026-10-23T09:00:00.000Z",
    };
    await inbound("e2", ["hello@octonote.ai"], "MAYA@example.com");
    const d = await h.crm.person(maya.id);
    expect(d.timeline.find((t) => t.type === "entry" && t.kind === "email_in")).toMatchObject({ body: "Hello team,\n\nCan I add a seat?" });
    expect(d.status).toBe("paying");
  });

  it("only forwards a reply that matches nobody, and refuses a forged webhook", async () => {
    h.crmMailer.received.e3 = { from: "stranger@example.com", to: ["r-00000000-0000-4000-8000-000000000000@reply.octonote.ai"], subject: "Hi", text: "Hello", html: null, receivedAt: "" };
    await inbound("e3", ["r-00000000-0000-4000-8000-000000000000@reply.octonote.ai"], "stranger@example.com");
    expect(h.crmMailer.forwarded).toEqual(["e3"]);
    expect((await h.db.select().from(crmEntries)).filter((e) => e.kind === "email_in")).toHaveLength(0);

    expect(await statusOf(inbound("e4", [], "x@example.com", "forged"))).toBe(401);
  });

  it("trims common quoted-reply formats but keeps a sentence that merely mentions 'On … wrote:'", () => {
    expect(trimQuotedReply("Sure!\n\n-----Original Message-----\nFrom: x")).toBe("Sure!");
    expect(trimQuotedReply("Yes\n\nFrom: Sunil <hello@octonote.ai>\nSent: Tuesday\nSubject: Hi")).toBe("Yes");
    expect(trimQuotedReply("On the train I wrote: a poem.\nThanks")).toBe("On the train I wrote: a poem.\nThanks");
    expect(trimQuotedReply("Great\n> quoted line")).toBe("Great");
  });
});

describe("owners and the overview (layer 4)", () => {
  async function staffMember(email: string) {
    const s = await h.signIn(email);
    await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, s.id));
    return s;
  }

  it("assigns an owner (staff only), shows it, and audits it", async () => {
    const payal = await staffMember("payal@octonote.ai");
    const d = await h.crm.updateContact(maya.id, { ownerUserId: payal.id }, admin.id);
    expect(d.owner).toMatchObject({ id: payal.id });
    expect((await h.crm.people()).find((r) => r.user.id === maya.id)!.owner).toMatchObject({ id: payal.id });
    expect((await h.adminAudit.list(1))[0]).toMatchObject({ action: "crm.owner", details: { from: null, to: payal.id } });
    expect(await statusOf(h.crm.updateContact(maya.id, { ownerUserId: maya.id }, admin.id))).toBe(400);
    expect((await h.crm.updateContact(maya.id, { ownerUserId: null, status: "using" }, admin.id))).toMatchObject({ owner: null, status: "using" });
  });

  it("counts the pipeline, outreach and replies per week, and the day's lists", async () => {
    const tom = await h.signIn("tom@example.com");
    await h.signIn("ana@example.com"); // never contacted
    await h.crm.sendEmail(maya.id, CrmEmailSchema.parse({ subject: "Hi", body: "Hello" }), admin.id);
    await log(tom.id, "linkedin", "Said hi");
    await log(tom.id, "note", "Notes don't count as outreach");
    h.crmMailer.received.r1 = { from: "maya@example.com", to: ["hello@octonote.ai"], subject: "Re: Hi", text: "Thanks!", html: null, receivedAt: "" };
    await h.crm.receive(JSON.stringify({ type: "email.received", data: { email_id: "r1", from: "maya@example.com", to: [] } }), { signature: "valid" });
    const today = new Date().toISOString().slice(0, 10);
    await h.crm.addFollowup(tom.id, CrmFollowupCreateSchema.parse({ dueOn: today, note: "Ask about the CLI" }), admin.id);
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await h.crm.addFollowup(tom.id, CrmFollowupCreateSchema.parse({ dueOn: later, note: "Check in" }), admin.id);

    const o = await h.crm.overview(null, 8);
    expect(Object.fromEntries(o.pipeline.map((p) => [p.status, p.count]))).toMatchObject({ new: 1, contacted: 1, replied: 1 });
    expect(o.weekly).toHaveLength(8);
    expect(o.weekly.at(-1)).toMatchObject({ sent: 2, replies: 1 });
    expect(o.replyRate30d).toBe(1);
    expect(o.counts).toEqual({ due: 1, waitingOnUs: 1, notContacted: 1, comingUp: 1 });
    expect(o.due[0]).toMatchObject({ person: { email: "tom@example.com" }, followup: { note: "Ask about the CLI" } });
    expect(o.waitingOnUs[0]).toMatchObject({ person: { email: "maya@example.com" }, preview: "Thanks!" });
    expect(o.notContacted[0]!.person.email).toBe("ana@example.com");
    expect(o.comingUp[0]!.followup.note).toBe("Check in");
  });

  it("narrows everything to one owner", async () => {
    const payal = await staffMember("payal@octonote.ai");
    const tom = await h.signIn("tom@example.com");
    await h.crm.updateContact(tom.id, { ownerUserId: payal.id }, admin.id);
    await h.crm.log(tom.id, CrmLogSchema.parse({ kind: "call", body: "Called" }), payal.id);
    await h.crm.sendEmail(maya.id, CrmEmailSchema.parse({ subject: "Hi", body: "Hello" }), admin.id);
    const today = new Date().toISOString().slice(0, 10);
    await h.crm.addFollowup(tom.id, CrmFollowupCreateSchema.parse({ dueOn: today, note: "Payal's", assignedToUserId: payal.id }), admin.id);
    await h.crm.addFollowup(maya.id, CrmFollowupCreateSchema.parse({ dueOn: today, note: "Sunil's" }), admin.id);

    const o = await h.crm.overview(payal.id, 8);
    expect(o.pipeline.reduce((n, p) => n + p.count, 0)).toBe(1);
    expect(o.weekly.at(-1)!.sent).toBe(1);
    expect(o.due.map((d) => d.followup.note)).toEqual(["Payal's"]);
    expect(o.replyRate30d).toBeNull();
  });
});

describe("activity (layer 5)", () => {
  it("lists the last 30 days with where they used Octonote", async () => {
    await h.activity.record(maya.id, "web");
    await h.activity.record(maya.id, "cli");
    const d = await h.crm.person(maya.id);
    expect(d.activity).toHaveLength(30);
    expect(d.activity.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), sources: ["cli", "web"] });
    expect(d.activity.slice(0, 29).every((a) => a.sources.length === 0)).toBe(true);
  });
});
