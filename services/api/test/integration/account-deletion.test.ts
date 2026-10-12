/**
 * Delete account: everything that's only yours goes (and your Supabase
 * sign-in); things other people use stay intact, minus your access.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

const workspaceCount = async (id: string) =>
  (await h.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id))).length;
const pageCount = async (workspaceId: string) =>
  (await h.db.select().from(schema.pages).where(eq(schema.pages.workspaceId, workspaceId))).length;
const canvasCount = async (workspaceId: string) =>
  (await h.db.select().from(schema.canvases).where(eq(schema.canvases.workspaceId, workspaceId)))
    .length;

describe("delete account", () => {
  it("needs the account's email typed to confirm", async () => {
    expect(await statusOf(h.account.deleteAccount(alice.id, alice.email, "wrong@example.com"))).toBe(400);
    expect(h.supabase.deletedUsers).toEqual([]);
    const [still] = await h.db.select().from(schema.users).where(eq(schema.users.id, alice.id));
    expect(still).toBeDefined();
  });

  it("removes your workspace, everything in it, and your sign-in", async () => {
    await h.pages.create(alice.workspaceId, { title: "Diary" }, alice.id);
    await h.projects.create(alice.workspaceId, { name: "Plan" }, alice.id);
    const canvas = await h.canvases.create(alice.workspaceId, { title: "Map" }, alice.id);
    await h.db
      .update(schema.canvases)
      .set({ thumbnailUrl: `https://x.supabase.co/storage/v1/object/public/canvas-thumbnails/${canvas.id}/a.png` })
      .where(eq(schema.canvases.id, canvas.id));
    await h.preferences.update(alice.id, { emailOnShare: false });

    await h.account.deleteAccount(alice.id, alice.email, " Alice@Example.com ");

    expect(await workspaceCount(alice.workspaceId)).toBe(0);
    expect(await pageCount(alice.workspaceId)).toBe(0);
    expect(await canvasCount(alice.workspaceId)).toBe(0);
    expect(await h.db.select().from(schema.users).where(eq(schema.users.id, alice.id))).toEqual([]);
    expect(await h.db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, alice.id))).toEqual([]);
    expect(h.supabase.deletedUsers).toEqual([alice.id.replace(/^usr_/, "")]);
    expect(h.supabase.removedObjects).toEqual([`${canvas.id}/a.png`]);
    // Bob is untouched.
    expect(await workspaceCount(bob.workspaceId)).toBe(1);
  });

  it("leaves other people's things intact, minus your access and your name in their audit log", async () => {
    const bobsNote = await h.pages.create(bob.workspaceId, { title: "Roadmap" }, bob.id);
    await h.shares.add({ resourceKind: "page", resourceId: bobsNote.id, email: alice.email, role: "editor" }, bob);
    await h.pages.update(bobsNote.id, { title: "Roadmap (Alice edited)" }, alice.id);
    // Alice, as an editor, shares Bob's note onward with Carol.
    await h.shares.add(
      { resourceKind: "page", resourceId: bobsNote.id, email: "carol@example.com", role: "viewer" },
      alice,
    );

    await h.account.deleteAccount(alice.id, alice.email, alice.email);

    const [note] = await h.db.select().from(schema.pages).where(eq(schema.pages.id, bobsNote.id));
    expect(note?.title).toBe("Roadmap (Alice edited)");
    const shares = await h.db
      .select()
      .from(schema.resourceShares)
      .where(eq(schema.resourceShares.resourceId, bobsNote.id));
    // Alice's own grant is gone; the one she made for Carol now counts as Bob's.
    expect(shares.map((s) => [s.grantedToEmail, s.grantedByUserId])).toEqual([["carol@example.com", bob.id]]);
    const events = await h.db
      .select()
      .from(schema.changeEvents)
      .where(eq(schema.changeEvents.workspaceId, bob.workspaceId));
    expect(events.some((e) => e.userId === alice.id)).toBe(false);
    expect(events.some((e) => e.userId === null)).toBe(true);
  });

  it("refuses when you're the only owner of a workspace other people use", async () => {
    await h.db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: alice.workspaceId, userId: bob.id, role: "MEMBER" });
    expect(await statusOf(h.account.deleteAccount(alice.id, alice.email, alice.email))).toBe(409);
    expect(await workspaceCount(alice.workspaceId)).toBe(1);
    expect(h.supabase.deletedUsers).toEqual([]);
  });

  it("can be retried when removing the sign-in fails", async () => {
    h.supabase.failDeleteUser = true;
    expect(await statusOf(h.account.deleteAccount(alice.id, alice.email, alice.email))).toBe(500);
    expect(await workspaceCount(alice.workspaceId)).toBe(0);
    h.supabase.failDeleteUser = false;
    await h.account.deleteAccount(alice.id, alice.email, alice.email);
    expect(h.supabase.deletedUsers).toEqual([alice.id.replace(/^usr_/, "")]);
  });
});
