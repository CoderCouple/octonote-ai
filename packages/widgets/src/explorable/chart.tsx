import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "../provider.js";
import { formatNumber, renderTemplate, type NumberFormat } from "./format.js";
import type { Scope } from "./expr.js";
import { sampleChart } from "./runtime.js";
import type { PaletteColor, WidgetView } from "./schema.js";

type ChartView = Extract<WidgetView, { type: "chart" }>;

const DEFAULT_COLORS: PaletteColor[] = ["blue", "purple", "green", "orange", "teal", "pink"];

/** Round tick values covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9 && ticks.length < 50; v += step) ticks.push(Number(v.toPrecision(12)));
  if (ticks[ticks.length - 1]! < max) ticks.push(Number((ticks[ticks.length - 1]! + step).toPrecision(12)));
  return ticks;
}

/** Width of an element, following resizes. Falls back to `fallback` where it can't be measured. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry!.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Chart({ view, scope, currency }: { view: ChartView; scope: Scope; currency?: string }) {
  const kind = view.chart ?? "line";
  const [ref, width] = useWidth(640);
  const tableId = useId();
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => sampleChart(view, scope), [view, scope]);
  const series = view.series.map((s, i) => ({ ...s, color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]! }));
  const yFormat: NumberFormat = { ...view.y?.format, ...(currency && view.y?.format?.style === "currency" && !view.y.format.currency ? { currency } : {}) };
  const xFormat: NumberFormat = view.x.format ?? {};

  const finite = points.flatMap((p) => p.ys).filter(Number.isFinite);
  const dataMin = finite.length ? Math.min(...finite) : 0;
  const dataMax = finite.length ? Math.max(...finite) : 1;
  const niceY = niceTicks(view.y?.min ?? Math.min(0, dataMin), view.y?.max ?? dataMax, 5);
  const yMin = view.y?.min ?? niceY[0]!;
  const yMax = view.y?.max ?? niceY[niceY.length - 1]!;
  // A fixed range keeps only the round ticks inside it.
  const yTicks = niceY.filter((t) => t >= yMin && t <= yMax);
  const xMin = view.x.from;
  // With xTo, the axis ends where the data ends (e.g. at the chosen number of years).
  const xEnd = view.xTo ? (points[points.length - 1]?.x ?? view.x.to) : view.x.to;
  const xMax = kind === "bar" ? (points[points.length - 1]?.x ?? view.x.to) : xEnd;

  const height = width < 420 ? 200 : 240;
  const longestY = Math.max(...yTicks.map((t) => formatNumber(t, yFormat).length));
  const pad = { top: 12, right: 16, bottom: 30, left: Math.min(90, 14 + longestY * 7) };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = kind === "bar" ? plotW / Math.max(1, points.length) : 0;
  const sx = (x: number) => (kind === "bar" ? pad.left + band * (points.findIndex((p) => p.x === x) + 0.5) : pad.left + ((x - xMin) / (xMax - xMin || 1)) * plotW);
  const sy = (y: number) => pad.top + (1 - (Math.min(Math.max(y, yMin), yMax) - yMin) / (yMax - yMin || 1)) * plotH;

  // X ticks: every point when there are few, otherwise round values.
  const xTicks = points.length <= 13 ? points.map((p) => p.x) : niceTicks(xMin, xEnd, Math.max(3, Math.floor(plotW / 70))).filter((t) => t >= xMin && t <= xEnd);
  const showDots = kind !== "bar" && points.length <= 40;

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - px) < Math.abs(sx(points[best]!.x) - px)) best = i;
    });
    setActive(best);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = points.length - 1;
    const next = { ArrowRight: (active ?? -1) + 1, ArrowLeft: (active ?? last + 1) - 1, Home: 0, End: last }[event.key];
    if (event.key === "Escape") setActive(null);
    else if (next !== undefined) setActive(Math.max(0, Math.min(last, next)));
    else return;
    event.preventDefault();
  };

  const activePoint = active !== null ? points[active] : undefined;
  const tipLeft = activePoint ? Math.min(Math.max(sx(activePoint.x), 70), width - 70) : 0;

  return (
    <figure className="wg-chart">
      <div
        ref={ref}
        className="wg-chart__plot"
        tabIndex={0}
        role="group"
        aria-label={`${kind} chart of ${series.map((s) => s.label).join(" and ")}. Use the arrow keys to read values.`}
        aria-describedby={tableId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true" onPointerMove={pick} onPointerLeave={() => setActive(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={sy(t)} y2={sy(t)} className="wg-chart__grid" />
              <text x={pad.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle" className="wg-chart__tick">
                {formatNumber(t, yFormat)}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} className="wg-chart__axis" />
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} className="wg-chart__axis" />
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={height - 10} textAnchor="middle" className="wg-chart__tick">
              {formatNumber(t, xFormat)}
            </text>
          ))}

          {kind === "bar"
            ? points.map((p, i) =>
                p.ys.map((y, j) => {
                  const w = Math.max(2, (band * 0.7) / series.length);
                  const x = pad.left + band * i + band * 0.15 + w * j;
                  const top = sy(Math.max(y, 0));
                  const bottom = sy(Math.min(y, 0) || Math.max(yMin, 0));
                  return Number.isFinite(y) ? (
                    <rect key={`${i}-${j}`} x={x} y={top} width={w} height={Math.max(0, bottom - top)} rx={3} className={cx("wg-chart__bar", `wg-c-${series[j]!.color}`, active === i && "wg-chart__bar--active")} />
                  ) : null;
                }),
              )
            : series.map((s, j) => {
                const line = points
                  .filter((p) => Number.isFinite(p.ys[j]))
                  .map((p, i) => `${i ? "L" : "M"} ${sx(p.x).toFixed(1)} ${sy(p.ys[j]!).toFixed(1)}`)
                  .join(" ");
                if (!line) return null;
                const finitePoints = points.filter((p) => Number.isFinite(p.ys[j]));
                const area = `${line} L ${sx(finitePoints[finitePoints.length - 1]!.x).toFixed(1)} ${sy(Math.max(yMin, 0)).toFixed(1)} L ${sx(finitePoints[0]!.x).toFixed(1)} ${sy(Math.max(yMin, 0)).toFixed(1)} Z`;
                return (
                  <g key={j} className={`wg-c-${s.color}`}>
                    {kind === "area" ? <path d={area} className="wg-chart__area" /> : null}
                    <path d={line} className="wg-chart__line" />
                    {showDots
                      ? points.map((p, i) => (Number.isFinite(p.ys[j]) ? <circle key={i} cx={sx(p.x)} cy={sy(p.ys[j]!)} r={active === i ? 5 : 3.2} className="wg-chart__dot" /> : null))
                      : activePoint && Number.isFinite(activePoint.ys[j])
                        ? <circle cx={sx(activePoint.x)} cy={sy(activePoint.ys[j]!)} r={5} className="wg-chart__dot" />
                        : null}
                  </g>
                );
              })}
          {activePoint && kind !== "bar" ? <line x1={sx(activePoint.x)} x2={sx(activePoint.x)} y1={pad.top} y2={pad.top + plotH} className="wg-chart__guide" /> : null}
        </svg>
        {activePoint ? (
          <div className="wg-chart__tip" style={{ left: tipLeft }} role="status">
            <p className="wg-chart__tip-x">
              {view.x.label ? `${view.x.label} ` : ""}
              {formatNumber(activePoint.x, xFormat)}
            </p>
            {series.map((s, j) => (
              <p key={j} className="wg-chart__tip-row">
                <span className={cx("wg-swatch", `wg-c-${s.color}`)} aria-hidden="true" />
                {s.label}: <strong>{formatNumber(activePoint.ys[j]!, yFormat)}</strong>
              </p>
            ))}
          </div>
        ) : null}
        {view.x.label ? <p className="wg-chart__x-label">{view.x.label}</p> : null}
      </div>
      <ul className="wg-legend" aria-hidden="true">
        {series.map((s, j) => (
          <li key={j}>
            <span className={cx("wg-swatch", `wg-c-${s.color}`)} />
            {s.label}
          </li>
        ))}
      </ul>
      {view.caption ? <figcaption className="wg-chart__caption">{renderTemplate(view.caption, scope, currency)}</figcaption> : null}
      <table id={tableId} className="wg-visually-hidden">
        <thead>
          <tr>
            <th>{view.x.label ?? "x"}</th>
            {series.map((s, j) => (
              <th key={j}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.slice(0, 60).map((p) => (
            <tr key={p.x}>
              <td>{formatNumber(p.x, xFormat)}</td>
              {p.ys.map((y, j) => (
                <td key={j}>{formatNumber(y, yFormat)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
