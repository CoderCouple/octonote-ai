/**
 * Manim explainer videos: Pro only (once billing is on), a daily cap, members
 * only, public status by unguessable id, and no job left "rendering" after a
 * restart. The render itself (model + worker) is covered by @octonote/manim.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { users, videos } from "../../src/db/schemas";
import { VideosService } from "../../src/service/videos.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let service: VideosService;
const env = { ...process.env };

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  service = new VideosService(h.db, h.supabase as never, h.planLimits, h.workspaces);
  // Configured, but pointing nowhere: jobs are queued and then fail, which these tests don't wait for.
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.MANIM_WORKER_URL = "http://127.0.0.1:9";
});

afterEach(() => {
  process.env = { ...env };
});

async function makePro(workspaceId: string) {
  const staff = await h.signIn("staff@octonote.ai");
  await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, staff.id));
  await h.admin.grant(workspaceId, { months: 1, reason: "test" }, staff.id);
}

const request = (workspaceId: string, concept = "Why is the sky blue?") => ({ workspaceId, concept, orientation: "landscape" as const });

describe("videos", () => {
  it("are Pro only once billing is enforced", async () => {
    expect(await statusOf(service.create(alice.id, request(alice.workspaceId)))).toBe(402);
    await makePro(alice.workspaceId);
    const video = await service.create(alice.id, request(alice.workspaceId));
    expect(video).toMatchObject({ status: "queued", orientation: "landscape", url: null });
    expect(video.id).toMatch(/^vid_/);
  });

  it("can only be made in a workspace you belong to", async () => {
    await makePro(alice.workspaceId);
    expect(await statusOf(service.create(bob.id, request(alice.workspaceId)))).toBe(403);
  });

  it("are capped per person per day", async () => {
    await makePro(alice.workspaceId);
    for (let i = 0; i < 10; i++) await h.db.insert(videos).values({ workspaceId: alice.workspaceId, createdByUserId: alice.id, concept: "x", status: "done" });
    expect(await statusOf(service.create(alice.id, request(alice.workspaceId)))).toBe(429);
  });

  it("need the AI and the worker configured", async () => {
    await makePro(alice.workspaceId);
    delete process.env.MANIM_WORKER_URL;
    expect(await statusOf(service.create(alice.id, request(alice.workspaceId)))).toBe(503);
  });

  it("show public URLs only once done, and unknown ids are 404", async () => {
    const [row] = await h.db
      .insert(videos)
      .values({ workspaceId: alice.workspaceId, createdByUserId: alice.id, concept: "x", status: "done", title: "Sky", videoPath: "w/vid.mp4", posterPath: "w/vid.jpg", durationSeconds: 90, chapters: [{ title: "Intro", caption: "c", start: 0, end: 9 }] })
      .returning();
    expect(await service.get(row!.id)).toMatchObject({
      status: "done",
      title: "Sky",
      url: "https://storage.test/note-videos/w/vid.mp4",
      posterUrl: "https://storage.test/note-videos/w/vid.jpg",
      duration: 90,
      chapters: [{ title: "Intro" }],
    });
    expect(await statusOf(service.get("vid_00000000-0000-4000-8000-000000000000"))).toBe(404);
  });

  it("don't stay stuck after a restart", async () => {
    const [row] = await h.db.insert(videos).values({ workspaceId: alice.workspaceId, createdByUserId: alice.id, concept: "x", status: "render" }).returning();
    await service.onModuleInit();
    expect(await service.get(row!.id)).toMatchObject({ status: "failed", error: expect.stringContaining("restarted") });
  });
});
