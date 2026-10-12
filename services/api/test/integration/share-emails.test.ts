/**
 * Share emails are the only notification in v1. Existing users can turn them
 * off in Settings; invites to people without an account always go out.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

const share = (resourceId: string, email: string) =>
  h.shares.add({ resourceKind: "page", resourceId, email, role: "viewer" }, alice);

describe("share emails", () => {
  it("are on by default", async () => {
    expect((await h.preferences.getOrCreate(bob.id)).emailOnShare).toBe(true);
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    const r = await share(note.id, bob.email);
    expect(r).toMatchObject({ emailSent: true, emailMuted: false });
    expect(h.email.sent.map((e) => e.to)).toEqual([bob.email]);
  });

  it("stop when the recipient turns them off, but the share still happens", async () => {
    await h.preferences.update(bob.id, { emailOnShare: false });
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    const r = await share(note.id, bob.email);
    expect(r).toMatchObject({ emailSent: false, emailMuted: true });
    expect(h.email.sent).toHaveLength(0);
    expect(r.share.status).toBe("active");
  });

  it("always go to people without an account (the invite is their way in)", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    const r = await share(note.id, "newcomer@example.com");
    expect(r).toMatchObject({ emailSent: true, emailMuted: false });
  });
});
