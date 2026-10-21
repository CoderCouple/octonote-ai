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
        replyTo: "hello@octonote.ai",
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
