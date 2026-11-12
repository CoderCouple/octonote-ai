import { useEffect, useState, type CSSProperties } from "react";
import { cx } from "../provider.js";
import { RichText } from "../rich-text.js";
import { Chart } from "./chart.js";
import type { Scope } from "./expr.js";
import { formatNumber, renderTemplate, type NumberFormat } from "./format.js";
import { Icon } from "./icons.js";
import { valueOf } from "./runtime.js";
import type { NumberFormatSpec, PaletteColor, WidgetView } from "./schema.js";

type ViewOf<T extends WidgetView["type"]> = Extract<WidgetView, { type: T }>;

interface ViewProps<T extends WidgetView["type"]> {
  view: ViewOf<T>;
  scope: Scope;
  currency?: string;
}

const SEGMENT_COLORS: PaletteColor[] = ["blue", "green", "orange", "purple", "teal", "pink", "red", "gray"];

function withCurrency(format: NumberFormatSpec, currency?: string): NumberFormat {
  return { ...format, ...(currency && format?.style === "currency" && !format.currency ? { currency } : {}) };
}

const fill = (template: string | undefined, scope: Scope, currency?: string) => (template ? renderTemplate(template, scope, currency) : undefined);

export function StatsView({ view, scope, currency }: ViewProps<"stats">) {
  return (
    <dl className={cx("wg-xstats", view.items.length === 1 && "wg-xstats--single")}>
      {view.items.map((item, i) => {
        const value = valueOf(item.value, scope);
        const tone = item.tone === "auto" ? (value > 0 ? "positive" : value < 0 ? "negative" : "default") : (item.tone ?? "default");
        return (
          <div key={i} className="wg-xstat">
            <dt className="wg-xstat__label">{item.label}</dt>
            <dd className={cx("wg-xstat__value", `wg-tone-${tone}`)}>{item.display ? fill(item.display, scope, currency) : formatNumber(value, withCurrency(item.format, currency))}</dd>
            {item.note ? <dd className="wg-xstat__note">{fill(item.note, scope, currency)}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}

export function CircleView({ view, scope, currency }: ViewProps<"circle">) {
  const r = Math.max(0, valueOf(view.radius, scope));
  const size = 120;
  const drawn = Number.isFinite(r) ? Math.max(2, (r / view.max) * (size / 2 - 6)) : 0;
  const value = view.value ? valueOf(view.value, scope) : undefined;
  return (
    <div className="wg-circle">
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
        <circle r={drawn} className="wg-circle__shape" />
        <line x1={0} y1={0} x2={drawn} y2={0} className="wg-circle__radius" />
        <circle r={2.8} className="wg-circle__centre" />
      </svg>
      {value !== undefined ? (
        <div className="wg-circle__text" role="status">
          {view.label ? <p className="wg-xstat__label">{view.label}</p> : null}
          <p className="wg-xstat__value">{formatNumber(value, withCurrency(view.format, currency))}</p>
          {view.note ? <p className="wg-xstat__note">{fill(view.note, scope, currency)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function GridView({ view, scope }: ViewProps<"grid">) {
  const total = Math.max(0, Math.min(200, Math.round(valueOf(view.total, scope) || 0)));
  const filled = Math.max(0, Math.min(total, Math.round(valueOf(view.filled, scope) || 0)));
  return (
    <div
      className="wg-grid"
      role="img"
      aria-label={`${filled} of ${total} parts filled`}
      style={{ gridTemplateColumns: `repeat(${view.columns ?? Math.min(total, 12)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx("wg-grid__cell", i < filled && `wg-grid__cell--on wg-c-${view.color ?? "blue"}`)} />
      ))}
    </div>
  );
}

export function DonutView({ view, scope, currency }: ViewProps<"donut">) {
  const ratio = Math.max(0, Math.min(1, valueOf(view.value, scope) || 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  const center = fill(view.center, scope, currency) ?? formatNumber(ratio, { style: "percent", decimals: 0 });
  return (
    <div className="wg-donut">
      <svg width={132} height={132} viewBox="0 0 132 132" role="img" aria-label={`${view.label ?? "Share"}: ${center}`}>
        <circle cx={66} cy={66} r={r} className="wg-donut__track" />
        <circle cx={66} cy={66} r={r} className={cx("wg-donut__arc", `wg-c-${view.color ?? "blue"}`)} strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform="rotate(-90 66 66)" />
        <text x={66} y={66} textAnchor="middle" dominantBaseline="central" className="wg-donut__center">
          {center}
        </text>
      </svg>
      {view.label || view.detail || view.note ? (
        <div className="wg-donut__text">
          {view.label ? <p className="wg-xstat__label">{view.label}</p> : null}
          {view.detail ? <p className="wg-xstat__value">{fill(view.detail, scope, currency)}</p> : null}
          {view.note ? <p className="wg-xstat__note">{fill(view.note, scope, currency)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function MeterView({ view, scope, currency }: ViewProps<"meter">) {
  const value = valueOf(view.value, scope);
  const max = valueOf(view.max, scope);
  const percent = max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const label = fill(view.label, scope, currency);
  return (
    <div className="wg-meter">
      <div className="wg-meter__header">
        {view.icon ? (
          <span className="wg-meter__icon" style={{ "--wg-meter-at": `${percent}%` } as CSSProperties}>
            <Icon name={view.icon} />
          </span>
        ) : (
          <span />
        )}
        {label ? <span className="wg-meter__label">{label}</span> : null}
      </div>
      <div className="wg-meter__track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={label}>
        <div className={cx("wg-meter__bar", `wg-c-${view.color ?? "blue"}`)} style={{ width: `${percent}%` }} />
      </div>
      {view.note ? <p className="wg-xstat__note">{fill(view.note, scope, currency)}</p> : null}
    </div>
  );
}

export function StackedView({ view, scope, currency }: ViewProps<"stacked">) {
  const values = view.segments.map((s) => Math.max(0, valueOf(s.value, scope) || 0));
  const total = values.reduce((a, b) => a + b, 0);
  const format = withCurrency(view.format, currency);
  return (
    <div className="wg-stacked">
      <div className="wg-stacked__bar" role="img" aria-label={view.segments.map((s, i) => `${s.label} ${formatNumber(values[i]!, format)}`).join(", ")}>
        {view.segments.map((s, i) => (
          <span key={i} className={cx("wg-stacked__segment", `wg-c-${s.color ?? SEGMENT_COLORS[i]}`)} style={{ flexGrow: total ? values[i]! / total : 1 }} />
        ))}
      </div>
      <dl className="wg-xstats">
        {view.segments.map((s, i) => (
          <div key={i} className="wg-xstat">
            <dt className="wg-xstat__label">
              <span className={cx("wg-swatch", `wg-c-${s.color ?? SEGMENT_COLORS[i]}`)} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="wg-xstat__value wg-xstat__value--md">{formatNumber(values[i]!, format)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function BarsView({ view, scope, currency }: ViewProps<"bars">) {
  const values = view.items.map((item) => valueOf(item.value, scope));
  const max = view.max ? valueOf(view.max, scope) : Math.max(...values.filter(Number.isFinite), 0);
  const format = withCurrency(view.format, currency);
  return (
    <ul className="wg-hbars">
      {view.items.map((item, i) => (
        <li key={i} className="wg-hbars__item">
          <span className="wg-hbars__label">{item.label}</span>
          <span className="wg-hbars__track">
            <span className={cx("wg-hbars__bar", `wg-c-${item.color ?? SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`)} style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (values[i]! / max) * 100)) : 0}%` }} />
          </span>
          <span className="wg-hbars__value">{formatNumber(values[i]!, format)}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuestionsView({ view, scope }: ViewProps<"questions">) {
  const level = Math.round(valueOf(view.level, scope));
  const pool = view.questions.filter((q) => q.level === level);
  const questions = pool.length ? pool : view.questions;
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // A new level starts again from its first question.
  useEffect(() => {
    setIndex(0);
    setRevealed(false);
  }, [level]);
  const question = questions[index % questions.length]!;
  return (
    <div className="wg-questions">
      <p className="wg-xstat__label">
        Question {(index % questions.length) + 1} of {questions.length}
      </p>
      <p className="wg-questions__prompt" aria-live="polite">
        {question.prompt}
      </p>
      {revealed ? (
        <p className="wg-questions__answer">
          <RichText text={question.answer} />
        </p>
      ) : null}
      <div className="wg-questions__actions">
        {revealed ? (
          <button
            type="button"
            className="wg-button wg-button--secondary wg-button--md wg-questions__button"
            onClick={() => {
              setIndex((i) => i + 1);
              setRevealed(false);
            }}
          >
            Next question
          </button>
        ) : (
          <button type="button" className="wg-button wg-button--secondary wg-button--md wg-questions__button" onClick={() => setRevealed(true)}>
            Reveal answer
          </button>
        )}
      </div>
    </div>
  );
}

export function WidgetViewRenderer({ view, scope, currency }: { view: Exclude<WidgetView, { type: "input" }>; scope: Scope; currency?: string }) {
  switch (view.type) {
    case "stats":
      return <StatsView view={view} scope={scope} currency={currency} />;
    case "chart":
      return <Chart view={view} scope={scope} currency={currency} />;
    case "bars":
      return <BarsView view={view} scope={scope} currency={currency} />;
    case "circle":
      return <CircleView view={view} scope={scope} currency={currency} />;
    case "grid":
      return <GridView view={view} scope={scope} />;
    case "donut":
      return <DonutView view={view} scope={scope} currency={currency} />;
    case "meter":
      return <MeterView view={view} scope={scope} currency={currency} />;
    case "stacked":
      return <StackedView view={view} scope={scope} currency={currency} />;
    case "formula":
      return <p className="wg-formula">{renderTemplate(view.text, scope, currency)}</p>;
    case "text":
      return (
        <p className={cx("wg-xtext", view.muted && "wg-muted")}>
          <RichText text={renderTemplate(view.text, scope, currency)} />
        </p>
      );
    case "questions":
      return <QuestionsView view={view} scope={scope} />;
  }
}
