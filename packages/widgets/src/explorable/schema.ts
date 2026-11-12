import { z } from "zod/v4";
import { compile, FormulaError, isConstant, isFunction, namesIn } from "./expr.js";
import { templateNames } from "./format.js";

export const WIDGET_LIMITS = {
  inputs: 8,
  values: 40,
  views: 16,
  chartPoints: 241,
  series: 6,
  segments: 8,
  gridCells: 200,
  questions: 60,
  sliderSteps: 10_000,
} as const;

export const PALETTE = ["blue", "green", "orange", "purple", "red", "teal", "pink", "gray"] as const;
export const ICONS = ["car", "bike", "walk", "plane", "rocket", "coin", "drop", "bolt", "heart", "leaf", "clock", "home", "book", "star"] as const;

const short = z.string().trim().min(1).max(120);
const text = z.string().trim().min(1).max(600);
const name = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/, "Names are letters, digits and _, starting with a letter")
  .refine((n) => !isConstant(n) && !isFunction(n) && n !== "x" && !(n in Object.prototype), "That name is reserved");
const formula = z.string().trim().min(1).max(500).describe("A formula over input and value names, e.g. 1000 * (1 + rate/100)^years.");
const template = z.string().trim().min(1).max(600).describe("Text with live values in braces: {balance|currency}, {m}, {share|percent}.");
const color = z.enum(PALETTE);

export const numberFormatSchema = z
  .object({
    style: z.enum(["number", "currency", "percent", "compact"]).optional().describe('"percent" expects a ratio (0.35 → 35%). For values already in percent use suffix "%".'),
    decimals: z.number().int().min(0).max(6).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    prefix: z.string().max(8).optional(),
    suffix: z.string().max(12).optional(),
    signed: z.boolean().optional(),
  })
  .optional();

const slider = z
  .object({
    kind: z.literal("slider"),
    id: name,
    label: short,
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional().describe("Defaults to 1."),
    value: z.number().describe("Starting value."),
    format: numberFormatSchema,
    labels: z.array(short).max(20).optional().describe("A word for each step from min, e.g. Easy, Medium, Hard. Shown instead of the number."),
  })
  .describe("A number the learner drags.");
const toggle = z.object({ kind: z.literal("toggle"), id: name, label: short, value: z.boolean() }).describe("1 when on, 0 when off.");
const select = z
  .object({ kind: z.literal("select"), id: name, label: short, options: z.array(z.object({ label: short, value: z.number() })).min(2).max(12), value: z.number() })
  .describe("Pick one option; the input's value is the option's value.");

export const widgetInput = z.discriminatedUnion("kind", [slider, toggle, select]);

const tone = z.enum(["default", "positive", "negative", "accent", "auto"]).optional().describe('"auto" is green when the value is above 0 and red below.');

const view = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) => z.object({ type: z.literal(type), ...shape });

export const statsView = view("stats", {
  items: z
    .array(
      z.object({
        label: short,
        value: formula,
        format: numberFormatSchema,
        display: template.optional().describe("Shown instead of the formatted value, e.g. {n}/12 for a fraction."),
        tone,
        note: template.optional().describe("Small line under the number, e.g. +{gain|currency} earned."),
      }),
    )
    .min(1)
    .max(4),
});
export const chartView = view("chart", {
  chart: z.enum(["line", "area", "bar"]).optional().describe('Defaults to "line".'),
  x: z.object({ from: z.number(), to: z.number(), step: z.number().positive().optional(), label: short.optional(), format: numberFormatSchema }).describe("The x range. Series formulas use x and may use inputs: to show a range set by an input, set to a large value and use a formula with x <= years."),
  xTo: formula.optional().describe("Optional formula for the end of the x range, e.g. years. Capped at x.to."),
  series: z.array(z.object({ label: short, y: formula.describe("A formula in x, e.g. principal * (1 + rate/100)^x."), color: color.optional() })).min(1).max(WIDGET_LIMITS.series),
  y: z.object({ min: z.number().optional(), max: z.number().optional(), format: numberFormatSchema, label: short.optional() }).optional(),
  caption: template.optional(),
});
export const barsView = view("bars", {
  items: z.array(z.object({ label: short, value: formula, color: color.optional() })).min(1).max(12),
  format: numberFormatSchema,
  max: formula.optional().describe("The value of a full bar. Defaults to the largest item."),
});
export const circleView = view("circle", {
  radius: formula,
  max: z.number().positive().describe("The largest radius the inputs allow; the drawing scales to it."),
  label: short.optional(),
  value: formula.optional().describe("A number shown beside the circle, e.g. pi * r^2."),
  format: numberFormatSchema,
  note: template.optional(),
});
export const gridView = view("grid", {
  total: formula.describe("How many cells. At most 200."),
  filled: formula,
  color: color.optional(),
  columns: z.number().int().min(1).max(50).optional(),
});
export const donutView = view("donut", {
  value: formula.describe("A ratio from 0 to 1."),
  center: template.optional().describe("Text in the middle. Defaults to the percentage."),
  label: short.optional(),
  detail: template.optional(),
  note: template.optional(),
  color: color.optional(),
});
export const meterView = view("meter", {
  value: formula,
  max: formula,
  icon: z.enum(ICONS).optional(),
  label: template.optional().describe("Shown at the right, e.g. {distance} km."),
  note: template.optional(),
  color: color.optional(),
});
export const stackedView = view("stacked", {
  segments: z.array(z.object({ label: short, value: formula, color: color.optional() })).min(1).max(WIDGET_LIMITS.segments),
  format: numberFormatSchema,
});
export const formulaView = view("formula", { text: template.describe("A centred formula line, e.g. y = {m}x + {b}.") });
export const textView = view("text", { text: template, muted: z.boolean().optional() });
export const questionsView = view("questions", {
  level: formula.describe("Which level to ask from, usually a difficulty slider."),
  questions: z.array(z.object({ level: z.number().int().min(0).max(20), prompt: short, answer: text })).min(1).max(WIDGET_LIMITS.questions),
});
export const inputView = view("input", { input: name.describe("Where to place that input's control. Inputs not placed this way go at the end.") });

export const widgetView = z.discriminatedUnion("type", [statsView, chartView, barsView, circleView, gridView, donutView, meterView, stackedView, formulaView, textView, questionsView, inputView]);

export const widgetShape = {
  title: short,
  badge: z.string().trim().min(1).max(32).optional().describe("A short subject tag, e.g. Finance."),
  description: text.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().describe("Default currency for currency formats. Defaults to USD."),
  inputs: z.array(widgetInput).max(WIDGET_LIMITS.inputs),
  values: z
    .array(z.object({ name, formula }))
    .max(WIDGET_LIMITS.values)
    .optional()
    .describe("Named formulas, worked out in order. Each may use inputs and earlier values."),
  views: z.array(widgetView).min(1).max(WIDGET_LIMITS.views),
  note: template.optional().describe("A footnote, e.g. assumptions."),
};

type Issue = { code: "custom"; message: string; path: (string | number)[] };

/** Checks names, formulas and ranges; the parts zod's shape alone can't. */
export function checkWidget(spec: z.infer<z.ZodObject<typeof widgetShape>>, addIssue: (issue: Issue) => void, base: (string | number)[] = []) {
  const known = new Set<string>();
  const add = (n: string, path: (string | number)[]) => {
    if (known.has(n)) addIssue({ code: "custom", message: `"${n}" is defined twice`, path: [...base, ...path] });
    known.add(n);
  };
  const check = (source: string, path: (string | number)[], extra: string[] = [], kind: "formula" | "template" = "formula") => {
    try {
      const names = kind === "formula" ? namesIn(compile(source)) : templateNames(source);
      for (const n of names) if (!known.has(n) && !extra.includes(n)) addIssue({ code: "custom", message: `Unknown name "${n}"`, path: [...base, ...path] });
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error;
      addIssue({ code: "custom", message: error.message, path: [...base, ...path] });
    }
  };

  spec.inputs.forEach((input, i) => {
    add(input.id, ["inputs", i, "id"]);
    if (input.kind === "slider") {
      const step = input.step ?? 1;
      if (input.min >= input.max) addIssue({ code: "custom", message: "min must be below max", path: [...base, "inputs", i, "max"] });
      else if ((input.max - input.min) / step > WIDGET_LIMITS.sliderSteps) addIssue({ code: "custom", message: "Too many steps; use a bigger step", path: [...base, "inputs", i, "step"] });
      if (input.value < input.min || input.value > input.max) addIssue({ code: "custom", message: "value must be between min and max", path: [...base, "inputs", i, "value"] });
    }
    if (input.kind === "select" && !input.options.some((o) => o.value === input.value)) {
      addIssue({ code: "custom", message: "value must be one of the options' values", path: [...base, "inputs", i, "value"] });
    }
  });
  spec.values?.forEach((v, i) => {
    // A value may only use what comes before it, so there are no cycles.
    check(v.formula, ["values", i, "formula"]);
    add(v.name, ["values", i, "name"]);
  });

  const placed = new Set<string>();
  spec.views.forEach((v, i) => {
    const path = ["views", i];
    const f = (source: string | undefined, key: (string | number)[], extra?: string[]) => source && check(source, [...path, ...key], extra);
    const t = (source: string | undefined, key: (string | number)[]) => source && check(source, [...path, ...key], [], "template");
    switch (v.type) {
      case "stats":
        v.items.forEach((item, j) => {
          f(item.value, ["items", j, "value"]);
          t(item.display, ["items", j, "display"]);
          t(item.note, ["items", j, "note"]);
        });
        break;
      case "chart": {
        const step = v.x.step ?? 1;
        if (v.x.from >= v.x.to) addIssue({ code: "custom", message: "x.from must be below x.to", path: [...base, ...path, "x", "to"] });
        else if ((v.x.to - v.x.from) / step + 1 > WIDGET_LIMITS.chartPoints) addIssue({ code: "custom", message: `At most ${WIDGET_LIMITS.chartPoints} points; use a bigger step`, path: [...base, ...path, "x", "step"] });
        f(v.xTo, ["xTo"]);
        v.series.forEach((s, j) => f(s.y, ["series", j, "y"], ["x"]));
        t(v.caption, ["caption"]);
        break;
      }
      case "bars":
        v.items.forEach((item, j) => f(item.value, ["items", j, "value"]));
        f(v.max, ["max"]);
        break;
      case "circle":
        f(v.radius, ["radius"]);
        f(v.value, ["value"]);
        t(v.note, ["note"]);
        break;
      case "grid":
        f(v.total, ["total"]);
        f(v.filled, ["filled"]);
        break;
      case "donut":
        f(v.value, ["value"]);
        t(v.center, ["center"]);
        t(v.detail, ["detail"]);
        t(v.note, ["note"]);
        break;
      case "meter":
        f(v.value, ["value"]);
        f(v.max, ["max"]);
        t(v.label, ["label"]);
        t(v.note, ["note"]);
        break;
      case "stacked":
        v.segments.forEach((s, j) => f(s.value, ["segments", j, "value"]));
        break;
      case "formula":
      case "text":
        t(v.text, ["text"]);
        break;
      case "questions":
        f(v.level, ["level"]);
        break;
      case "input":
        if (!spec.inputs.some((input) => input.id === v.input)) addIssue({ code: "custom", message: `No input has id "${v.input}"`, path: [...base, ...path, "input"] });
        else if (placed.has(v.input)) addIssue({ code: "custom", message: `"${v.input}" is placed twice`, path: [...base, ...path, "input"] });
        placed.add(v.input);
        break;
    }
  });
  if (spec.note) check(spec.note, ["note"], [], "template");
}

/** A widget as a block inside a content document. */
export const widgetBlockSchema = z.object({ type: z.literal("widget"), id: z.string().max(64).optional(), ...widgetShape }).superRefine((spec, ctx) => checkWidget(spec, (i) => ctx.addIssue(i)));

/** A widget on its own. */
export const widgetSpecSchema = z
  .object({ schemaVersion: z.string().regex(/^1\.\d+$/, "Unsupported schemaVersion; this library reads 1.x"), type: z.literal("widget"), id: z.string().min(1).max(64), ...widgetShape })
  .superRefine((spec, ctx) => checkWidget(spec, (i) => ctx.addIssue(i)));

export type WidgetInput = z.infer<typeof widgetInput>;
export type WidgetView = z.infer<typeof widgetView>;
export type NumberFormatSpec = z.infer<typeof numberFormatSchema>;
export type WidgetBlock = z.infer<typeof widgetBlockSchema>;
export type WidgetSpec = z.infer<typeof widgetSpecSchema>;
export type PaletteColor = (typeof PALETTE)[number];
export type IconName = (typeof ICONS)[number];
