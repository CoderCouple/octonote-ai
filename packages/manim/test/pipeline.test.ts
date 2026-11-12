import { describe, expect, it } from "vitest";
import { chaptersVtt, fallbackScene, generateVideo, sceneClass, storyboardSchema, unfence, type ModelClient, type Renderer, type Storyboard } from "../src/index.js";

const board: Storyboard = {
  title: "Why the sky is blue",
  scenes: Array.from({ length: 6 }, (_, i) => ({ title: `Part ${i + 1}`, caption: `Caption "${i + 1}"`, visual: "A circle grows.", seconds: 12 })),
};

const goodCode = (i: number) => `from manim import *\nfrom octo import *\n\nclass ${sceneClass(i)}(OctoScene):\n    def construct(self):\n        self.wait(1)\n`;

/** Answers each tool with a scripted value, recording calls. */
function fakeModel(overrides: Partial<Record<string, unknown[]>> = {}): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const queues: Record<string, unknown[]> = {
    plan_video: [board],
    write_scenes: [{ scenes: board.scenes.map((_, i) => ({ index: i + 1, code: "```python\n" + goodCode(i + 1) + "```" })) }],
    fix_scene: [],
    ...overrides,
  };
  return {
    calls,
    async callTool({ tool }) {
      calls.push(tool.name);
      const next = queues[tool.name]?.shift();
      if (next === undefined) throw new Error(`no answer for ${tool.name}`);
      return next;
    },
  };
}

/** A renderer that fails code containing BROKEN, with a traceback. */
function fakeRenderer(): Renderer & { rendered: string[] } {
  const rendered: string[] = [];
  return {
    rendered,
    async render({ code, scene }) {
      rendered.push(scene);
      if (code.includes("BROKEN")) return { ok: false, stage: "render", error: "undefined name", detail: "NameError: name 'BROKEN' is not defined" };
      return { ok: true, mp4: Buffer.from(scene).toString("base64"), duration: 10, bytes: 100 };
    },
    async concat(videos) {
      return { ok: true, mp4: videos.join("|"), poster: null, duration: videos.length * 10, bytes: 600 };
    },
  };
}

describe("storyboards", () => {
  it("must add up to 60-120 seconds in 6-14 scenes", () => {
    expect(storyboardSchema.safeParse(board).success).toBe(true);
    expect(storyboardSchema.safeParse({ ...board, scenes: board.scenes.map((s) => ({ ...s, seconds: 4 })) }).success).toBe(false);
    expect(storyboardSchema.safeParse({ ...board, scenes: board.scenes.slice(0, 3) }).success).toBe(false);
  });
});

describe("generateVideo", () => {
  it("plans, writes, renders every scene and joins them with chapters", async () => {
    const model = fakeModel();
    const renderer = fakeRenderer();
    const progress: string[] = [];
    const video = await generateVideo({ concept: "Why is the sky blue?", model, renderer, onProgress: (p) => progress.push(p.stage) });
    expect(model.calls).toEqual(["plan_video", "write_scenes"]);
    expect(renderer.rendered).toHaveLength(6);
    expect(video.chapters.map((c) => [c.start, c.end])).toEqual([[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60]]);
    expect(progress[0]).toBe("storyboard");
    expect(progress.at(-1)).toBe("join");
    expect(video.fallbacks).toBe(0);
  });

  it("repairs a failing scene from its traceback, and falls back to a title card if repairs fail", async () => {
    const scenes = board.scenes.map((_, i) => ({ index: i + 1, code: i === 1 ? goodCode(2).replace("self.wait(1)", "BROKEN") : i === 3 ? goodCode(4).replace("self.wait(1)", "BROKEN") : goodCode(i + 1) }));
    const model = fakeModel({ write_scenes: [{ scenes }], fix_scene: [{ code: goodCode(2) }, { code: "still BROKEN code here" }, { code: "BROKEN again, still failing" }] });
    const video = await generateVideo({ concept: "x", model, renderer: fakeRenderer(), concurrency: 1 });
    expect(video.repaired).toBe(1);
    expect(video.fallbacks).toBe(1);
    expect(video.chapters[3]!.fallback).toBe(true);
    expect(model.calls.filter((c) => c === "fix_scene")).toHaveLength(3);
  });

  it("asks the model to fix an invalid storyboard once", async () => {
    const model = fakeModel({ plan_video: [{ title: "T", scenes: [] }, board] });
    await generateVideo({ concept: "x", model, renderer: fakeRenderer() });
    expect(model.calls.slice(0, 2)).toEqual(["plan_video", "plan_video"]);
  });
});

describe("helpers", () => {
  it("fallback scenes escape text safely", () => {
    const code = fallbackScene(3, { title: 'Say "hi"\n', caption: "It's \\ fine", visual: "", seconds: 8 });
    expect(code).toContain("class Scene03(OctoScene)");
    expect(code).toContain('"Say \\"hi\\"\\n"');
  });

  it("unfence strips markdown fences", () => {
    expect(unfence("```python\nprint(1)\n```")).toBe("print(1)\n");
  });

  it("chapters become WebVTT", () => {
    expect(chaptersVtt([{ title: "Intro", caption: "", start: 0, end: 61.5 }])).toBe("WEBVTT\n\n1\n00:00:00.000 --> 00:01:01.500\nIntro\n");
  });
});
