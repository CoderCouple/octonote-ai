import { z } from "zod/v4";
import { compile, FormulaError, namesIn } from "./engine/formula.js";

/**
 * Explainer scenes (version 2): elements on a canvas measured in units with the
 * origin at the centre and y pointing up (16 × 9 landscape, 9 × 16 portrait),
 * and steps of actions that animate them. Elements can be placed by
 * relationship ("below the title", "in a row") or by axis coordinates, so a
 * model rarely has to compute positions.
 */
export const SCHEMA_VERSION = "2.0";

export const LIMITS = {
  jsonLength: 500_000,
  elements: 150,
  steps: 60,
  actionsPerStep: 30,
  text: 300,
  coordinate: 100,
  stepSeconds: 30,
} as const;

export const COLORS = ["blue", "green", "orange", "purple", "red", "teal", "yellow", "pink", "gray", "ink", "muted"] as const;
export type SceneColor = (typeof COLORS)[number];

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/, "Use only letters, digits, _ . : or -");
const text = z.string().max(LIMITS.text);
const num = z.number().finite().min(-LIMITS.coordinate).max(LIMITS.coordinate);
const pos = z.number().finite().positive().max(LIMITS.coordinate);
/** Data values (axis ranges, axis coordinates): not canvas units, so not limited to the canvas. */
const data = z.number().finite().min(-1e9).max(1e9);
const dataStep = z.number().finite().positive().max(1e9);
const point = z.tuple([num, num]);
const color = z.union([z.enum(COLORS), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional().describe("A palette name or #rrggbb.");

/** Where an element's centre goes. */
export const placement = z.union([
  point.describe("[x, y] in scene units."),
  z.object({ of: id, side: z.enum(["above", "below", "left", "right", "center"]).optional(), gap: z.number().min(0).max(10).optional() }).describe("Next to another element."),
  z.object({ axes: id, x: data, y: data.optional(), plot: id.optional() }).describe("At (x, y) in an axes' coordinates; with plot and no y, on that plot's curve."),
]);

/** An end of a line or arrow: a point, or the edge of an element facing the other end. */
const end = z.union([point, id]);

const base = {
  id,
  at: placement.optional(),
  color,
  fill: z.union([z.boolean(), z.enum(COLORS), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional().describe("true fills with a light tint of the colour."),
  opacity: z.number().min(0).max(1).optional(),
  scale: z.number().positive().max(20).optional(),
  rotate: z.number().min(-3600).max(3600).optional().describe("Degrees, counter-clockwise."),
  hidden: z.boolean().optional().describe("Start invisible; a later action (draw, write, fadeIn, grow, show) brings it in."),
  stroke: z.number().min(0).max(1).optional().describe("Line width in units. Defaults to 0.04."),
};

const shape = <K extends string, S extends z.ZodRawShape>(kind: K, shape: S) => z.object({ shape: z.literal(kind), ...base, ...shape });

export const elementSchema = z.discriminatedUnion("shape", [
  shape("rect", { w: pos, h: pos, radius: z.number().min(0).max(10).optional(), label: text.optional() }),
  shape("circle", { r: pos, label: text.optional() }),
  shape("ellipse", { rx: pos, ry: pos }),
  shape("dot", { r: pos.optional(), label: text.optional() }),
  shape("polygon", { points: z.array(point).min(3).max(60).optional().describe("Relative to at."), sides: z.number().int().min(3).max(12).optional(), r: pos.optional() }),
  shape("line", { from: end, to: end }),
  shape("arrow", { from: end, to: end, label: text.optional(), dashed: z.boolean().optional() }),
  shape("curve", { points: z.array(point).min(2).max(60).describe("Absolute points; drawn as a smooth curve."), closed: z.boolean().optional() }),
  shape("arc", { r: pos, start: z.number(), end: z.number().describe("Degrees.") }),
  shape("brace", { from: point, to: point, label: text.optional() }),
  shape("text", { text, size: z.number().min(0.1).max(3).optional().describe("Height in units. Defaults to 0.45."), weight: z.enum(["normal", "bold"]).optional() }),
  shape("math", { tex: text, size: z.number().min(0.1).max(3).optional() }),
  shape("number", { value: z.number().finite(), decimals: z.number().int().min(0).max(6).optional(), prefix: z.string().max(10).optional(), suffix: z.string().max(10).optional(), size: z.number().min(0.1).max(4).optional() }),
  shape("axes", {
    x: z.tuple([data, data, dataStep]).describe("[min, max, tick step] in data units"),
    y: z.tuple([data, data, dataStep]),
    width: pos.optional(),
    height: pos.optional(),
    labels: z.boolean().optional().describe("Number the ticks. Defaults to true."),
    xLabel: text.optional(),
    yLabel: text.optional(),
  }),
  shape("plot", { axes: id, y: z.string().min(1).max(300).describe("A formula in x, e.g. sin(x) or x^2 / 4."), domain: z.tuple([data, data]).optional() }),
  shape("numberline", { range: z.tuple([data, data, dataStep]), width: pos.optional(), labels: z.boolean().optional() }),
  shape("bars", { values: z.array(z.number().finite()).min(1).max(30), labels: z.array(text).max(30).optional(), max: z.number().positive().optional(), width: pos.optional(), height: pos.optional() }),
  shape("table", { rows: z.array(z.array(text).min(1).max(10)).min(1).max(12), cell: z.tuple([pos, pos]).optional().describe("[width, height] of a cell.") }),
  shape("grid", { cols: z.number().int().min(1).max(40), rows: z.number().int().min(1).max(40), cell: pos.optional() }),
  shape("group", {
    children: z.array(id).min(1).max(60),
    layout: z.enum(["row", "column", "grid", "none"]).optional().describe("Arrange the children; defaults to row."),
    gap: z.number().min(0).max(10).optional(),
    columns: z.number().int().min(1).max(20).optional(),
  }),
]);

export type SceneElement = z.infer<typeof elementSchema>;
export type ElementShape = SceneElement["shape"];

const targets = z.union([id, z.array(id).min(1).max(40)]);
const timing = {
  duration: z.number().min(0).max(LIMITS.stepSeconds).optional(),
  delay: z.number().min(0).max(LIMITS.stepSeconds).optional(),
  ease: z.enum(["linear", "smooth", "in", "out", "back", "elastic"]).optional(),
  stagger: z.number().min(0).max(5).optional().describe("Seconds between targets when there are several."),
};
const action = <D extends string, S extends z.ZodRawShape>(name: D, shape: S) => z.object({ do: z.literal(name), target: targets, ...timing, ...shape });

export const actionSchema = z.discriminatedUnion("do", [
  action("show", {}),
  action("hide", {}),
  action("fadeIn", { from: z.enum(["up", "down", "left", "right"]).optional() }),
  action("fadeOut", {}),
  action("draw", {}).describe("Strokes the outline on, then fills. Shapes, lines, plots, axes, bars, tables."),
  action("write", {}).describe("Reveals text or math from left to right."),
  action("grow", {}),
  action("move", { to: placement.optional(), by: point.optional() }),
  action("scale", { to: z.number().positive().max(20) }),
  action("rotate", { by: z.number().min(-3600).max(3600) }),
  action("color", { to: z.union([z.enum(COLORS), z.string().regex(/^#[0-9a-fA-F]{6}$/)]) }),
  action("morph", { into: id }).describe("Turns the target's outline (a shape, line or plot) into another element's (which stays hidden). Morph a plot into another plot to show a curve changing."),
  action("trace", { along: id }).describe("Moves the target (usually a dot) along a line, curve, arc, circle or plot."),
  action("indicate", {}),
  action("circumscribe", {}),
  action("flash", {}),
  action("count", { to: z.number().finite() }).describe("Animates a number element to a new value."),
  z.object({ do: z.literal("camera"), focus: z.union([point, id]).optional(), zoom: z.number().min(0.2).max(8).optional(), ...timing }).describe("Moves the view: focus on a point or element, and/or zoom."),
  z.object({ do: z.literal("wait"), duration: z.number().min(0).max(LIMITS.stepSeconds) }),
]);

export type SceneAction = z.infer<typeof actionSchema>;

export const stepSchema = z.object({
  caption: text.optional().describe("One or two sentences shown during this step."),
  actions: z.array(actionSchema).max(LIMITS.actionsPerStep),
  sequential: z.boolean().optional().describe("Run the actions one after another instead of together."),
  hold: z.number().min(0).max(LIMITS.stepSeconds).optional().describe("Seconds to pause after the actions. Defaults to 1."),
});

export type SceneStep = z.infer<typeof stepSchema>;

const MORPHABLE = new Set(["rect", "circle", "ellipse", "dot", "polygon", "line", "curve", "arc", "brace", "arrow", "plot"]);
const TRACEABLE = new Set(["line", "arrow", "curve", "arc", "circle", "ellipse", "plot", "polygon", "rect"]);

export const sceneSchema = z
  .object({
    schemaVersion: z.string().regex(/^2\.\d+$/, `Unsupported schemaVersion; this library reads 2.x (current ${SCHEMA_VERSION})`),
    type: z.literal("scene"),
    id,
    title: text.optional(),
    orientation: z.enum(["landscape", "portrait"]).optional(),
    background: z.enum(["dark", "light"]).optional().describe("Defaults to dark."),
    elements: z.array(elementSchema).min(1).max(LIMITS.elements),
    steps: z.array(stepSchema).min(1).max(LIMITS.steps),
  })
  .superRefine((scene, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const byId = new Map<string, SceneElement>();
    scene.elements.forEach((el, i) => {
      if (byId.has(el.id)) issue(`Duplicate id "${el.id}"`, ["elements", i, "id"]);
      byId.set(el.id, el);
    });
    const exists = (ref: string, path: (string | number)[], kinds?: string[]) => {
      const el = byId.get(ref);
      if (!el) issue(`No element has id "${ref}"`, path);
      else if (kinds && !kinds.includes(el.shape)) issue(`"${ref}" is a ${el.shape}; expected ${kinds.join(" or ")}`, path);
    };
    const checkPlacement = (p: unknown, path: (string | number)[]) => {
      if (!p || Array.isArray(p)) return;
      const ref = p as { of?: string; axes?: string; plot?: string; y?: number };
      if (ref.of) exists(ref.of, [...path, "of"]);
      if (ref.axes) exists(ref.axes, [...path, "axes"], ["axes"]);
      if (ref.plot) exists(ref.plot, [...path, "plot"], ["plot"]);
      if (ref.axes && ref.y === undefined && !ref.plot) issue("Give y, or a plot to put it on", path);
    };
    const parents = new Map<string, string>();
    scene.elements.forEach((el, i) => {
      const path = ["elements", i];
      checkPlacement(el.at, [...path, "at"]);
      if (el.shape === "plot") {
        exists(el.axes, [...path, "axes"], ["axes"]);
        try {
          for (const n of namesIn(compile(el.y))) if (n !== "x") issue(`Unknown name "${n}" in the formula; only x is defined`, [...path, "y"]);
        } catch (e) {
          if (e instanceof FormulaError) issue(e.message, [...path, "y"]);
          else throw e;
        }
      }
      if (el.shape === "line" || el.shape === "arrow") {
        for (const key of ["from", "to"] as const) if (typeof el[key] === "string") exists(el[key] as string, [...path, key]);
      }
      if (el.shape === "polygon" && !el.points && !(el.sides && el.r)) issue("Give points, or sides and r", path);
      if (el.shape === "group") {
        el.children.forEach((child, j) => {
          exists(child, [...path, "children", j]);
          if (child === el.id) issue("A group can't contain itself", [...path, "children", j]);
          if (parents.has(child)) issue(`"${child}" is already in group "${parents.get(child)}"`, [...path, "children", j]);
          parents.set(child, el.id);
        });
      }
    });
    // Placements that depend on each other in a loop can't be resolved.
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (elId: string, path: (string | number)[]): void => {
      if (done.has(elId)) return;
      if (visiting.has(elId)) return issue(`Placements form a loop through "${elId}"`, path);
      visiting.add(elId);
      const el = byId.get(elId);
      const at = el?.at as { of?: string } | undefined;
      if (at && !Array.isArray(at) && at.of) visit(at.of, path);
      visiting.delete(elId);
      done.add(elId);
    };
    scene.elements.forEach((el, i) => visit(el.id, ["elements", i, "at"]));

    scene.steps.forEach((step, s) =>
      step.actions.forEach((a, k) => {
        const path = ["steps", s, "actions", k];
        if (a.do === "wait") return;
        if (a.do === "camera") {
          if (typeof a.focus === "string") exists(a.focus, [...path, "focus"]);
          if (!a.focus && !a.zoom) issue("Give focus or zoom", path);
          return;
        }
        for (const t of Array.isArray(a.target) ? a.target : [a.target]) exists(t, [...path, "target"]);
        if (a.do === "morph") {
          exists(a.into, [...path, "into"], [...MORPHABLE]);
          for (const t of Array.isArray(a.target) ? a.target : [a.target]) {
            const el = byId.get(t);
            if (el && !MORPHABLE.has(el.shape)) issue(`Only outline shapes can morph; "${t}" is a ${el.shape}`, [...path, "target"]);
          }
        }
        if (a.do === "trace") exists(a.along, [...path, "along"], [...TRACEABLE]);
        if (a.do === "count") for (const t of Array.isArray(a.target) ? a.target : [a.target]) exists(t, [...path, "target"], ["number"]);
        if (a.do === "move") {
          if (!a.to && !a.by) issue("Give to or by", path);
          checkPlacement(a.to, [...path, "to"]);
        }
      }),
    );
  });

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
