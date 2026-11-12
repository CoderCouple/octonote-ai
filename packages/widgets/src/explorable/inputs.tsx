import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "../provider.js";
import { formatNumber, type NumberFormat } from "./format.js";
import type { WidgetInput } from "./schema.js";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** What the value reads as, e.g. "7%" or "Easy". */
  display?: string;
  /** Show the value as a pill (for words) instead of plain text. */
  pill?: boolean;
  /** A play button beside the value, e.g. to sweep through the years. */
  player?: ReactNode;
}

/** A labelled range slider: label left, value right, a thick track below. */
export function Slider({ label, value, min, max, step = 1, onChange, display, pill, player }: SliderProps) {
  const id = useId();
  const shown = display ?? String(value);
  const percent = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="wg-slider">
      <div className="wg-slider__header">
        <label htmlFor={id} className="wg-slider__label">
          {label}
        </label>
        <span className="wg-slider__end">
          {player}
          <output htmlFor={id} className={cx("wg-slider__value", pill && "wg-slider__value--pill")}>
            {shown}
          </output>
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="wg-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={shown}
        style={{ "--wg-fill": `${percent}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Renders one widget input with its formatted value. */
export function WidgetInputControl({ input, value, onChange, currency }: { input: WidgetInput; value: number; onChange: (value: number) => void; currency?: string }) {
  if (input.kind === "slider") {
    const step = input.step ?? 1;
    const word = input.labels?.[Math.round((value - input.min) / step)];
    const format: NumberFormat = { ...input.format, ...(currency && input.format?.style === "currency" && !input.format.currency ? { currency } : {}) };
    return (
      <Slider
        label={input.label}
        value={value}
        min={input.min}
        max={input.max}
        step={step}
        onChange={onChange}
        display={word ?? formatNumber(value, format)}
        pill={!!word}
        player={input.play ? <PlayButton input={input} value={value} onChange={onChange} /> : null}
      />
    );
  }
  if (input.kind === "toggle") {
    return (
      <div className="wg-slider__header">
        <span className="wg-slider__label">{input.label}</span>
        <button type="button" role="switch" aria-checked={!!value} aria-label={input.label} className="wg-switch" onClick={() => onChange(value ? 0 : 1)}>
          <span className="wg-switch__track" aria-hidden="true">
            <span className="wg-switch__thumb" />
          </span>
        </button>
      </div>
    );
  }
  return (
    <fieldset className="wg-choice">
      <legend className="wg-slider__label">{input.label}</legend>
      <div className="wg-segmented">
        {input.options.map((option) => (
          <button key={option.value} type="button" aria-pressed={option.value === value} className="wg-segmented__option" onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type SliderInput = Extract<WidgetInput, { kind: "slider" }>;

/** Sweeps a slider to its maximum (from the start if it's already there), over 2 to 6 seconds. */
function PlayButton({ input, value, onChange }: { input: SliderInput; value: number; onChange: (value: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const latest = useRef(onChange);
  latest.current = onChange;
  const step = input.step ?? 1;
  const steps = Math.round((input.max - input.min) / step);

  useEffect(() => {
    if (!playing) return;
    const from = value >= input.max ? input.min : value;
    const total = Math.min(6000, Math.max(2000, steps * 150)) * ((input.max - from) / (input.max - input.min || 1));
    const snap = (v: number) => Number((input.min + Math.round((v - input.min) / step) * step).toPrecision(12));
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    if (reduced) {
      // A few visible jumps instead of continuous motion.
      const jumps = Math.min(8, Math.max(1, Math.round((input.max - from) / step)));
      let n = 0;
      const next = () => {
        n++;
        latest.current(snap(from + ((input.max - from) * n) / jumps));
        if (n < jumps) timer = setTimeout(next, 600);
        else setPlaying(false);
      };
      latest.current(snap(from));
      timer = setTimeout(next, 600);
    } else {
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / (total || 1));
        latest.current(snap(from + (input.max - from) * t));
        if (t < 1) frame = requestAnimationFrame(tick);
        else setPlaying(false);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    // Starts once per press; later value changes come from the sweep itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <button type="button" className="wg-play" aria-label={playing ? `Pause ${input.label.toLowerCase()}` : `Play ${input.label.toLowerCase()}`} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
      {playing ? "❚❚" : "▶"}
    </button>
  );
}

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const update = () => setReduced(list.matches);
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, []);
  return reduced;
}
