import { createContext, useContext, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "../provider.js";
import type { Scope } from "./expr.js";
import { formatNumber, type NumberFormat } from "./format.js";
import { computeScope, type InputValues } from "./runtime.js";
import type { WidgetInput, WidgetSpec } from "./schema.js";

/** What views need to change inputs directly: the spec, the current values and a setter. */
export interface WidgetRuntime {
  spec: Pick<WidgetSpec, "inputs" | "values" | "currency" | "data">;
  inputs: InputValues;
  scope: Scope;
  setInput: (id: string, value: number) => void;
  /** The pinned settings' scope, when the reader has pinned some to compare against. */
  pinned?: Scope;
}

const RuntimeContext = createContext<WidgetRuntime | null>(null);
export const RuntimeProvider = RuntimeContext.Provider;
export const useRuntime = () => useContext(RuntimeContext);

/** The values an input can take: a slider's steps or a select's options. */
export function inputValues(input: WidgetInput): number[] {
  if (input.kind === "select") return input.options.map((o) => o.value);
  if (input.kind === "toggle") return [0, 1];
  const step = input.step ?? 1;
  const count = Math.round((input.max - input.min) / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((input.min + i * step).toPrecision(12)));
}

/**
 * The input value that brings something closest to where the reader dragged.
 * `cost` gets the scope with a candidate value and says how far off it is.
 * Works for any formula, so a spec never has to say how to invert one.
 */
export function solveInput(runtime: WidgetRuntime, inputId: string, cost: (scope: Scope) => number): number | undefined {
  const input = runtime.spec.inputs.find((i) => i.id === inputId);
  if (!input) return undefined;
  const all = inputValues(input);
  const at = (value: number) => {
    try {
      const c = cost(computeScope(runtime.spec, { ...runtime.inputs, [inputId]: value }));
      return Number.isFinite(c) ? c : Infinity;
    } catch {
      return Infinity;
    }
  };
  // Coarse pass over at most 200 candidates, then every step around the best one.
  const stride = Math.max(1, Math.ceil(all.length / 200));
  let best = 0;
  let bestCost = Infinity;
  for (let i = 0; i < all.length; i += stride) {
    const c = at(all[i]!);
    if (c < bestCost) [best, bestCost] = [i, c];
  }
  for (let i = Math.max(0, best - stride); i <= Math.min(all.length - 1, best + stride); i++) {
    const c = at(all[i]!);
    if (c < bestCost) [best, bestCost] = [i, c];
  }
  return bestCost < Infinity ? all[best] : undefined;
}

/** Arrow keys, Page Up/Down, Home and End move an input through its values. */
export function keyStep(input: WidgetInput, value: number, key: string): number | undefined {
  const all = inputValues(input);
  let i = all.findIndex((v) => Math.abs(v - value) < 1e-9);
  if (i < 0) i = all.reduce((best, v, j) => (Math.abs(v - value) < Math.abs(all[best]! - value) ? j : best), 0);
  const big = Math.max(1, Math.round(all.length / 10));
  const next = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, PageUp: i + big, PageDown: i - big, Home: 0, End: all.length - 1 }[key];
  return next === undefined ? undefined : all[Math.max(0, Math.min(all.length - 1, next))];
}

/** Pointer drag on an element, reporting each position; keeps the pointer captured while dragging. */
export function useDrag(onMove: (event: PointerEvent<Element>) => void) {
  const dragging = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<Element>) => {
      if (event.button !== 0) return;
      dragging.current = true;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      event.preventDefault();
      onMove(event);
    },
    onPointerMove: (event: PointerEvent<Element>) => {
      if (dragging.current) onMove(event);
    },
    onPointerUp: (event: PointerEvent<Element>) => {
      dragging.current = false;
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
  };
}

/**
 * Lets a view set an input by direct manipulation. `aim` turns a pointer
 * event into a cost function: how far a candidate value lands from it.
 */
export function useInputDrag(inputId: string | undefined, aim: (event: PointerEvent<Element>) => ((scope: Scope) => number) | undefined) {
  const runtime = useRuntime();
  const input = inputId ? runtime?.spec.inputs.find((i) => i.id === inputId) : undefined;
  const drag = useDrag((event) => {
    if (!runtime || !input) return;
    const cost = aim(event);
    if (!cost) return;
    const value = solveInput(runtime, input.id, cost);
    if (value !== undefined && value !== runtime.inputs[input.id]) runtime.setInput(input.id, value);
  });
  if (!runtime || !input) return null;
  const value = runtime.inputs[input.id]!;
  return {
    drag,
    /** Props for the focusable element that stands for the input. */
    slider: {
      role: "slider" as const,
      tabIndex: 0,
      "aria-label": `${input.label} (drag or use the arrow keys)`,
      "aria-valuenow": value,
      "aria-valuetext": formatInput(input, value, runtime.spec.currency),
      onKeyDown: (event: KeyboardEvent) => {
        const next = keyStep(input, value, event.key);
        if (next === undefined) return;
        event.preventDefault();
        runtime.setInput(input.id, next);
      },
    },
  };
}

export function formatInput(input: WidgetInput, value: number, currency?: string): string {
  if (input.kind === "toggle") return value ? "on" : "off";
  if (input.kind === "select") return input.options.find((o) => o.value === value)?.label ?? String(value);
  const word = input.labels?.[Math.round((value - input.min) / (input.step ?? 1))];
  if (word) return word;
  const format: NumberFormat = { ...input.format, ...(currency && input.format?.style === "currency" && !input.format.currency ? { currency } : {}) };
  return formatNumber(value, format);
}

/**
 * An input inside a sentence: a number you drag sideways (or step with the
 * arrow keys), a choice you click through, or a switch.
 */
export function InlineInput({ input, value, onChange, currency }: { input: WidgetInput; value: number; onChange: (value: number) => void; currency?: string }) {
  const start = useRef<{ x: number; value: number } | null>(null);
  const shown = formatInput(input, value, currency);
  const all = inputValues(input);
  // The whole range is about 240 px of drag, but never less than 3 px a step.
  const pxPerStep = Math.max(3, 240 / Math.max(1, all.length - 1));
  const drag = useDrag((event) => {
    if (event.type === "pointerdown") start.current = { x: event.clientX, value };
    if (!start.current) return;
    const steps = Math.round((event.clientX - start.current.x) / pxPerStep);
    const from = all.findIndex((v) => Math.abs(v - start.current!.value) < 1e-9);
    const next = all[Math.max(0, Math.min(all.length - 1, (from < 0 ? 0 : from) + steps))]!;
    if (next !== value) onChange(next);
  });

  if (input.kind === "toggle") {
    return (
      <button type="button" className={cx("wg-inline", "wg-inline--toggle", value ? "wg-inline--on" : null)} aria-pressed={!!value} aria-label={input.label} onClick={() => onChange(value ? 0 : 1)}>
        {input.label}
      </button>
    );
  }
  if (input.kind === "select") {
    const options = input.options;
    const index = Math.max(0, options.findIndex((o) => o.value === value));
    return (
      <button
        type="button"
        className="wg-inline wg-inline--choice"
        aria-label={`${input.label}: ${shown}. Click to change.`}
        onClick={() => onChange(options[(index + 1) % options.length]!.value)}
        onKeyDown={(event: KeyboardEvent) => {
          const next = keyStep(input, value, event.key);
          if (next === undefined) return;
          event.preventDefault();
          onChange(next);
        }}
      >
        {shown}
      </button>
    );
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      className="wg-inline wg-inline--number"
      aria-label={input.label}
      aria-valuemin={input.min}
      aria-valuemax={input.max}
      aria-valuenow={value}
      aria-valuetext={shown}
      title={`Drag to change ${input.label.toLowerCase()}`}
      {...drag}
      onKeyDown={(event) => {
        const next = keyStep(input, value, event.key);
        if (next === undefined) return;
        event.preventDefault();
        onChange(next);
      }}
    >
      {shown}
    </span>
  );
}

export function Sentence({ parts, render }: { parts: (string | { input: string })[]; render: (part: string, key: number) => ReactNode }) {
  const runtime = useRuntime();
  if (!runtime) return null;
  return (
    <p className="wg-sentence">
      {parts.map((part, i) => {
        if (typeof part === "string") return render(part, i);
        const input = runtime.spec.inputs.find((x) => x.id === part.input);
        return input ? <InlineInput key={i} input={input} value={runtime.inputs[input.id]!} onChange={(v) => runtime.setInput(input.id, v)} currency={runtime.spec.currency} /> : null;
      })}
    </p>
  );
}
