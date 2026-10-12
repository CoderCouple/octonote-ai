/**
 * Canvas figures: editors save a figure's PNG at a fixed path (so embeds
 * always show the latest); anyone who can view the canvas can read it.
 */
import { generateId } from "@octonote/shared";
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

// A real PNG signature followed by filler bytes.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");
const input = (over: Record<string, unknown> = {}) => ({
  title: "Login flow",
  width: 640,
  height: 360,
  contentHash: "h1",
  png: PNG,
  ...over,
});

async function canvas() {
  return h.canvases.create(alice.workspaceId, { title: "Architecture" }, alice.id);
}

describe("canvas figures", () => {
  it("stores the image at a fixed path, overwriting it on each change", async () => {
    const c = await canvas();
    const id = generateId("fig");
    const first = await h.figures.upsert(c.id, id, input(), alice.id);
    expect(first).toMatchObject({ id, canvasId: c.id, title: "Login flow", width: 640, height: 360 });
    expect(first.imageUrl).toMatch(new RegExp(`canvas-figures/${id}\\.png\\?v=\\d+$`));
    const upload = h.supabase.uploads.get(`canvas-figures/${id}.png`);
    expect(upload?.options).toMatchObject({ upsert: true, contentType: "image/png" });

    await new Promise((r) => setTimeout(r, 5));
    const second = await h.figures.upsert(c.id, id, input({ title: "Login flow v2", contentHash: "h2" }), alice.id);
    expect(second.title).toBe("Login flow v2");
    // Same object, new version so caches refetch it.
    expect(second.imageUrl!.split("?")[0]).toBe(first.imageUrl!.split("?")[0]);
    expect(second.imageUrl).not.toBe(first.imageUrl);
  });

  it("can update just the title without re-uploading", async () => {
    const c = await canvas();
    const id = generateId("fig");
    await h.figures.upsert(c.id, id, input(), alice.id);
    h.supabase.uploads.clear();
    const renamed = await h.figures.upsert(c.id, id, input({ title: "Renamed", png: undefined }), alice.id);
    expect(renamed.title).toBe("Renamed");
    expect(renamed.imageUrl).not.toBeNull();
    expect(h.supabase.uploads.size).toBe(0);
  });

  it("follows the canvas's permissions: viewers read, only editors write, outsiders see nothing", async () => {
    const c = await canvas();
    const id = generateId("fig");
    await h.figures.upsert(c.id, id, input(), alice.id);
    expect(await statusOf(h.figures.get(id, bob.id))).not.toBe(200);
    expect(await statusOf(h.figures.get(id, null))).not.toBe(200);

    await h.shares.add({ resourceKind: "canvas", resourceId: c.id, email: bob.email, role: "viewer" }, alice);
    expect((await h.figures.get(id, bob.id)).title).toBe("Login flow");
    expect(await statusOf(h.figures.upsert(c.id, id, input(), bob.id))).toBe(403);
  });

  it("rejects bad ids, non-PNG images and figures that belong to another canvas", async () => {
    const c = await canvas();
    const other = await canvas();
    expect(await statusOf(h.figures.upsert(c.id, "fig_nope", input(), alice.id))).toBe(400);
    expect(
      await statusOf(h.figures.upsert(c.id, generateId("fig"), input({ png: Buffer.from("GIF89a").toString("base64") }), alice.id)),
    ).toBe(400);
    const id = generateId("fig");
    await h.figures.upsert(c.id, id, input(), alice.id);
    expect(await statusOf(h.figures.upsert(other.id, id, input(), alice.id))).toBe(409);
  });

  it("deletes the row and its image", async () => {
    const c = await canvas();
    const id = generateId("fig");
    await h.figures.upsert(c.id, id, input(), alice.id);
    await h.figures.remove(c.id, id, alice.id);
    expect(await statusOf(h.figures.get(id, alice.id))).toBe(404);
    expect(h.supabase.removedObjects).toContain(`${id}.png`);
  });

  it("lists a workspace's figures for the picker, with canvas titles, skipping deleted canvases", async () => {
    const live = await canvas();
    const gone = await h.canvases.create(alice.workspaceId, { title: "Old" }, alice.id);
    await h.figures.upsert(live.id, generateId("fig"), input({ title: "Keep" }), alice.id);
    await h.figures.upsert(gone.id, generateId("fig"), input({ title: "Hidden" }), alice.id);
    await h.canvases.softDelete(gone.id, alice.id);

    const list = await h.figures.listForWorkspace(alice.workspaceId, alice.id);
    expect(list.map((f) => [f.title, f.canvasTitle])).toEqual([["Keep", "Architecture"]]);
    expect(await statusOf(h.figures.listForWorkspace(alice.workspaceId, bob.id))).toBe(403);
  });
});
