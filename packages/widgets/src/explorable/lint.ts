import type { DataTable } from "./data.js";
import { compile, namesIn, type Scope } from "./expr.js";
import { formatNumber, parseTemplate, renderTemplate } from "./format.js";
import { inputValues } from "./interact.js";
import { chartData, computeScope, initialInputs, valueOf, type InputValues } from "./runtime.js";
import { splitSentence, type WidgetSpec } from "./schema.js";

/**
 * Problems a reader would hit, found by moving every input through its range:
 * numbers that break, overflow, read wrongly or don't fit, and inputs that do
 * nothing. Messages say what to change, so a model can fix them.
 */
export interface WidgetIssue {
  path: string;
  message: string;
}

type Spec = Pick<WidgetSpec, "inputs" | "values" | "views" | "data" | "currency" | "note">;

/** At most this many settings per input, evenly spread and including both ends. */
const PER_INPUT = 15;

export function lintWidget(spec: Spec): WidgetIssue[] {
  const issues: WidgetIssue[] = [];
  const seen = new Set<string>();
  const report = (path: string, message: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    issues.push({ path, message });
  };
  const defaults = initialInputs(spec.inputs);
  const settings = sweep(spec, defaults);
  const describe = (inputs: InputValues) => {
    const changed = spec.inputs.filter((i) => inputs[i.id] !== defaults[i.id]);
    return changed.length ? changed.map((i) => `${i.id} = ${inputs[i.id]}`).join(", ") : "the starting values";
  };
  const scopes = settings.map((inputs) => ({ inputs, scope: safeScope(spec, inputs) }));
  const tables = (spec.data ?? []) as DataTable[];

  // Values that stop being numbers somewhere in the range.
  spec.values?.forEach((v, i) => {
    const bad = scopes.find(({ scope }) => !Number.isFinite(scope[v.name]!));
    if (bad) report(`values.${i}`, `"${v.name}" isn't a number when ${describe(bad.inputs)} (${explain(bad.scope[v.name]!)}). Guard the formula, e.g. with max() or a condition, or narrow the input's range.`);
  });

  // Inputs that nothing reads can't change anything.
  const read = new Set<string>();
  const readAll = (source: string | undefined, kind: "formula" | "template" = "formula") => {
    if (!source) return;
    try {
      if (kind === "formula") namesIn(compile(source), read);
      else for (const part of parseTemplate(source)) if (typeof part !== "string") namesIn(compile(part.formula), read);
    } catch {
      // Reported by validation.
    }
  };
  for (const view of spec.views) {
    if (view.type === "input") continue;
    for (const [key, value] of Object.entries(view)) {
      if (typeof value === "string" && key !== "type") (["text", "caption", "note", "label", "center", "detail"].includes(key) ? readAll(value, "template") : readAll(value));
    }
    if (view.type === "sentence") for (const part of splitSentence(view.text)) typeof part === "string" ? readAll(part, "template") : read.add(part.input);
    if (view.type === "stats") view.items.forEach((item) => (readAll(item.value), readAll(item.display, "template"), readAll(item.note, "template")));
    if (view.type === "chart") {
      readAll(view.xTo);
      view.series.forEach((s) => readAll(s.y));
      view.marks?.forEach((m) => (readAll(m.x), readAll(m.y), readAll(m.label, "template")));
      view.handles?.forEach((h) => (readAll(h.x), readAll(h.y), read.add(h.input)));
    }
    if (view.type === "bars") view.items?.forEach((item) => readAll(item.value));
    if (view.type === "stacked") view.segments.forEach((s) => readAll(s.value));
  }
  if (spec.note) readAll(spec.note, "template");
  spec.inputs.forEach((input, i) => {
    // Used when a view reads it, or reads a value built from it. Placing its slider alone doesn't count.
    const used = read.has(input.id) || (spec.values ?? []).some((v) => read.has(v.name) && dependsOnInput(spec, v.name, input.id));
    if (!used) report(`inputs.${i}`, `"${input.id}" doesn't change anything the reader sees: no view uses it, or a value built from it. Use it or remove it.`);
    if (input.kind === "slider" && input.labels && input.labels.length !== inputValues(input).length)
      report(`inputs.${i}.labels`, `"${input.id}" has ${inputValues(input).length} steps but ${input.labels.length} labels; give one label per step.`);
  });

  const currency = spec.currency;
  spec.views.forEach((view, v) => {
    const at = `views.${v}`;
    switch (view.type) {
      case "stats":
        view.items.forEach((item, j) => {
          for (const { inputs, scope } of scopes) {
            const value = valueOf(item.value, scope);
            if (!Number.isFinite(value)) {
              report(`${at}.items.${j}`, `"${item.label}" shows a dash when ${describe(inputs)} (${explain(value)}).`);
              break;
            }
            if (item.format?.style === "percent" && Math.abs(value) > 1.5) {
              report(`${at}.items.${j}.format`, `"${item.label}" uses style "percent", which expects a ratio (0.35 → 35%), but the value is ${round(value)} when ${describe(inputs)}, so it would read ${formatNumber(value, item.format)}. Divide by 100 or use suffix "%".`);
              break;
            }
            const shown = item.display ? renderTemplate(item.display, scope, currency) : formatNumber(value, { ...item.format, ...(currency ? { currency } : {}) });
            if (shown.length > 16) {
              report(`${at}.items.${j}`, `"${item.label}" reads "${shown}" when ${describe(inputs)}: too long for a stat. Use style "compact", fewer decimals, or a smaller range.`);
              break;
            }
          }
        });
        break;
      case "donut":
        for (const { inputs, scope } of scopes) {
          const value = valueOf(view.value, scope);
          if (Number.isFinite(value) && (value < -1e-9 || value > 1 + 1e-9)) {
            report(`${at}.value`, `A donut's value is a ratio from 0 to 1, but it's ${round(value)} when ${describe(inputs)}.${value > 1 && value <= 100 ? " Divide by 100?" : ""}`);
            break;
          }
        }
        break;
      case "meter":
        for (const { inputs, scope } of scopes) {
          const value = valueOf(view.value, scope);
          const max = valueOf(view.max, scope);
          if (Number.isFinite(value) && Number.isFinite(max) && value > max * 1.001) {
            report(`${at}`, `The meter overflows: value ${round(value)} is above max ${round(max)} when ${describe(inputs)}. Raise max (it can be a formula).`);
            break;
          }
        }
        break;
      case "circle":
        for (const { inputs, scope } of scopes) {
          const r = valueOf(view.radius, scope);
          if (Number.isFinite(r) && r > view.max * 1.001) {
            report(`${at}.max`, `The circle's radius reaches ${round(r)} (when ${describe(inputs)}) but max is ${view.max}, so it's drawn too big. Set max to at least ${round(r)}.`);
            break;
          }
        }
        break;
      case "grid":
        for (const { inputs, scope } of scopes) {
          const total = valueOf(view.total, scope);
          const filled = valueOf(view.filled, scope);
          if (total > 200) {
            report(`${at}.total`, `A grid shows at most 200 cells, but total is ${round(total)} when ${describe(inputs)}. Scale it down (e.g. one cell per 10).`);
            break;
          }
          if (filled > total + 1e-9) {
            report(`${at}.filled`, `filled (${round(filled)}) is more than total (${round(total)}) when ${describe(inputs)}.`);
            break;
          }
        }
        break;
      case "chart": {
        const base = scopes[0]!;
        const data = chartData(view, base.scope, tables);
        data.series.forEach((points, j) => {
          const finite = points.filter((p) => Number.isFinite(p.y));
          if (points.length && finite.length < points.length / 2)
            report(`${at}.series.${j}.y`, `"${view.series[j]!.label}" isn't a number at ${points.length - finite.length} of ${points.length} points. Check the formula for division by zero, roots or logs of negatives.`);
          else if (!points.length) report(`${at}.series.${j}`, `"${view.series[j]!.label}" has no points to draw.`);
        });
        if (view.y?.min !== undefined || view.y?.max !== undefined) {
          // A fixed range that the lines mostly leave hides them.
          for (const { inputs, scope } of [base, ...scopes.slice(1)]) {
            const all = chartData(view, scope, tables).series.flat().filter((p) => Number.isFinite(p.y));
            const outside = all.filter((p) => (view.y?.min !== undefined && p.y < view.y.min) || (view.y?.max !== undefined && p.y > view.y.max));
            if (all.length && outside.length / all.length > 0.6) {
              report(`${at}.y`, `Most of the chart is outside its fixed y range (${view.y?.min ?? "auto"} to ${view.y?.max ?? "auto"}) when ${describe(inputs)}. Widen it, or leave min/max out to fit the data.`);
              break;
            }
          }
        }
        view.handles?.forEach((h, j) => {
          const x = valueOf(h.x, base.scope);
          const y = valueOf(h.y, base.scope);
          const lo = view.x.from ?? Math.min(...data.xs);
          const hi = view.x.to ?? Math.max(...data.xs);
          if (!Number.isFinite(x) || !Number.isFinite(y)) report(`${at}.handles.${j}`, `The handle for "${h.input}" has no position at the start (x ${explain(x)}, y ${explain(y)}).`);
          else if (x < lo || x > hi) report(`${at}.handles.${j}.x`, `The handle for "${h.input}" starts at x = ${round(x)}, outside the chart's x range (${round(lo)} to ${round(hi)}).`);
        });
        break;
      }
    }
  });
  return issues;
}

function safeScope(spec: Spec, inputs: InputValues): Scope {
  try {
    return computeScope(spec, inputs);
  } catch {
    return {};
  }
}

/** Starting values, each input across its range with the others at their start, then all at their minimum and all at their maximum. */
function sweep(spec: Spec, defaults: InputValues): InputValues[] {
  const out: InputValues[] = [defaults];
  for (const input of spec.inputs) {
    const all = inputValues(input);
    const stride = Math.max(1, Math.floor((all.length - 1) / (PER_INPUT - 1)));
    for (let i = 0; i < all.length; i += stride) out.push({ ...defaults, [input.id]: all[i]! });
    out.push({ ...defaults, [input.id]: all[all.length - 1]! });
  }
  if (spec.inputs.length > 1) {
    out.push(Object.fromEntries(spec.inputs.map((i) => [i.id, inputValues(i)[0]!])));
    out.push(Object.fromEntries(spec.inputs.map((i) => [i.id, inputValues(i).at(-1)!])));
  }
  return out;
}

function dependsOnInput(spec: Spec, value: string, input: string): boolean {
  const uses = new Set([input]);
  for (const v of spec.values ?? []) {
    const source = "formula" in v ? v.formula : "lookup" in v ? v.lookup.at : (v.aggregate.where ?? "0");
    try {
      if ([...namesIn(compile(source))].some((n) => uses.has(n))) uses.add(v.name);
    } catch {
      // Reported by validation.
    }
  }
  return uses.has(value);
}

const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);
// The formula engine turns infinities into NaN, so these are the usual causes.
const explain = (n: number) => (Number.isFinite(n) ? String(n) : "division by zero, or a root or log of a negative number");
