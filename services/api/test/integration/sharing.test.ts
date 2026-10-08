/**
 * Sharing + publishing is the product's most important feature, and a bug
 * here leaks private notes. These tests run against real Postgres.
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

const view = (userId: string | null, kind: "page" | "canvas" | "project" | "notebook", id: string) =>
  statusOf(h.permissions.require(userId, { kind, id }, "view"));
const edit = (userId: string | null, kind: "page" | "canvas" | "project" | "notebook", id: string) =>
  statusOf(h.permissions.require(userId, { kind, id }, "edit"));

describe("baseline access", () => {
  it("owner of the workspace owns their note; a stranger gets 404, not 403", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Private" }, alice.id);
    expect((await h.permissions.resolve(alice.id, { kind: "page", id: note.id })).role).toBe("owner");
    expect(await view(bob.id, "page", note.id)).toBe(404);
    expect(await view(null, "page", note.id)).toBe(404);
  });

  it("deleted notes are gone even for their owner", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Doomed" }, alice.id);
    await h.pages.softDelete(note.id, alice.id);
    expect(await view(alice.id, "page", note.id)).toBe(404);
  });
});

describe("people with access", () => {
  it("viewer can read but not edit, share, or publish", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: bob.email, role: "viewer" },
      alice,
    );
    expect(await view(bob.id, "page", note.id)).toBe(200);
    expect(await edit(bob.id, "page", note.id)).toBe(403);
    expect(
      await statusOf(
        h.shares.add({ resourceKind: "page", resourceId: note.id, email: "c@x.com", role: "viewer" }, bob),
      ),
    ).toBe(403);
    expect(await statusOf(h.settings.setPublished("page", note.id, true, bob.id))).toBe(403);
  });

  it("editor can edit and share, but not publish or delete", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" },
      alice,
    );
    await h.pages.update(note.id, { title: "Spec v2" }, bob.id);
    const added = await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: "carol@example.com", role: "viewer" },
      bob,
    );
    expect(added.share.status).toBe("pending");
    expect(await statusOf(h.settings.setPublished("page", note.id, true, bob.id))).toBe(403);
    expect(await statusOf(h.pages.softDelete(note.id, bob.id))).toBe(403);
  });

  it("re-sharing updates the role instead of duplicating, and emails only once", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    const input = { resourceKind: "page" as const, resourceId: note.id, email: bob.email };
    await h.shares.add({ ...input, role: "viewer" }, alice);
    await h.shares.add({ ...input, role: "editor" }, alice);
    const list = await h.shares.list("page", note.id, alice.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.share.role).toBe("editor");
    expect(h.email.sent).toHaveLength(1);
    expect(h.email.sent[0]!.url).toContain(`/n/${note.id}`);
  });

  it("revoking removes access", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    const { share } = await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" },
      alice,
    );
    await h.shares.revoke(share.id, alice.id);
    expect(await view(bob.id, "page", note.id)).toBe(404);
  });

  it("an invite to an email with no account activates when that person signs up", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: "Dana@Example.com", role: "editor" },
      alice,
    );
    expect(h.email.sent[0]!.needsAccount).toBe(true);
    const dana = await h.signIn("dana@example.com");
    expect(await edit(dana.id, "page", note.id)).toBe(200);
    expect((await h.shares.sharedWithMe(dana.id)).map((i) => i.id)).toEqual([note.id]);
  });

  it("a failed email doesn't undo the share", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    h.email.failNext = true;
    const res = await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: bob.email, role: "viewer" },
      alice,
    );
    expect(res.emailSent).toBe(false);
    expect(await view(bob.id, "page", note.id)).toBe(200);
  });

  it("shared-with-me drops items that were deleted", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.shares.add(
      { resourceKind: "page", resourceId: note.id, email: bob.email, role: "viewer" },
      alice,
    );
    await h.pages.softDelete(note.id, alice.id);
    expect(await h.shares.sharedWithMe(bob.id)).toEqual([]);
  });
});

describe("inheritance (Drive-style)", () => {
  it("sharing a notebook shares its notes, canvases, projects and the project's pair", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const note = await h.pages.create(alice.workspaceId, { title: "Roadmap", notebookId: nb.id }, alice.id);
    const canvas = await h.canvases.create(alice.workspaceId, { title: "Timeline", notebookId: nb.id }, alice.id);
    const proj = await h.projects.create(alice.workspaceId, { name: "Launch", notebookId: nb.id }, alice.id);
    const outside = await h.pages.create(alice.workspaceId, { title: "Outside" }, alice.id);

    await h.shares.add({ resourceKind: "notebook", resourceId: nb.id, email: bob.email, role: "viewer" }, alice);

    for (const [kind, id] of [
      ["page", note.id],
      ["canvas", canvas.id],
      ["project", proj.project.id],
      ["page", proj.noteId],
      ["canvas", proj.canvasId],
    ] as const) {
      expect(await view(bob.id, kind, id)).toBe(200);
      expect(await edit(bob.id, kind, id)).toBe(403);
    }
    expect(await view(bob.id, "page", outside.id)).toBe(404);
  });

  it("sharing a project does not leak its notebook siblings", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const proj = await h.projects.create(alice.workspaceId, { name: "Launch", notebookId: nb.id }, alice.id);
    const sibling = await h.pages.create(alice.workspaceId, { title: "Sibling", notebookId: nb.id }, alice.id);
    await h.shares.add({ resourceKind: "project", resourceId: proj.project.id, email: bob.email, role: "editor" }, alice);
    expect(await edit(bob.id, "page", proj.noteId)).toBe(200);
    expect(await view(bob.id, "page", sibling.id)).toBe(404);
    expect(await view(bob.id, "notebook", nb.id)).toBe(404);
  });

  it("moving a note out of a shared notebook removes the inherited access", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const note = await h.pages.create(alice.workspaceId, { title: "Roadmap", notebookId: nb.id }, alice.id);
    await h.shares.add({ resourceKind: "notebook", resourceId: nb.id, email: bob.email, role: "viewer" }, alice);
    await h.pages.moveToNotebook(note.id, null, alice.id);
    expect(await view(bob.id, "page", note.id)).toBe(404);
  });

  it("the highest grant wins", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const note = await h.pages.create(alice.workspaceId, { title: "Roadmap", notebookId: nb.id }, alice.id);
    await h.shares.add({ resourceKind: "notebook", resourceId: nb.id, email: bob.email, role: "viewer" }, alice);
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" }, alice);
    expect(await edit(bob.id, "page", note.id)).toBe(200);
  });
});

describe("general access: anyone with the link", () => {
  it("lets anonymous visitors view, never edit; signed-in visitors get the link role", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.settings.setGeneralAccess("page", note.id, { linkAccess: "anyone_with_link", linkRole: "editor" }, alice.id);
    expect(await view(null, "page", note.id)).toBe(200);
    expect(await edit(null, "page", note.id)).toBe(403);
    expect(await edit(bob.id, "page", note.id)).toBe(200);
  });

  it("switching back to restricted cuts link access", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.settings.setGeneralAccess("page", note.id, { linkAccess: "anyone_with_link", linkRole: "viewer" }, alice.id);
    await h.settings.setGeneralAccess("page", note.id, { linkAccess: "restricted", linkRole: "viewer" }, alice.id);
    expect(await view(null, "page", note.id)).toBe(404);
    expect(await view(bob.id, "page", note.id)).toBe(404);
  });

  it("only owners can change general access", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" }, alice);
    expect(
      await statusOf(
        h.settings.setGeneralAccess("page", note.id, { linkAccess: "anyone_with_link", linkRole: "editor" }, bob.id),
      ),
    ).toBe(403);
  });
});

describe("publish to web", () => {
  it("publishes a note at a slug; unpublishing hides it; republishing keeps the URL", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Hello World" }, alice.id);
    const state = await h.settings.setPublished("page", note.id, true, alice.id);
    expect(state.published).toBe(true);
    expect(state.publicSlug).toMatch(/^hello-world-[a-z0-9_-]{6}$/);

    const pub = await h.public.getBySlug(state.publicSlug!);
    expect(pub.resource).toMatchObject({ kind: "page", title: "Hello World" });
    expect(JSON.stringify(pub)).not.toContain("alice@example.com");
    expect(JSON.stringify(pub)).not.toContain(alice.id);

    await h.settings.setPublished("page", note.id, false, alice.id);
    expect(await statusOf(h.public.getBySlug(state.publicSlug!))).toBe(404);

    const again = await h.settings.setPublished("page", note.id, true, alice.id);
    expect(again.publicSlug).toBe(state.publicSlug);
  });

  it("publishing a notebook exposes its contents, including items added later", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Field Guide" }, alice.id);
    const { publicSlug } = await h.settings.setPublished("notebook", nb.id, true, alice.id);
    const later = await h.pages.create(alice.workspaceId, { title: "Added later", notebookId: nb.id }, alice.id);

    const root = await h.public.getBySlug(publicSlug!);
    expect(root.resource.kind).toBe("notebook");
    const child = await h.public.getChild(publicSlug!, "page", later.id);
    expect(child.resource).toMatchObject({ kind: "page", title: "Added later" });

    const state = await h.settings.getPublishState("page", later.id, alice.id);
    expect(state.publishedVia).toMatchObject({ kind: "notebook", id: nb.id, name: "Field Guide" });
  });

  it("a published notebook's slug cannot be used to read notes outside it", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Public" }, alice.id);
    const { publicSlug } = await h.settings.setPublished("notebook", nb.id, true, alice.id);
    const secret = await h.pages.create(alice.workspaceId, { title: "Secret" }, alice.id);
    expect(await statusOf(h.public.getChild(publicSlug!, "page", secret.id))).toBe(404);
  });

  it("a canvas published on its own can be read through another published page's link", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Essay" }, alice.id);
    const { publicSlug } = await h.settings.setPublished("page", note.id, true, alice.id);
    const canvas = await h.canvases.create(alice.workspaceId, { title: "Diagram" }, alice.id);
    expect(await statusOf(h.public.getChild(publicSlug!, "canvas", canvas.id))).toBe(404);
    await h.settings.setPublished("canvas", canvas.id, true, alice.id);
    expect((await h.public.getChild(publicSlug!, "canvas", canvas.id)).resource.kind).toBe("canvas");
  });

  it("a published project serves its note and canvas", async () => {
    const proj = await h.projects.create(alice.workspaceId, { name: "Launch" }, alice.id);
    const { publicSlug } = await h.settings.setPublished("project", proj.project.id, true, alice.id);
    const pub = await h.public.getBySlug(publicSlug!);
    expect(pub.resource).toMatchObject({
      kind: "project",
      note: { title: "Launch | Note" },
      canvas: { title: "Launch | Canvas" },
    });
  });

  it("publishing does not grant anyone edit access", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Spec" }, alice.id);
    await h.settings.setPublished("page", note.id, true, alice.id);
    expect(await view(bob.id, "page", note.id)).toBe(404);
  });
});

describe("structure rules", () => {
  it("a project owns its pair: no deleting or moving them alone; archiving removes both", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const proj = await h.projects.create(alice.workspaceId, { name: "Launch" }, alice.id);
    expect(await statusOf(h.pages.softDelete(proj.noteId, alice.id))).toBe(400);
    expect(await statusOf(h.canvases.moveToNotebook(proj.canvasId, nb.id, alice.id))).toBe(400);
    await h.projects.archive(proj.project.id, alice.id);
    expect(await view(alice.id, "page", proj.noteId)).toBe(404);
    expect(await view(alice.id, "canvas", proj.canvasId)).toBe(404);
  });

  it("items can't be placed into another workspace's notebook", async () => {
    const bobsNotebook = await h.notebooks.create(bob.workspaceId, { name: "Bob's" }, bob.id);
    await h.shares.add({ resourceKind: "notebook", resourceId: bobsNotebook.id, email: alice.email, role: "editor" }, bob);
    expect(
      await statusOf(h.pages.create(alice.workspaceId, { title: "x", notebookId: bobsNotebook.id }, alice.id)),
    ).toBe(400);
  });

  it("deleting a notebook moves its items to the top level instead of deleting them", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const note = await h.pages.create(alice.workspaceId, { title: "Keep me", notebookId: nb.id }, alice.id);
    await h.notebooks.delete(nb.id, alice.id);
    const { page } = await h.pages.getOne(note.id, alice.id);
    expect(page.notebookId).toBeNull();
  });

  it("the database rejects a note that is both project-owned and in a notebook", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Q3" }, alice.id);
    const proj = await h.projects.create(alice.workspaceId, { name: "Launch" }, alice.id);
    await expect(
      h.pg.query(`update pages set notebook_id = $1 where id = $2`, [nb.id, proj.noteId]),
    ).rejects.toThrow(/pages_project_xor_notebook/);
  });

  it("canvas thumbnails must come from our own storage", async () => {
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    const canvas = await h.canvases.create(alice.workspaceId, { title: "c" }, alice.id);
    expect(
      await statusOf(h.canvases.update(canvas.id, { thumbnailUrl: "https://evil.example/pixel.png" }, alice.id)),
    ).toBe(400);
    const ok = await h.canvases.update(
      canvas.id,
      { thumbnailUrl: "https://proj.supabase.co/storage/v1/object/public/thumbs/c.png" },
      alice.id,
    );
    expect(ok.thumbnailUrl).toContain("/storage/v1/object/");
  });
});
