/** `GET /canvases/:id/people` — who can be @mentioned in a canvas's comments. */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let carol: Awaited<ReturnType<Harness["signIn"]>>;
let dave: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  carol = await h.signIn("carol@example.com");
  dave = await h.signIn("dave@example.com");
});

const names = (people: { name: string }[]) => people.map((p) => p.name);

describe("canvas people", () => {
  it("lists the owner and everyone shared on the canvas or a parent, names only", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Team" }, alice.id);
    const p = await h.projects.create(alice.workspaceId, { name: "Plan", notebookId: nb.id }, alice.id);
    await h.shares.add({ resourceKind: "canvas", resourceId: p.canvasId, email: bob.email, role: "editor" }, alice);
    await h.shares.add({ resourceKind: "notebook", resourceId: nb.id, email: carol.email, role: "viewer" }, alice);
    // A pending invite (no account yet) isn't listed.
    await h.shares.add({ resourceKind: "project", resourceId: p.project.id, email: "nobody@example.com", role: "editor" }, alice);

    const people = await h.canvases.people(p.canvasId, alice.id);
    expect(names(people)).toEqual(["alice", "bob", "carol"]);
    expect(people.find((x) => x.name === "bob")).toEqual({ id: bob.id, name: "bob" });
    expect(JSON.stringify(people)).not.toContain("@");
    // Editors get the same list.
    expect(names(await h.canvases.people(p.canvasId, bob.id))).toEqual(["alice", "bob", "carol"]);
  });

  it("is for editors only; strangers get 404", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Board" }, alice.id);
    await h.shares.add({ resourceKind: "canvas", resourceId: c.id, email: bob.email, role: "viewer" }, alice);
    expect(await statusOf(h.canvases.people(c.id, bob.id))).toBe(403);
    expect(await statusOf(h.canvases.people(c.id, dave.id))).toBe(404);
    // Link access doesn't put link visitors on the list.
    await h.settings.setGeneralAccess("canvas", c.id, { linkAccess: "anyone_with_link", linkRole: "editor" }, alice.id);
    expect(names(await h.canvases.people(c.id, alice.id))).toEqual(["alice", "bob"]);
  });
});
