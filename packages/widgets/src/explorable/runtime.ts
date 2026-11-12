import { useMemo, useState } from "react";
import { compile, evaluate, type Scope } from "./expr.js";
import type { WidgetBlock, WidgetInput, WidgetSpec } from "./schema.js";

export type InputValues = Record<string, number>;

export function initialInputs(inputs: readonly WidgetInput[]): InputValues {
  return Object.fromEntries(inputs.map((input) => [input.id, input.kind === "toggle" ? Number(input.value) : input.value]));
}

/** Inputs plus every named value, worked out in order. */
export function computeScope(spec: Pick<WidgetSpec, "values">, inputs: InputValues): Scope {
  const scope: Record<string, number> = { ...inputs };
  for (const v of spec.values ?? []) scope[v.name] = evaluate(compile(v.formula), scope);
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

/** Samples every series across the x range. */
export function sampleChart(view: Extract<WidgetBlock["views"][number], { type: "chart" }>, scope: Scope): ChartPoint[] {
  const step = view.x.step ?? 1;
  const end = view.xTo ? Math.min(view.x.to, Math.max(view.x.from, valueOf(view.xTo, scope))) : view.x.to;
  const trees = view.series.map((s) => compile(s.y));
  const points: ChartPoint[] = [];
  // Count steps instead of adding floats, so 0.1 steps don't drift.
  const count = Math.floor((end - view.x.from) / step + 1e-9);
  for (let i = 0; i <= count; i++) {
    const x = Number((view.x.from + i * step).toPrecision(12));
    points.push({ x, ys: trees.map((tree) => evaluate(tree, { ...scope, x })) });
  }
  return points;
}

/** Headless widget state: the inputs' values, setters and everything computed from them. */
export function useWidget(spec: Pick<WidgetSpec, "inputs" | "values">) {
  const [inputs, setInputs] = useState(() => initialInputs(spec.inputs));
  const scope = useMemo(() => computeScope(spec, inputs), [spec, inputs]);
  return {
    inputs,
    scope,
    setInput: (id: string, value: number) => setInputs((current) => (current[id] === value ? current : { ...current, [id]: value })),
    reset: () => setInputs(initialInputs(spec.inputs)),
  };
}
