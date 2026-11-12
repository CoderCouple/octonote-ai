import { z } from "zod/v4";

export const LIMITS = {
  jsonLength: 500_000,
  idLength: 64,
  text: 300,
  elements: 120,
  steps: 60,
  actionsPerStep: 30,
  canvas: 4000,
  stepMs: 20_000,
} as const;

export const SCHEMA_VERSION = "1.0";

export const COLORS = ["blue", "green", "orange", "purple", "red", "teal", "gray", "ink"] as const;
export type SceneColor = (typeof COLORS)[number];

const id = z.string().min(1).max(LIMITS.idLength).regex(/^[A-Za-z0-9_.:-]+$/, "Use only letters, digits, _ . : or -");
const text = z.string().trim().min(1).max(LIMITS.text);
const coord = z.number().min(-LIMITS.canvas).max(LIMITS.canvas);
const size = z.number().positive().max(LIMITS.canvas);
const color = z.enum(COLORS).optional();

const base = {
  id,
  hidden: z.boolean().optional().describe("Start hidden; a later step shows it."),
  color,
};

export const boxElement = z.object({ ...base, kind: z.literal("box"), x: coord, y: coord, w: size, h: size, text: text.optional() }).describe("A rounded rectangle; x, y is its top-left corner.");
export const circleElement = z.object({ ...base, kind: z.literal("circle"), x: coord, y: coord, r: size, text: text.optional() }).describe("x, y is the centre.");
export const textElement = z.object({ ...base, kind: z.literal("text"), x: coord, y: coord, text, size: z.number().min(8).max(96).optional(), align: z.enum(["start", "middle", "end"]).optional() });
export const arrowElement = z.object({ ...base, kind: z.literal("arrow"), from: id, to: id, label: text.optional(), dashed: z.boolean().optional() }).describe("Joins two boxes or circles, edge to edge.");
export const counterElement = z
  .object({ ...base, kind: z.literal("counter"), x: coord, y: coord, value: z.number(), prefix: z.string().max(12).optional(), suffix: z.string().max(12).optional(), size: z.number().min(8).max(160).optional() })
  .describe("A number that animates when a step counts it to a new value.");

export const sceneElement = z.discriminatedUnion("kind", [boxElement, circleElement, textElement, arrowElement, counterElement]);

export const sceneAction = z.discriminatedUnion("do", [
  z.object({ do: z.literal("show"), target: id }),
  z.object({ do: z.literal("hide"), target: id }),
  z.object({ do: z.literal("move"), target: id, x: coord, y: coord }).describe("Moves a box, circle, text or counter (same anchor as its x, y)."),
  z.object({ do: z.literal("highlight"), target: id }).describe("Pulses the element during this step only."),
  z.object({ do: z.literal("color"), target: id, color: z.enum(COLORS) }),
  z.object({ do: z.literal("count"), target: id, value: z.number() }),
  z.object({ do: z.literal("text"), target: id, text }).describe("Replaces an element's text."),
]);

export const sceneStep = z.object({
  caption: text.describe("One sentence the viewer reads during this step."),
  duration: z.number().int().min(300).max(LIMITS.stepMs).optional().describe("Milliseconds before autoplay moves on. Defaults to 2400."),
  actions: z.array(sceneAction).max(LIMITS.actionsPerStep),
});

export const sceneSchema = z
  .object({
    schemaVersion: z.string().regex(/^1\.\d+$/, `Unsupported schemaVersion; this library reads 1.x (current ${SCHEMA_VERSION})`).describe(`Always "${SCHEMA_VERSION}".`),
    type: z.literal("scene"),
    id,
    title: text.optional(),
    width: size.optional().describe("Canvas width in scene units. Defaults to 800."),
    height: size.optional().describe("Canvas height in scene units. Defaults to 450."),
    elements: z.array(sceneElement).min(1).max(LIMITS.elements),
    steps: z.array(sceneStep).min(1).max(LIMITS.steps),
  })
  .superRefine((scene, ctx) => {
    const kinds = new Map<string, string>();
    scene.elements.forEach((el, i) => {
      if (kinds.has(el.id)) ctx.addIssue({ code: "custom", message: `Duplicate id "${el.id}"`, path: ["elements", i, "id"] });
      kinds.set(el.id, el.kind);
    });
    scene.elements.forEach((el, i) => {
      if (el.kind !== "arrow") return;
      for (const end of ["from", "to"] as const) {
        const kind = kinds.get(el[end]);
        if (kind !== "box" && kind !== "circle") ctx.addIssue({ code: "custom", message: `Arrows join boxes or circles; "${el[end]}" isn't one`, path: ["elements", i, end] });
      }
    });
    scene.steps.forEach((step, s) =>
      step.actions.forEach((action, a) => {
        const path = ["steps", s, "actions", a, "target"];
        const kind = kinds.get(action.target);
        if (!kind) return ctx.addIssue({ code: "custom", message: `No element has id "${action.target}"`, path });
        if (action.do === "move" && kind === "arrow") ctx.addIssue({ code: "custom", message: "Arrows follow their ends; move those instead", path });
        if (action.do === "count" && kind !== "counter") ctx.addIssue({ code: "custom", message: "Only counters can count", path });
        if (action.do === "text" && !["box", "circle", "text"].includes(kind)) ctx.addIssue({ code: "custom", message: "Only boxes, circles and text have text", path });
      }),
    );
  });

export type SceneElement = z.infer<typeof sceneElement>;
export type SceneAction = z.infer<typeof sceneAction>;
export type SceneStep = z.infer<typeof sceneStep>;
export type Scene = z.infer<typeof sceneSchema>;

export interface SpecIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; spec: T } | { ok: false; issues: SpecIssue[] };

/** Checks a scene from any source. Never throws. */
export function validateScene(input: unknown): ValidationResult<Scene> {
  const parsed = sceneSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}

export function parseScene(json: string): ValidationResult<Scene> {
  if (json.length > LIMITS.jsonLength) return { ok: false, issues: [{ path: "", message: `Longer than ${LIMITS.jsonLength} characters` }] };
  try {
    return validateScene(JSON.parse(json));
  } catch (error) {
    return { ok: false, issues: [{ path: "", message: `Not valid JSON: ${(error as Error).message}` }] };
  }
}

/* Two-pass generation: plan the scenes, then write each one. */

export const sceneOutlineSchema = z.object({
  title: text,
  scenes: z
    .array(
      z.object({
        title: text,
        summary: text.describe("What this scene shows and the idea it gets across."),
        weight: z.enum(["short", "medium", "long"]).describe("Roughly 3, 5 or 8 steps."),
      }),
    )
    .min(1)
    .max(12),
});

export type SceneOutline = z.infer<typeof sceneOutlineSchema>;

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

/** Pass 1: the plan for an animated explanation. */
export function outlineToolDefinition(name = "plan_explainer") {
  return {
    name,
    description: "Plan an animated explanation as a short list of scenes, each one idea. Order them so each builds on the last.",
    inputSchema: jsonSchema(sceneOutlineSchema),
  };
}

/** Pass 2: one scene, written from one item of the plan. */
export function sceneToolDefinition(name = "create_scene") {
  return {
    name,
    description: [
      "Write one animated explainer scene as shapes on a canvas plus a timeline of steps.",
      `Set schemaVersion to "${SCHEMA_VERSION}". The canvas is 800 × 450 unless you set width and height; keep every shape inside it with 24 units of margin.`,
      "Start most elements hidden and reveal them step by step. Each step has a one-sentence caption and the actions it plays: show, hide, move, highlight, color, count, text.",
      "Arrows join boxes or circles by id. Use short labels (three words or fewer). Colors: blue, green, orange, purple, red, teal, gray, ink.",
    ].join("\n"),
    inputSchema: jsonSchema(sceneSchema),
  };
}

/** The user message for pass 2, from the plan and one of its scenes. */
export function sceneRequest(outline: SceneOutline, index: number): string {
  const scene = outline.scenes[index];
  if (!scene) throw new Error(`The plan has no scene ${index}`);
  const steps = { short: 3, medium: 5, long: 8 }[scene.weight];
  return [
    `Explainer: ${outline.title}`,
    `Scene ${index + 1} of ${outline.scenes.length}: ${scene.title}`,
    `What it shows: ${scene.summary}`,
    `Use about ${steps} steps.`,
  ].join("\n");
}
