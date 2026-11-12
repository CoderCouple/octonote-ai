import { z } from "zod/v4";
import { compile, FormulaError, isConstant, isFunction, namesIn, usesRandom } from "./expr.js";
import { parseTemplate, templateNames } from "./format.js";

export const WIDGET_LIMITS = {
  tables: 6,
  rows: 500,
  columns: 8,
  marks: 8,
  inputs: 8,
  values: 40,
  views: 16,
  chartPoints: 241,
  series: 6,
  segments: 8,
  gridCells: 200,
  questions: 60,
  trials: 20_000,
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
    grouping: z.boolean().optional().describe("false drops thousands separators, for years: 2024 not 2,024."),
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
    play: z.boolean().optional().describe("Show a play button that sweeps the value from min to max, e.g. to watch years pass."),
    hidden: z.boolean().optional().describe("No slider: the reader sets it only by dragging (a handle or a plane point). Use when the drag is the control, e.g. vector components."),
  })
  .describe("A number the learner drags.");
const toggle = z.object({ kind: z.literal("toggle"), id: name, label: short, value: z.boolean() }).describe("1 when on, 0 when off.");
const select = z
  .object({ kind: z.literal("select"), id: name, label: short, options: z.array(z.object({ label: short, value: z.number() })).min(2).max(12), value: z.number() })
  .describe("Pick one option; the input's value is the option's value.");

export const widgetInput = z.discriminatedUnion("kind", [slider, toggle, select]);

const tone = z.enum(["default", "positive", "negative", "accent", "auto"]).optional().describe('"auto" is green when the value is above 0 and red below.');

const drag = name.optional().describe("An input the reader can set by dragging this view directly (it keeps its slider too).");

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
  chart: z.enum(["line", "area", "bar", "scatter"]).optional().describe('Defaults to "line". "scatter" shows points only, for data.'),
  x: z
    .object({ from: z.number().optional(), to: z.number().optional(), step: z.number().positive().optional(), label: short.optional(), format: numberFormatSchema })
    .describe("The x range. Formula series are sampled from `from` to `to` (both needed then); data series bring their own x, and the range defaults to theirs."),
  xTo: formula.optional().describe("Optional formula for the end of the x range, e.g. years. Capped at x.to."),
  series: z
    .array(
      z.object({
        label: short,
        y: formula.describe("A formula in x, e.g. principal * (1 + rate/100)^x. For a data series, a formula per row using its column names (and inputs), e.g. people / 1e9."),
        data: name.optional().describe("Plot this table's rows instead of sampling a formula."),
        x: name.optional().describe("For a data series: the column for x. Defaults to the table's first column. A text column makes the chart categorical."),
        style: z.enum(["line", "points"]).optional().describe('"points" draws dots only, e.g. measured data over a formula line. Defaults to the chart type.'),
        color: color.optional(),
      }),
    )
    .min(1)
    .max(WIDGET_LIMITS.series),
  marks: z
    .array(z.object({ x: formula.optional(), y: formula.optional(), label: template.optional(), color: color.optional() }))
    .max(WIDGET_LIMITS.marks)
    .optional()
    .describe("Reference lines and points that can follow inputs: x only draws a vertical line, y only a horizontal one, both a labelled point (e.g. you are here)."),
  y: z.object({ min: z.number().optional(), max: z.number().optional(), format: numberFormatSchema, label: short.optional() }).optional(),
  caption: template.optional(),
  handles: z
    .array(
      z.object({
        input: name.describe("The input this handle sets."),
        x: formula.describe("Where the handle is, in chart coordinates; may use inputs and values."),
        y: formula,
        label: template.optional(),
        color: color.optional(),
      }),
    )
    .max(4)
    .optional()
    .describe("Points the reader drags to change an input, e.g. a point on the line at (1, m + b) that sets the slope m. The widget works out the input's value from where the point is dropped."),
});
export const barsView = view("bars", {
  items: z.array(z.object({ label: short, value: formula, color: color.optional() })).min(1).max(12).optional().describe("Bars from formulas; or give data, label and value for one bar per row."),
  data: name.optional(),
  label: name.optional().describe("With data: the column that names each bar."),
  value: formula.optional().describe("With data: a formula per row using its column names, e.g. gdp / population."),
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
  drag: drag.describe("An input set by dragging the circle's edge."),
});
export const gridView = view("grid", {
  total: formula.describe("How many cells. At most 200."),
  filled: formula,
  color: color.optional(),
  columns: z.number().int().min(1).max(50).optional(),
  drag: drag.describe("An input set by clicking or dragging across the cells."),
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
  drag: drag.describe("An input set by dragging along the bar."),
});
export const stackedView = view("stacked", {
  segments: z.array(z.object({ label: short, value: formula, color: color.optional() })).min(1).max(WIDGET_LIMITS.segments),
  format: numberFormatSchema,
});
export const formulaView = view("formula", { text: template.describe("A centred formula line, e.g. y = {m}x + {b}.") });
export const textView = view("text", { text: template, muted: z.boolean().optional() });
export const sentenceView = view("sentence", {
  text: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe("A sentence the reader changes by dragging its numbers: [id] is an input shown inline (drag or use arrow keys), {formula|format} a live value. E.g. If you invest [principal] at [rate] for [years] years you'll have {balance|currency}. Inputs used here don't also get a slider unless placed with an input view."),
});
export const questionsView = view("questions", {
  level: formula.describe("Which level to ask from, usually a difficulty slider."),
  questions: z.array(z.object({ level: z.number().int().min(0).max(20), prompt: short, answer: text })).min(1).max(WIDGET_LIMITS.questions),
});
export const tableView = view("table", {
  data: name,
  columns: z.array(name).min(1).max(WIDGET_LIMITS.columns).optional().describe("Which columns to show, in order. Defaults to all."),
  formats: z.record(z.string(), numberFormatSchema).optional().describe("Number formats by column name."),
  highlight: formula.optional().describe("A formula per row (column names and inputs); rows where it's true stand out, e.g. year == pickYear."),
  limit: z.number().int().min(1).max(WIDGET_LIMITS.rows).optional().describe("Show at most this many rows, then a 'show all' button."),
});
export const simulationView = view("simulation", {
  trials: formula.describe("How many trials per run, e.g. 1000, or an input. At most 20000."),
  outcome: formula.describe(
    "One trial's result, drawing random numbers: random() (0-1), coin() (0 or 1), chance(p) (1 with probability p), dice(sides), dicesum(n, sides), binomial(n, p) (successes in n tries), normal(mean, sd). Inputs work too. E.g. binomial(n, 1/6) counts sixes in n dice.",
  ),
  success: formula.optional().describe("When a trial counts as a success, using outcome, e.g. outcome >= 1. Then the share of successes is shown."),
  expected: formula.optional().describe("What theory says: the share of successes (with success) or the mean outcome (without). Drawn as a line the estimate settles onto, e.g. 1 - (5/6)^n."),
  label: short.optional().describe('What is being estimated, e.g. "At least one six".'),
  histogram: z.boolean().optional().describe("Also show how often each outcome came up."),
});
const pair = z.tuple([formula, formula]).describe("[x, y], each a formula.");
const planeShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), at: pair, label: template.optional(), color: color.optional() }),
  z.object({ kind: z.literal("segment"), from: pair, to: pair, label: template.optional(), color: color.optional(), dashed: z.boolean().optional() }),
  z.object({ kind: z.literal("vector"), from: pair.optional().describe("Defaults to the origin."), to: pair, label: template.optional(), color: color.optional() }),
  z.object({ kind: z.literal("polygon"), points: z.array(pair).min(3).max(12), label: template.optional(), color: color.optional() }),
  z.object({ kind: z.literal("circle"), center: pair, r: formula, color: color.optional(), dashed: z.boolean().optional() }),
  z.object({ kind: z.literal("function"), y: formula.describe("A formula in x."), label: template.optional(), color: color.optional() }),
  z.object({ kind: z.literal("text"), at: pair, text: template, color: color.optional() }),
]);
export const planeView = view("plane", {
  x: z.tuple([z.number(), z.number()]).describe("Visible x range, e.g. [-5, 5]."),
  y: z.tuple([z.number(), z.number()]).describe("Visible y range. Keep the same span per unit as x so circles stay round."),
  shapes: z.array(planeShape).min(1).max(24),
  handles: z
    .array(
      z.object({
        inputs: z.array(name).min(1).max(2).describe("One input, or two for a point dragged freely: the first follows x, the second y."),
        at: pair.describe("Where the handle is; usually built from its inputs."),
        label: template.optional(),
        color: color.optional(),
      }),
    )
    .max(4)
    .optional(),
});
export const inputView = view("input", { input: name.describe("Where to place that input's control. Inputs not placed this way go at the end.") });

export const widgetView = z.discriminatedUnion("type", [statsView, chartView, barsView, circleView, gridView, donutView, meterView, stackedView, formulaView, textView, sentenceView, tableView, simulationView, planeView, questionsView, inputView]);

export const dataTableSchema = z
  .object({
    name,
    columns: z
      .array(z.object({ name, label: short.optional(), text: z.boolean().optional().describe("Words (countries, months), not numbers.") }))
      .min(1)
      .max(WIDGET_LIMITS.columns)
      .describe("The first column is what lookups interpolate along, so make it numeric (e.g. year) unless the table is only for bars or a table view."),
    rows: z.array(z.array(z.union([z.number().finite(), z.string().max(80)])).min(1).max(WIDGET_LIMITS.columns)).min(1).max(WIDGET_LIMITS.rows),
  })
  .describe("Real numbers for the widget: one entry per row, in column order.");

const valueSchema = z.union([
  z.object({ name, formula }),
  z
    .object({
      name,
      lookup: z.object({
        data: name,
        column: name,
        at: formula.describe("Where to read the column, along the table's first column, e.g. year."),
        mode: z.enum(["interpolate", "step"]).optional().describe('Defaults to "interpolate" between rows.'),
      }),
    })
    .describe("A column read at a point, e.g. the population in the chosen year."),
  z
    .object({
      name,
      aggregate: z.object({
        data: name,
        column: name,
        op: z.enum(["sum", "mean", "min", "max", "count", "first", "last"]),
        where: formula.optional().describe("Only rows where this is true (column names and inputs), e.g. year <= upTo."),
      }),
    })
    .describe("A column summarised over rows."),
]);

export const widgetShape = {
  title: short,
  badge: z.string().trim().min(1).max(32).optional().describe("A short subject tag, e.g. Finance."),
  description: text.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().describe("Default currency for currency formats. Defaults to USD."),
  inputs: z.array(widgetInput).max(WIDGET_LIMITS.inputs),
  data: z.array(dataTableSchema).max(WIDGET_LIMITS.tables).optional().describe("Tables of real numbers that charts, bars, table views and values read."),
  values: z
    .array(valueSchema)
    .max(WIDGET_LIMITS.values)
    .optional()
    .describe("Named numbers, worked out in order: a formula, a lookup in a table, or an aggregate of a column. Each may use inputs and earlier values."),
  views: z.array(widgetView).min(1).max(WIDGET_LIMITS.views),
  note: template.optional().describe("A footnote, e.g. assumptions."),
  compare: z.boolean().optional().describe("Show a Pin button: the reader pins the current settings, changes them, and compares. Charts keep the pinned lines dashed; stats show the pinned number and the difference."),
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
      const randomAllowed = path.includes("outcome");
      const trees = kind === "formula" ? [compile(source)] : parseTemplate(source).flatMap((part) => (typeof part === "string" ? [] : [compile(part.formula)]));
      if (!randomAllowed && trees.some(usesRandom)) addIssue({ code: "custom", message: "Random numbers only work in a simulation's outcome; elsewhere a formula must give the same answer every time", path: [...base, ...path] });
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
  // Tables: unique names, rows that fit their columns, numbers where numbers belong.
  const tables = new Map<string, NonNullable<typeof spec.data>[number]>();
  spec.data?.forEach((table, i) => {
    const path = ["data", i];
    if (tables.has(table.name)) addIssue({ code: "custom", message: `A table named "${table.name}" already exists`, path: [...base, ...path, "name"] });
    tables.set(table.name, table);
    const names = new Set<string>();
    table.columns.forEach((c, j) => {
      if (names.has(c.name)) addIssue({ code: "custom", message: `Column "${c.name}" appears twice`, path: [...base, ...path, "columns", j, "name"] });
      names.add(c.name);
    });
    let reported = 0;
    table.rows.forEach((row, r) => {
      if (reported >= 3) return;
      if (row.length !== table.columns.length) {
        reported++;
        addIssue({ code: "custom", message: `Row has ${row.length} values but there are ${table.columns.length} columns`, path: [...base, ...path, "rows", r] });
        return;
      }
      row.forEach((cell, j) => {
        const text = !!table.columns[j]!.text;
        if (text !== (typeof cell === "string") && reported < 3) {
          reported++;
          addIssue({ code: "custom", message: text ? `Column "${table.columns[j]!.name}" is text; use a string` : `Column "${table.columns[j]!.name}" is numeric; use a number (or mark the column text)`, path: [...base, ...path, "rows", r, j] });
        }
      });
    });
  });
  /** The table, if it exists; reports it otherwise. */
  const tableAt = (name: string | undefined, path: (string | number)[]) => {
    if (name === undefined) return undefined;
    const table = tables.get(name);
    if (!table) addIssue({ code: "custom", message: `No table named "${name}"${tables.size ? ` (tables: ${[...tables.keys()].join(", ")})` : ""}`, path: [...base, ...path] });
    return table;
  };
  const numericColumns = (table: { columns: { name: string; text?: boolean }[] }) => table.columns.filter((c) => !c.text).map((c) => c.name);
  const columnAt = (table: { columns: { name: string; text?: boolean }[] } | undefined, column: string | undefined, path: (string | number)[], numeric = true) => {
    if (!table || column === undefined) return;
    const c = table.columns.find((x) => x.name === column);
    if (!c) addIssue({ code: "custom", message: `No column "${column}" (columns: ${table.columns.map((x) => x.name).join(", ")})`, path: [...base, ...path] });
    else if (numeric && c.text) addIssue({ code: "custom", message: `Column "${column}" is text; this needs numbers`, path: [...base, ...path] });
  };

  spec.values?.forEach((v, i) => {
    // A value may only use what comes before it, so there are no cycles.
    const path = ["values", i];
    if ("formula" in v) check(v.formula, [...path, "formula"]);
    else if ("lookup" in v) {
      const table = tableAt(v.lookup.data, [...path, "lookup", "data"]);
      columnAt(table, v.lookup.column, [...path, "lookup", "column"]);
      if (table?.columns[0]?.text) addIssue({ code: "custom", message: `Lookups read along the first column, and "${table.columns[0].name}" is text`, path: [...base, ...path, "lookup"] });
      check(v.lookup.at, [...path, "lookup", "at"]);
    } else {
      const table = tableAt(v.aggregate.data, [...path, "aggregate", "data"]);
      if (v.aggregate.op !== "count") columnAt(table, v.aggregate.column, [...path, "aggregate", "column"]);
      if (v.aggregate.where) check(v.aggregate.where, [...path, "aggregate", "where"], table ? numericColumns(table) : []);
    }
    add(v.name, [...path, "name"]);
  });

  const placed = new Set<string>();
  const inputIds = new Set(spec.inputs.map((input) => input.id));
  const draggable = (id: string | undefined, path: (string | number)[]) => {
    if (id === undefined) return;
    const input = spec.inputs.find((x) => x.id === id);
    if (!input) addIssue({ code: "custom", message: `No input has id "${id}"`, path: [...base, ...path] });
    else if (input.kind === "toggle") addIssue({ code: "custom", message: `"${id}" is a toggle; only sliders and selects can be dragged`, path: [...base, ...path] });
  };
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
        const sampled = v.series.some((s) => !s.data);
        if (sampled && (v.x.from === undefined || v.x.to === undefined)) addIssue({ code: "custom", message: "Formula series need x.from and x.to", path: [...base, ...path, "x"] });
        else if (v.x.from !== undefined && v.x.to !== undefined) {
          if (v.x.from >= v.x.to) addIssue({ code: "custom", message: "x.from must be below x.to", path: [...base, ...path, "x", "to"] });
          else if (sampled && (v.x.to - v.x.from) / step + 1 > WIDGET_LIMITS.chartPoints) addIssue({ code: "custom", message: `At most ${WIDGET_LIMITS.chartPoints} points; use a bigger step`, path: [...base, ...path, "x", "step"] });
        }
        f(v.xTo, ["xTo"]);
        let categorical: string | undefined;
        v.series.forEach((s, j) => {
          if (!s.data) {
            if (s.x) addIssue({ code: "custom", message: "x picks a column, so it needs data", path: [...base, ...path, "series", j, "x"] });
            return f(s.y, ["series", j, "y"], ["x"]);
          }
          const table = tableAt(s.data, [...path, "series", j, "data"]);
          if (!table) return;
          const xColumn = s.x ?? table.columns[0]!.name;
          columnAt(table, xColumn, [...path, "series", j, "x"], false);
          if (table.columns.find((c) => c.name === xColumn)?.text) categorical ??= table.name;
          f(s.y, ["series", j, "y"], numericColumns(table));
        });
        if (categorical && v.series.some((s) => s.data !== categorical))
          addIssue({ code: "custom", message: `With text along x, every series must come from table "${categorical}"`, path: [...base, ...path, "series"] });
        v.marks?.forEach((m, j) => {
          if (m.x === undefined && m.y === undefined) addIssue({ code: "custom", message: "Give x, y or both", path: [...base, ...path, "marks", j] });
          f(m.x, ["marks", j, "x"]);
          f(m.y, ["marks", j, "y"]);
          t(m.label, ["marks", j, "label"]);
        });
        t(v.caption, ["caption"]);
        v.handles?.forEach((h, j) => {
          draggable(h.input, [...path, "handles", j, "input"]);
          f(h.x, ["handles", j, "x"]);
          f(h.y, ["handles", j, "y"]);
          t(h.label, ["handles", j, "label"]);
          // A handle that doesn't move with its input can't be dragged.
          try {
            if (!namesIn(compile(h.x)).has(h.input) && !namesIn(compile(h.y)).has(h.input) && !dependsOn(spec, h.input, [h.x, h.y]))
              addIssue({ code: "custom", message: `The handle's x and y don't depend on "${h.input}", so dragging it can't change anything`, path: [...base, ...path, "handles", j] });
          } catch {
            // Reported above.
          }
        });
        break;
      }
      case "bars": {
        if (!v.items === !v.data) addIssue({ code: "custom", message: "Give items, or data with label and value", path: [...base, ...path] });
        v.items?.forEach((item, j) => f(item.value, ["items", j, "value"]));
        if (v.data) {
          const table = tableAt(v.data, [...path, "data"]);
          if (!v.label || !v.value) addIssue({ code: "custom", message: "Bars from data need label (a column) and value (a formula per row)", path: [...base, ...path] });
          columnAt(table, v.label, [...path, "label"], false);
          if (table && v.value) f(v.value, ["value"], numericColumns(table));
        }
        f(v.max, ["max"]);
        break;
      }
      case "plane": {
        if (v.x[0] >= v.x[1]) addIssue({ code: "custom", message: "x range must go from low to high", path: [...base, ...path, "x"] });
        if (v.y[0] >= v.y[1]) addIssue({ code: "custom", message: "y range must go from low to high", path: [...base, ...path, "y"] });
        const p2 = (pt: readonly [string, string] | undefined, key: (string | number)[]) => {
          if (!pt) return;
          f(pt[0], [...key, 0]);
          f(pt[1], [...key, 1]);
        };
        v.shapes.forEach((shape, j) => {
          const at = ["shapes", j];
          if (shape.kind === "point" || shape.kind === "text") p2(shape.at, [...at, "at"]);
          if (shape.kind === "segment" || shape.kind === "vector") {
            p2(shape.from, [...at, "from"]);
            p2(shape.to, [...at, "to"]);
          }
          if (shape.kind === "polygon") shape.points.forEach((pt, k) => p2(pt, [...at, "points", k]));
          if (shape.kind === "circle") {
            p2(shape.center, [...at, "center"]);
            f(shape.r, [...at, "r"]);
          }
          if (shape.kind === "function") f(shape.y, [...at, "y"], ["x"]);
          if ("label" in shape) t(shape.label, [...at, "label"]);
          if (shape.kind === "text") t(shape.text, [...at, "text"]);
        });
        v.handles?.forEach((h, j) => {
          h.inputs.forEach((id, k) => draggable(id, [...path, "handles", j, "inputs", k]));
          p2(h.at, ["handles", j, "at"]);
          t(h.label, ["handles", j, "label"]);
        });
        break;
      }
      case "simulation": {
        f(v.trials, ["trials"]);
        f(v.outcome, ["outcome"]);
        f(v.success, ["success"], ["outcome"]);
        f(v.expected, ["expected"]);
        try {
          if (!usesRandom(compile(v.outcome))) addIssue({ code: "custom", message: "The outcome never draws a random number, so every trial is the same. Use random(), coin(), chance(p), dice(), dicesum() or binomial().", path: [...base, ...path, "outcome"] });
        } catch {
          // Reported above.
        }
        break;
      }
      case "table": {
        const table = tableAt(v.data, [...path, "data"]);
        v.columns?.forEach((c, j) => columnAt(table, c, [...path, "columns", j], false));
        if (table && v.highlight) f(v.highlight, ["highlight"], numericColumns(table));
        break;
      }
      case "circle":
        f(v.radius, ["radius"]);
        f(v.value, ["value"]);
        t(v.note, ["note"]);
        draggable(v.drag, [...path, "drag"]);
        break;
      case "grid":
        f(v.total, ["total"]);
        f(v.filled, ["filled"]);
        draggable(v.drag, [...path, "drag"]);
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
        draggable(v.drag, [...path, "drag"]);
        break;
      case "stacked":
        v.segments.forEach((s, j) => f(s.value, ["segments", j, "value"]));
        break;
      case "formula":
      case "text":
        t(v.text, ["text"]);
        break;
      case "sentence":
        for (const part of splitSentence(v.text)) {
          if (typeof part === "string") t(part, ["text"]);
          else if (!inputIds.has(part.input)) addIssue({ code: "custom", message: `No input has id "${part.input}" (inputs go in [brackets], live values in {braces})`, path: [...base, ...path, "text"] });
        }
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

/** Whether any of the formulas uses the input through a named value. */
function dependsOn(spec: { values?: z.infer<typeof valueSchema>[] }, input: string, formulas: string[]): boolean {
  const uses = new Set([input]);
  for (const v of spec.values ?? []) {
    const source = "formula" in v ? v.formula : "lookup" in v ? v.lookup.at : (v.aggregate.where ?? "0");
    try {
      if ([...namesIn(compile(source))].some((n) => uses.has(n))) uses.add(v.name);
    } catch {
      // Reported elsewhere.
    }
  }
  return formulas.some((source) => [...namesIn(compile(source))].some((n) => uses.has(n)));
}

/** Splits a sentence into template text and [input] slots. */
export function splitSentence(text: string): (string | { input: string })[] {
  const parts: (string | { input: string })[] = [];
  const pattern = /\[([A-Za-z_][A-Za-z0-9_]*)\]/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ input: match[1]! });
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Inputs that a view shows itself (or that are hidden), so they don't also get a slider at the end. */
export function placedInputs(views: readonly WidgetView[], inputs: readonly WidgetInput[] = []): Set<string> {
  const placed = new Set<string>(inputs.filter((i) => i.kind === "slider" && i.hidden).map((i) => i.id));
  for (const v of views) {
    if (v.type === "input") placed.add(v.input);
    if (v.type === "sentence") for (const part of splitSentence(v.text)) if (typeof part !== "string") placed.add(part.input);
  }
  return placed;
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
