import { z } from "zod/v4";
import { SCHEMA_VERSION, sceneSchema } from "./schema.js";

/* Two-pass generation: plan the scenes, then write each one. */

const short = z.string().trim().min(1).max(300);

export const sceneOutlineSchema = z.object({
  title: short,
  scenes: z
    .array(
      z.object({
        title: short,
        summary: short.describe("What this scene shows and the one idea it gets across."),
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

/** How to write a good scene: the rules the model gets with the schema. */
export const SCENE_GUIDE = `Write one animated explainer scene in the style of 3Blue1Brown: show, don't tell; build the idea step by step; let motion reveal structure.

Canvas: 16 × 9 units (landscape) or 9 × 16 (portrait), origin at the centre, y up. The bottom strip shows the caption, so keep content inside x ±7.5 and y from -2.8 to 4.2 (landscape), or x ±4 and y from -5.5 to 7.5 (portrait). Captions over about 60 characters wrap to two lines and push that bottom limit up to y -2.3, so keep captions short. Portrait is only 9 units wide: keep formulas short or make them smaller. Leave room between text elements; nothing should overlap.

Placing things (prefer relationships over coordinates):
- at: [x, y], or { "of": "title", "side": "below", "gap": 0.4 }, or { "axes": "ax", "x": 2, "y": 4 } (axis coordinates), or { "axes": "ax", "x": 2, "plot": "f" } (on a curve).
- Put several things in a group with layout row, column or grid, and place the group.
- Lines and arrows go between points or element ids (they stop at the element's edge).

Elements: rect, circle, ellipse, dot, polygon (points or sides + r), line, arrow, curve, arc, brace, text, math (TeX), number (animatable value), axes, plot (formula in x on an axes), numberline, bars, table, grid, group.

Steps: each has a caption (one sentence the viewer reads) and actions that run together (or in order with "sequential": true), then holds about a second.
Actions: draw (outline on, then fill), write (text/math left to right), fadeIn/fadeOut, grow, show/hide, move (to a placement or by [dx, dy]), scale, rotate, color, morph (into another outline shape, which stays hidden), trace (move a dot along a line/curve/arc/circle/plot), indicate, circumscribe, flash, count (a number to a new value), camera (focus on a point or element, zoom), wait. Several targets with "stagger" reveal one after another.

Good scenes: start most elements hidden and bring them in; 4-8 steps; one new thing per step; use colour to link ideas (same colour for the same quantity everywhere); morph to show that two things are the same; trace to show change along a path; keep text short. Colours: blue, green, orange, purple, red, teal, yellow, pink, gray, ink, muted. Use these names rather than #hex: they adapt to the light and dark themes (ink is the text colour of either). Formulas in plots may only use x. Math elements take standard LaTeX maths (base and AMS commands); \\color{blue}{…} colours part of a formula with a palette colour, to tie it to a shape of the same colour.`;

/** Pass 2: one scene, written from one item of the plan. */
export function sceneToolDefinition(name = "create_scene") {
  return {
    name,
    description: `${SCENE_GUIDE}\n\nSet schemaVersion to "${SCHEMA_VERSION}" and type to "scene".`,
    inputSchema: jsonSchema(sceneSchema),
  };
}

/** The user message for pass 2, from the plan and one of its scenes. */
export function sceneRequest(outline: SceneOutline, index: number): string {
  const scene = outline.scenes[index];
  if (!scene) throw new Error(`The plan has no scene ${index}`);
  const steps = { short: 3, medium: 5, long: 8 }[scene.weight];
  return [`Explainer: ${outline.title}`, `Scene ${index + 1} of ${outline.scenes.length}: ${scene.title}`, `What it shows: ${scene.summary}`, `Use about ${steps} steps.`].join("\n");
}
