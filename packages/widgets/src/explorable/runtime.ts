import { useCallback, useMemo, useState } from "react";
import { aggregate, lookup, rowScope, type DataTable } from "./data.js";
import { compile, evaluate, type Scope } from "./expr.js";
import type { WidgetBlock, WidgetInput, WidgetSpec } from "./schema.js";

export type InputValues = Record<string, number>;

export function initialInputs(inputs: readonly WidgetInput[]): InputValues {
  return Object.fromEntries(inputs.map((input) => [input.id, input.kind === "toggle" ? Number(input.value) : input.value]));
}

/** Inputs plus every named value (formula, lookup or aggregate), worked out in order. */
export function computeScope(spec: Pick<WidgetSpec, "values" | "data">, inputs: InputValues): Scope {
  const scope: Record<string, number> = { ...inputs };
  const tables = new Map((spec.data ?? []).map((t) => [t.name, t as DataTable]));
  for (const v of spec.values ?? []) {
    if ("formula" in v) scope[v.name] = evaluate(compile(v.formula), scope);
    else if ("lookup" in v) {
      const table = tables.get(v.lookup.data);
      scope[v.name] = table ? lookup(table, v.lookup.column, evaluate(compile(v.lookup.at), scope), v.lookup.mode) : NaN;
    } else {
      const table = tables.get(v.aggregate.data);
      scope[v.name] = table ? aggregate(table, v.aggregate.column, v.aggregate.op, scope, v.aggregate.where) : NaN;
    }
  }
  return scope;
}

/** Evaluates a formula in the scope, or NaN when it's missing or broken. */
export function valueOf(formula: string | undefined, scope: Scope): number {
  if (!formula) return NaN;
  try {
    return evaluate(compile(formula), scope);
  } catch {
    return NaN;
  }
}

export interface ChartPoint {
  x: number;
  ys: number[];
}

type ChartView = Extract<WidgetBlock["views"][number], { type: "chart" }>;

/** The x grid formula series are sampled on, up to xTo. */
function sampleXs(view: ChartView, scope: Scope): number[] {
  const from = view.x.from ?? 0;
  const to = view.x.to ?? from;
  const step = view.x.step ?? 1;
  const end = view.xTo ? Math.min(to, Math.max(from, valueOf(view.xTo, scope))) : to;
  // Count steps instead of adding floats, so 0.1 steps don't drift.
  const count = Math.floor((end - from) / step + 1e-9);
  return Array.from({ length: Math.max(0, count + 1) }, (_, i) => Number((from + i * step).toPrecision(12)));
}

/** Samples formula series across the x range (all series must be formulas). */
export function sampleChart(view: ChartView, scope: Scope): ChartPoint[] {
  const trees = view.series.map((s) => compile(s.y));
  return sampleXs(view, scope).map((x) => ({ x, ys: trees.map((tree) => evaluate(tree, { ...scope, x })) }));
}

export interface ChartData {
  /** Every x anything is plotted at, sorted: what hover and the keyboard step through. */
  xs: number[];
  /** One point list per series; a missing x reads as NaN. */
  series: { x: number; y: number }[][];
  /** With text along x: each category's name, by index. */
  categories?: string[];
}

/** Points for every series: formulas sampled on the x grid, data series row by row. */
export function chartData(view: ChartView, scope: Scope, tables: readonly DataTable[] = []): ChartData {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const grid = view.series.some((s) => !s.data) ? sampleXs(view, scope) : [];
  const xTo = view.xTo ? valueOf(view.xTo, scope) : Infinity;
  let categories: string[] | undefined;
  const series = view.series.map((s) => {
    if (!s.data) {
      const tree = compile(s.y);
      return grid.map((x) => ({ x, y: evaluate(tree, { ...scope, x }) }));
    }
    const table = byName.get(s.data);
    if (!table) return [];
    const xi = Math.max(0, s.x ? table.columns.findIndex((c) => c.name === s.x) : 0);
    const text = !!table.columns[xi]?.text;
    if (text) categories ??= table.rows.map((r) => String(r[xi]));
    const tree = compile(s.y);
    return table.rows
      .map((row, i) => ({ x: text ? i : Number(row[xi]), y: evaluate(tree, rowScope(table, row, scope)) }))
      .filter((p) => Number.isFinite(p.x) && (text || p.x <= xTo) && (view.x.from === undefined || text || p.x >= view.x.from) && (view.x.to === undefined || text || p.x <= view.x.to))
      .sort((a, b) => a.x - b.x);
  });
  const xs = [...new Set(series.flatMap((points) => points.map((p) => p.x)))].sort((a, b) => a - b);
  return { xs, series, categories };
}

/** Headless widget state: the inputs' values, setters and everything computed from them. */
export function useWidget(spec: Pick<WidgetSpec, "inputs" | "values" | "data">) {
  const [inputs, setInputs] = useState(() => initialInputs(spec.inputs));
  const scope = useMemo(() => computeScope(spec, inputs), [spec, inputs]);
  const setInput = useCallback((id: string, value: number) => setInputs((current) => (current[id] === value ? current : { ...current, [id]: value })), []);
  const reset = useCallback(() => setInputs(initialInputs(spec.inputs)), [spec.inputs]);
  const changed = useMemo(() => {
    const start = initialInputs(spec.inputs);
    return Object.keys(start).some((id) => start[id] !== inputs[id]);
  }, [spec.inputs, inputs]);
  return { inputs, scope, setInput, reset, changed };
}
