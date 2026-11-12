import { z } from "zod/v4";
import { codeRequest, codeSystem, repairRequest, storyboardRequest, storyboardSystem } from "./prompts.js";
import { fixedCodeSchema, LIMITS, sceneClass, sceneCodeSchema, storyboardSchema, type Chapter, type Orientation, type Storyboard, type StoryboardScene } from "./schema.js";

/** The one thing needed from a model provider: force a tool call and return its input (compose's ModelClient fits). */
export interface ModelClient {
  callTool(request: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    tool: { name: string; description: string; inputSchema: Record<string, unknown> };
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export type RenderResult = { ok: true; mp4: string; duration: number; bytes: number } | { ok: false; stage: string; error: string; detail: string };
export type ConcatResult = { ok: true; mp4: string; poster: string | null; duration: number; bytes: number } | { ok: false; error: string };

/** Where scenes are rendered: the sandboxed worker, or a fake in tests. */
export interface Renderer {
  render(request: { code: string; scene: string; orientation: Orientation; preview?: boolean }): Promise<RenderResult>;
  concat(videos: string[]): Promise<ConcatResult>;
}

export type VideoProgress =
  | { stage: "storyboard" }
  | { stage: "code"; scenes: number }
  | { stage: "render"; done: number; total: number; repaired: number; fallbacks: number }
  | { stage: "join" };

export interface GeneratedVideo {
  title: string;
  orientation: Orientation;
  storyboard: Storyboard;
  chapters: Chapter[];
  /** Base64 MP4 and JPEG poster. */
  mp4: string;
  poster: string | null;
  duration: number;
  bytes: number;
  repaired: number;
  fallbacks: number;
}

export interface GenerateOptions {
  concept: string;
  orientation?: Orientation;
  model: ModelClient;
  renderer: Renderer;
  onProgress?: (progress: VideoProgress) => void;
  signal?: AbortSignal;
  /** Repair rounds per failing scene before it becomes a title card. Defaults to 2. */
  repairs?: number;
  /** Scenes rendered at once. Defaults to 2 (the worker's own limit). */
  concurrency?: number;
}

const tool = (name: string, description: string, schema: z.ZodType) => ({ name, description, inputSchema: z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown> });

/** Pulls the code out of a ```python fence if the model wrapped it in one. */
export function unfence(code: string): string {
  const fenced = /```(?:python|py)?\s*\n([\s\S]*?)```/.exec(code);
  return (fenced ? fenced[1]! : code).trim() + "\n";
}

/**
 * A scene that can't fail: the chapter title and its caption. Used when a
 * scene's animation still doesn't render after repairs, so the video always
 * completes. Text is passed through JSON so quotes can't break the Python.
 */
export function fallbackScene(index: number, scene: StoryboardScene): string {
  const seconds = Math.max(3, scene.seconds - 1.5);
  return `from manim import *
from octo import *

class ${sceneClass(index)}(OctoScene):
    def construct(self):
        heading = title_text(${JSON.stringify(scene.title)}, size=44, color=BLUE)
        self.play(FadeIn(heading, shift=0.2 * UP), run_time=0.6)
        self.caption(${JSON.stringify(scene.caption)})
        self.wait(${seconds.toFixed(1)})
        self.clear()
`;
}

export async function planStoryboard(concept: string, orientation: Orientation, model: ModelClient, signal?: AbortSignal): Promise<Storyboard> {
  const request = { system: storyboardSystem(orientation), tool: tool("plan_video", "Plan the explainer video as scenes.", storyboardSchema), maxTokens: 6000, signal };
  let raw = await model.callTool({ ...request, messages: [{ role: "user", content: storyboardRequest(concept.slice(0, LIMITS.conceptLength)) }] });
  let parsed = storyboardSchema.safeParse(raw);
  if (!parsed.success) {
    // One repair: show the model what was wrong with its plan.
    const problems = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(plan)"}: ${i.message}`).join("\n");
    raw = await model.callTool({
      ...request,
      messages: [{ role: "user", content: `${storyboardRequest(concept)}\n\nYour previous plan had problems; fix them:\n${problems}\n\n${JSON.stringify(raw).slice(0, 8000)}` }],
    });
    parsed = storyboardSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`The video plan was invalid: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

/** Concept → storyboard → scene code → sandboxed renders (with repairs) → one MP4 with chapters. */
export async function generateVideo({ concept, orientation = "landscape", model, renderer, onProgress, signal, repairs = 2, concurrency = 2 }: GenerateOptions): Promise<GeneratedVideo> {
  onProgress?.({ stage: "storyboard" });
  const board = await planStoryboard(concept, orientation, model, signal);
  const total = board.scenes.length;

  onProgress?.({ stage: "code", scenes: total });
  const written = sceneCodeSchema.safeParse(
    await model.callTool({ system: codeSystem(orientation), messages: [{ role: "user", content: codeRequest(board) }], tool: tool("write_scenes", "Write the code for every scene.", sceneCodeSchema), maxTokens: 32_000, signal }),
  );
  const codeFor = new Map((written.success ? written.data.scenes : []).map((s) => [s.index, unfence(s.code)]));

  const results: { mp4: string; duration: number; fallback: boolean }[] = new Array(total);
  let done = 0;
  let repaired = 0;
  let fallbacks = 0;
  const report = () => onProgress?.({ stage: "render", done, total, repaired, fallbacks });
  report();

  const renderScene = async (i: number) => {
    const index = i + 1;
    const className = sceneClass(index);
    const scene = board.scenes[i]!;
    let code = codeFor.get(index);
    for (let attempt = 0; code && attempt <= repairs; attempt++) {
      if (signal?.aborted) throw new Error("Cancelled");
      const result = await renderer.render({ code, scene: className, orientation });
      if (result.ok) {
        if (attempt > 0) repaired++;
        results[i] = { mp4: result.mp4, duration: result.duration, fallback: false };
        return;
      }
      if (attempt === repairs) break;
      // Repair from the real error, keeping the scene, instead of starting over.
      const fixed = fixedCodeSchema.safeParse(
        await model
          .callTool({
            system: codeSystem(orientation),
            messages: [{ role: "user", content: repairRequest(code, className, result.stage, result.detail || result.error) }],
            tool: tool("fix_scene", "Return the corrected scene file.", fixedCodeSchema),
            maxTokens: 12_000,
            signal,
          })
          .catch(() => null),
      );
      code = fixed.success ? unfence(fixed.data.code) : undefined;
    }
    const fallback = await renderer.render({ code: fallbackScene(index, scene), scene: className, orientation });
    if (!fallback.ok) throw new Error(`Scene ${index} couldn't be rendered even as a title card: ${fallback.error}`);
    fallbacks++;
    results[i] = { mp4: fallback.mp4, duration: fallback.duration, fallback: true };
  };

  // A small pool: `concurrency` scenes render at once, in order of index.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (next < total) {
        const i = next++;
        await renderScene(i);
        done++;
        report();
      }
    }),
  );

  onProgress?.({ stage: "join" });
  const joined = await renderer.concat(results.map((r) => r.mp4));
  if (!joined.ok) throw new Error(`Joining the scenes failed: ${joined.error}`);

  let start = 0;
  const chapters = board.scenes.map((scene, i): Chapter => {
    const chapter = { title: scene.title, caption: scene.caption, start, end: start + results[i]!.duration, ...(results[i]!.fallback ? { fallback: true } : {}) };
    start = chapter.end;
    return chapter;
  });

  return { title: board.title, orientation, storyboard: board, chapters, mp4: joined.mp4, poster: joined.poster, duration: joined.duration, bytes: joined.bytes, repaired, fallbacks };
}

/** A Renderer over the HTTP worker in services/manim-worker. */
export function workerRenderer(baseUrl: string, token?: string): Renderer {
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-worker-token": token } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Render worker answered ${response.status}`);
    return response.json();
  };
  return {
    render: (request) => post("/render", request) as Promise<RenderResult>,
    concat: (videos) => post("/concat", { videos }) as Promise<ConcatResult>,
  };
}
