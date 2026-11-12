import { z } from "zod/v4";

export type Orientation = "landscape" | "portrait";

export const LIMITS = {
  minScenes: 6,
  maxScenes: 14,
  minSeconds: 60,
  maxSeconds: 120,
  sceneSeconds: [4, 15] as const,
  captionLength: 140,
  conceptLength: 1000,
} as const;

/** One scene of the plan: what it shows, the caption on screen, and how long it lasts. */
export const storyboardSceneSchema = z.object({
  title: z.string().trim().min(1).max(80).describe("A short chapter name."),
  caption: z.string().trim().min(1).max(LIMITS.captionLength).describe("The one or two sentences shown on screen during this scene."),
  visual: z.string().trim().min(1).max(600).describe("What is drawn and how it moves, concretely enough to code."),
  seconds: z.number().min(LIMITS.sceneSeconds[0]).max(LIMITS.sceneSeconds[1]),
});

export const storyboardSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    scenes: z.array(storyboardSceneSchema).min(LIMITS.minScenes).max(LIMITS.maxScenes),
  })
  .superRefine((board, ctx) => {
    const total = board.scenes.reduce((sum, s) => sum + s.seconds, 0);
    if (total < LIMITS.minSeconds - 10 || total > LIMITS.maxSeconds + 10) {
      ctx.addIssue({ code: "custom", message: `Scenes add up to ${Math.round(total)}s; aim for ${LIMITS.minSeconds}-${LIMITS.maxSeconds}s`, path: ["scenes"] });
    }
  });

export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;
export type Storyboard = z.infer<typeof storyboardSchema>;

export const sceneCodeSchema = z.object({
  scenes: z
    .array(z.object({ index: z.number().int().min(1).max(LIMITS.maxScenes), code: z.string().min(20).max(40_000) }))
    .min(1)
    .max(LIMITS.maxScenes),
});

export const fixedCodeSchema = z.object({ code: z.string().min(20).max(40_000) });

/** The class name every scene must use, so the worker knows what to render. */
export const sceneClass = (index: number) => `Scene${String(index).padStart(2, "0")}`;

export interface Chapter {
  title: string;
  caption: string;
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  /** True when this scene fell back to a title card after its animation kept failing. */
  fallback?: boolean;
}

/** Chapters as WebVTT, for the player's chapter menu. */
export function chaptersVtt(chapters: readonly Chapter[]): string {
  const time = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  return ["WEBVTT", "", ...chapters.flatMap((c, i) => [`${i + 1}`, `${time(c.start)} --> ${time(c.end)}`, c.title.replace(/-->/g, "→"), ""])].join("\n");
}
