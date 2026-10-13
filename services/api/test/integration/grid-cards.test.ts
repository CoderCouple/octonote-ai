/**
 * Grid views: list endpoints carry what a card shows — a project's canvas
 * thumbnail, a notebook's item counts — and a published notebook's items
 * carry a thumbnail, a note excerpt and reading time.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness";

const THUMB = "https://proj.supabase.co/storage/v1/object/public/canvas-thumbnails/x.png";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
});

async function slugOf(id: string) {
  const [row] = await h.db.query.notebooks.findMany({ where: (n, { eq }) => eq(n.id, id), limit: 1 });
  return row!.publicSlug!;
}

describe("list endpoints for grid cards", () => {
  it("a project in the list carries its canvas's thumbnail", async () => {
    const { canvasId, project } = await h.projects.create(alice.workspaceId, { name: "Shortener" }, alice.id);
    expect((await h.projects.listForWorkspace(alice.workspaceId, alice.id))[0]!.thumbnailUrl).toBeNull();
    await h.canvases.update(canvasId, { thumbnailUrl: THUMB }, alice.id);
    const [row] = await h.projects.listForWorkspace(alice.workspaceId, alice.id);
    expect(row!.id).toBe(project.id);
    expect(row!.thumbnailUrl).toBe(THUMB);
  });

  it("a notebook in the list counts its live items by kind", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Guides" }, alice.id);
    const ws = alice.workspaceId;
    await h.pages.create(ws, { title: "One", notebookId: nb.id }, alice.id);
    const gone = await h.pages.create(ws, { title: "Two", notebookId: nb.id }, alice.id);
    await h.canvases.create(ws, { title: "Board", notebookId: nb.id }, alice.id);
    await h.projects.create(ws, { name: "Proj", notebookId: nb.id }, alice.id);
    // Outside the notebook: not counted. Nor is a project's own note/canvas.
    await h.pages.create(ws, { title: "Loose" }, alice.id);
    await h.pages.softDelete(gone.id, alice.id);

    const [row] = await h.notebooks.listForWorkspace(ws, alice.id);
    expect(row!.counts).toEqual({ notes: 1, canvases: 1, projects: 1 });
  });
});

describe("published notebook items", () => {
  it("carry a thumbnail, an excerpt and reading time per item", async () => {
    const ws = alice.workspaceId;
    const nb = await h.notebooks.create(ws, { name: "Guides" }, alice.id);
    const note = await h.pages.create(ws, { title: "Caching", notebookId: nb.id }, alice.id);
    await h.pages.update(
      note.id,
      { contentMd: `# Caching\n\n**Caches** keep hot data close. ${"word ".repeat(400)}` },
      alice.id,
    );
    const canvas = await h.canvases.create(ws, { title: "Board", notebookId: nb.id }, alice.id);
    await h.canvases.update(canvas.id, { thumbnailUrl: THUMB }, alice.id);
    const { project, noteId, canvasId } = await h.projects.create(
      ws,
      { name: "Shortener", notebookId: nb.id },
      alice.id,
    );
    await h.pages.update(noteId, { contentMd: "Short codes map to long URLs." }, alice.id);
    await h.canvases.update(canvasId, { thumbnailUrl: THUMB }, alice.id);
    await h.settings.setPublished("notebook", nb.id, true, alice.id);

    const view = await h.public.getBySlug(await slugOf(nb.id));
    if (view.resource.kind !== "notebook") throw new Error("expected a notebook");
    const byId = new Map(view.resource.items.map((i) => [i.id, i]));

    expect(byId.get(note.id)).toMatchObject({
      thumbnailUrl: null,
      minutes: 2,
    });
    // Markdown is stripped and the repeated title dropped.
    expect(byId.get(note.id)!.excerpt).toMatch(/^Caches keep hot data close\./);
    expect(byId.get(canvas.id)).toMatchObject({ thumbnailUrl: THUMB, excerpt: null, minutes: null });
    expect(byId.get(project.id)).toMatchObject({
      thumbnailUrl: THUMB,
      excerpt: "Short codes map to long URLs.",
      minutes: 1,
    });
  });
});
