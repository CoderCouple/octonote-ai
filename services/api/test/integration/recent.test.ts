/**
 * Home's "recent": built from the audit log, so it reflects the signed-in
 * user's own edits — not edits by people they share with — and rolls edits up
 * to the project and notebook that contain the item.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

const tick = () => new Promise((r) => setTimeout(r, 5));
const keys = (items: { kind: string; id: string }[]) => items.map((i) => `${i.kind}:${i.id}`);

describe("recent items", () => {
  it("lists the user's own edits, most recent first", async () => {
    const first = await h.pages.create(alice.workspaceId, { title: "First" }, alice.id);
    await tick();
    const second = await h.pages.create(alice.workspaceId, { title: "Second" }, alice.id);
    await tick();
    await h.pages.update(first.id, { title: "First, edited" }, alice.id);

    const recent = await h.recent.recentForUser(alice.workspaceId, alice.id);
    expect(keys(recent)).toEqual([`page:${first.id}`, `page:${second.id}`]);
  });

  it("ignores edits made by someone else", async () => {
    const mine = await h.pages.create(alice.workspaceId, { title: "Mine" }, alice.id);
    await tick();
    const shared = await h.pages.create(alice.workspaceId, { title: "Shared" }, alice.id);
    await h.shares.add(
      { resourceKind: "page", resourceId: shared.id, email: bob.email, role: "editor" },
      alice,
    );
    await tick();
    await h.pages.update(mine.id, { title: "Mine, edited" }, alice.id);
    await tick();
    await h.pages.update(shared.id, { title: "Bob was here" }, bob.id);

    const aliceRecent = await h.recent.recentForUser(alice.workspaceId, alice.id);
    expect(keys(aliceRecent)[0]).toBe(`page:${mine.id}`);
    // Bob isn't a member of Alice's workspace, so he has no recent list there.
    expect(await statusOf(h.recent.recentForUser(alice.workspaceId, bob.id))).toBe(403);
  });

  it("counts edits to a project's note for the project, and items in a notebook for the notebook", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const { project, noteId } = await h.projects.create(
      alice.workspaceId,
      { name: "Launch", notebookId: nb.id },
      alice.id,
    );
    const other = await h.notebooks.create(alice.workspaceId, { name: "Later" }, alice.id);
    await tick();
    await h.pages.update(noteId, { title: "Plan" }, alice.id);

    const recent = await h.recent.recentForUser(alice.workspaceId, alice.id);
    const at = (k: string) => recent.find((i) => `${i.kind}:${i.id}` === k)!.lastEditedAt;
    expect(at(`project:${project.id}`)).toEqual(at(`page:${noteId}`));
    expect(at(`notebook:${nb.id}`)).toEqual(at(`page:${noteId}`));
    expect(at(`notebook:${nb.id}`) > at(`notebook:${other.id}`)).toBe(true);
  });
});
