/** Bug reports and feature requests: who can send, who can read, and what gets kept. */
import { beforeEach, describe, expect, it } from "vitest";
import { FEEDBACK_BUCKET } from "../../src/service/feedback.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let staff: Awaited<ReturnType<Harness["signIn"]>>;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]).toString("base64");
const send = (over: Record<string, unknown> = {}) =>
  h.feedback.create(alice.id, { kind: "bug", message: "The canvas won't open", context: {}, ...over });

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  staff = await h.signIn("staff@octonote.ai");
});

describe("feedback", () => {
  it("stores the report with the details that help look into it", async () => {
    const { id } = await send({
      workspaceId: alice.workspaceId,
      context: { platform: "Web", system: "Chrome on macOS", screen: "1440×900", page: "/workspace/home", timeZone: "America/Los_Angeles", city: "Seattle", country: "US" },
    });
    const item = await h.feedback.get(id);
    expect(item).toMatchObject({
      kind: "bug", status: "new", userId: alice.id, email: "alice@example.com", workspaceId: alice.workspaceId,
      platform: "Web", system: "Chrome on macOS", screen: "1440×900", page: "/workspace/home", timeZone: "America/Los_Angeles", city: "Seattle", country: "US", hasScreenshot: false,
    });
    expect(item.workspaceName).toBeTruthy();
    expect(item.plan).toBeTruthy();
    expect(h.email.feedback).toHaveLength(1);
  });

  it("ignores a workspace the person isn't in", async () => {
    const bob = await h.signIn("bob@example.com");
    const { id } = await send({ workspaceId: bob.workspaceId });
    expect((await h.feedback.get(id)).workspaceId).toBeNull();
  });

  it("keeps a screenshot private and shows staff an expiring link", async () => {
    const { id } = await send({ screenshot: { contentType: "image/png", data: PNG } });
    expect(h.supabase.uploads.has(`${FEEDBACK_BUCKET}/${id}.png`)).toBe(true);
    const item = await h.feedback.get(id);
    expect(item.hasScreenshot).toBe(true);
    expect(item.screenshotUrl).toContain("/signed/");
    expect((await h.feedback.list()).items[0]!.screenshotUrl).toBeUndefined();
  });

  it("refuses a file that isn't really an image, whatever it claims", async () => {
    const data = Buffer.from("<svg onload=alert(1)>").toString("base64");
    expect(await statusOf(send({ screenshot: { contentType: "image/png", data } }))).toBe(400);
    expect(h.supabase.uploads.size).toBe(0);
    expect((await h.feedback.list()).items).toHaveLength(0);
  });

  it("refuses an oversized screenshot", async () => {
    const data = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(5 * 1024 * 1024)]).toString("base64");
    expect(await statusOf(send({ screenshot: { contentType: "image/png", data } }))).toBe(400);
  });

  it("still saves the report when the heads-up email fails", async () => {
    h.email.failNext = true;
    const { id } = await send();
    expect((await h.feedback.get(id)).message).toBe("The canvas won't open");
  });

  it("limits how many one person can send in an hour", async () => {
    for (let i = 0; i < 10; i++) await send();
    expect(await statusOf(send())).toBe(429);
    await h.feedback.create(staff.id, { kind: "feature", message: "Someone else is fine", context: {} });
  });

  it("filters, counts, and audits staff changes", async () => {
    const a = await send();
    await send({ kind: "feature", message: "PDF export" });
    await h.feedback.update(a.id, { status: "planned", teamNote: "Next week" }, staff.id);
    const all = await h.feedback.list();
    expect(all.counts).toEqual({ newBugs: 0, newRequests: 1, planned: 1 });
    expect((await h.feedback.list({ status: "planned" })).items.map((i) => i.id)).toEqual([a.id]);
    expect((await h.feedback.list({ kind: "feature" })).items).toHaveLength(1);
    expect((await h.feedback.get(a.id)).teamNote).toBe("Next week");
    const audit = await h.adminAudit.list(5);
    expect(audit[0]).toMatchObject({ action: "feedback.update", targetId: a.id });
  });

  it("goes with the account, screenshot included", async () => {
    const { id } = await send({ screenshot: { contentType: "image/png", data: PNG } });
    await h.account.deleteAccount(alice.id, "alice@example.com", "alice@example.com");
    expect((await h.feedback.list()).items).toHaveLength(0);
    expect(h.supabase.removedObjects).toContain(`${id}.png`);
  });
});
