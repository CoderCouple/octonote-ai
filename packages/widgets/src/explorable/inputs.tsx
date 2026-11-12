import { useId, type CSSProperties } from "react";
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
}

/** A labelled range slider: label left, value right, a thick track below. */
export function Slider({ label, value, min, max, step = 1, onChange, display, pill }: SliderProps) {
  const id = useId();
  const shown = display ?? String(value);
  const percent = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="wg-slider">
      <div className="wg-slider__header">
        <label htmlFor={id} className="wg-slider__label">
          {label}
        </label>
        <output htmlFor={id} className={cx("wg-slider__value", pill && "wg-slider__value--pill")}>
          {shown}
        </output>
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
    return <Slider label={input.label} value={value} min={input.min} max={input.max} step={step} onChange={onChange} display={word ?? formatNumber(value, format)} pill={!!word} />;
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
