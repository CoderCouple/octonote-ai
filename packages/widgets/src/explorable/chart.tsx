import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { cx } from "../provider.js";
import { formatNumber, renderTemplate, type NumberFormat } from "./format.js";
import type { Scope } from "./expr.js";
import type { DataTable } from "./data.js";
import { useInputDrag, useRuntime } from "./interact.js";
import { chartData, valueOf } from "./runtime.js";
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
  const overlay = useRef<SVGSVGElement>(null);
  const tables = useRuntime()?.spec.data;
  const data = useMemo(() => chartData(view, scope, (tables ?? []) as DataTable[]), [view, scope, tables]);
  const categories = data.categories;
  // One row per x, holding each series' value there (NaN where a series has none).
  const points = useMemo(() => {
    const lookups = data.series.map((pts) => new Map(pts.map((p) => [p.x, p.y])));
    return data.xs.map((x) => ({ x, ys: lookups.map((m) => m.get(x) ?? NaN) }));
  }, [data]);
  const series = view.series.map((s, i) => ({ ...s, color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]! }));
  const yFormat: NumberFormat = { ...view.y?.format, ...(currency && view.y?.format?.style === "currency" && !view.y.format.currency ? { currency } : {}) };
  const xFormat: NumberFormat = view.x.format ?? {};
  const xText = (x: number) => (categories ? (categories[x] ?? "") : formatNumber(x, xFormat));
  const marks = (view.marks ?? []).map((m) => ({ ...m, xv: m.x !== undefined ? valueOf(m.x, scope) : undefined, yv: m.y !== undefined ? valueOf(m.y, scope) : undefined }));

  const finite = points.flatMap((p) => p.ys).filter(Number.isFinite);
  const dataMin = finite.length ? Math.min(...finite) : 0;
  const dataMax = finite.length ? Math.max(...finite) : 1;
  // Marks on the y axis widen the range so they stay visible.
  const markYs = marks.map((m) => m.yv).filter((y): y is number => y !== undefined && Number.isFinite(y));
  const niceY = niceTicks(view.y?.min ?? Math.min(0, dataMin, ...markYs), view.y?.max ?? Math.max(dataMax, ...markYs), 5);
  const yMin = view.y?.min ?? niceY[0]!;
  const yMax = view.y?.max ?? niceY[niceY.length - 1]!;
  // A fixed range keeps only the round ticks inside it.
  const yTicks = niceY.filter((t) => t >= yMin && t <= yMax);
  const firstX = points[0]?.x ?? 0;
  const lastX = points[points.length - 1]?.x ?? 1;
  const xMin = categories ? 0 : (view.x.from ?? firstX);
  // With xTo, the axis ends where the data ends (e.g. at the chosen number of years).
  const xEnd = categories ? Math.max(0, categories.length - 1) : view.xTo ? lastX : (view.x.to ?? lastX);
  const xMax = kind === "bar" ? lastX : xEnd;

  const height = width < 420 ? 200 : 240;
  const longestY = Math.max(...yTicks.map((t) => formatNumber(t, yFormat).length));
  const pad = { top: 12, right: 16, bottom: 30, left: Math.min(90, 14 + longestY * 7) };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = kind === "bar" ? plotW / Math.max(1, points.length) : 0;
  const sx = (x: number) => (kind === "bar" ? pad.left + band * (points.findIndex((p) => p.x === x) + 0.5) : pad.left + ((x - xMin) / (xMax - xMin || 1)) * plotW);
  /** Unclamped, for lines: they're clipped at the plot's edge instead of flattened onto it. */
  const syFree = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin || 1)) * plotH;
  const sy = (y: number) => syFree(Math.min(Math.max(y, yMin), yMax));
  const inRange = (y: number) => y >= yMin - 1e-9 && y <= yMax + 1e-9;
  const clipId = `${tableId.replace(/:/g, "")}-clip`;

  // X ticks: every point when there are few, otherwise round values.
  const fits = Math.max(2, Math.floor(plotW / (categories ? Math.max(40, 7 * Math.max(...categories.map((c) => c.length))) : 70)));
  const xTicks = categories
    ? points.map((p) => p.x).filter((_, i, all) => i % Math.ceil(all.length / fits) === 0)
    : points.length <= 13
      ? points.map((p) => p.x)
      : niceTicks(xMin, xEnd, Math.max(3, fits)).filter((t) => t >= xMin && t <= xEnd);
  const showDots = kind === "scatter" || (kind !== "bar" && points.length <= 40);

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
          <defs>
            <clipPath id={clipId}>
              <rect x={pad.left - 6} y={pad.top - 6} width={plotW + 12} height={plotH + 12} />
            </clipPath>
          </defs>
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
              {xText(t)}
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
                // Far-off values are capped so the path stays drawable; the clip hides them.
                const far = (y: number) => Math.max(yMin - (yMax - yMin) * 10, Math.min(yMax + (yMax - yMin) * 10, y));
                const line = points
                  .filter((p) => Number.isFinite(p.ys[j]))
                  .map((p, i) => `${i ? "L" : "M"} ${sx(p.x).toFixed(1)} ${syFree(far(p.ys[j]!)).toFixed(1)}`)
                  .join(" ");
                if (!line) return null;
                const finitePoints = points.filter((p) => Number.isFinite(p.ys[j]));
                const area = `${line} L ${sx(finitePoints[finitePoints.length - 1]!.x).toFixed(1)} ${sy(Math.max(yMin, 0)).toFixed(1)} L ${sx(finitePoints[0]!.x).toFixed(1)} ${sy(Math.max(yMin, 0)).toFixed(1)} Z`;
                return (
                  <g key={j} className={`wg-c-${s.color}`} clipPath={`url(#${clipId})`}>
                    {kind === "area" ? <path d={area} className="wg-chart__area" /> : null}
                    {kind === "scatter" || s.style === "points" ? null : <path d={line} className="wg-chart__line" />}
                    {s.style === "points"
                      ? points.map((p, i) => (Number.isFinite(p.ys[j]) && inRange(p.ys[j]!) ? <circle key={i} cx={sx(p.x)} cy={sy(p.ys[j]!)} r={active === i ? 6 : 4.5} className="wg-chart__dot" /> : null))
                      : showDots
                      ? points.map((p, i) => (Number.isFinite(p.ys[j]) && inRange(p.ys[j]!) ? <circle key={i} cx={sx(p.x)} cy={sy(p.ys[j]!)} r={active === i ? 5 : 3.2} className="wg-chart__dot" /> : null))
                      : activePoint && Number.isFinite(activePoint.ys[j]) && inRange(activePoint.ys[j]!)
                        ? <circle cx={sx(activePoint.x)} cy={sy(activePoint.ys[j]!)} r={5} className="wg-chart__dot" />
                        : null}
                  </g>
                );
              })}
          {marks.map((m, i) => {
            const x = m.xv !== undefined && Number.isFinite(m.xv) && m.xv >= xMin && m.xv <= xMax ? sx(m.xv) : undefined;
            const y = m.yv !== undefined && Number.isFinite(m.yv) && inRange(m.yv) ? sy(m.yv) : undefined;
            if ((m.xv !== undefined && x === undefined) || (m.yv !== undefined && y === undefined)) return null;
            const label = m.label ? renderTemplate(m.label, scope, currency) : undefined;
            return (
              <g key={`mark-${i}`} className={cx("wg-chart__mark", `wg-c-${m.color ?? "red"}`)}>
                {x !== undefined && y === undefined ? <line x1={x} x2={x} y1={pad.top} y2={pad.top + plotH} /> : null}
                {y !== undefined && x === undefined ? <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} /> : null}
                {x !== undefined && y !== undefined ? <circle cx={x} cy={y} r={5} /> : null}
                {label ? (
                  <text
                    x={x !== undefined ? Math.min(x + 6, width - pad.right - 4) : width - pad.right - 4}
                    y={y !== undefined ? y - 8 : pad.top + 12}
                    textAnchor={x === undefined || x > width - 120 ? "end" : "start"}
                    className="wg-chart__mark-label"
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {activePoint && kind !== "bar" ? <line x1={sx(activePoint.x)} x2={sx(activePoint.x)} y1={pad.top} y2={pad.top + plotH} className="wg-chart__guide" /> : null}
        </svg>
        {view.handles?.length && kind !== "bar" ? (
          <svg ref={overlay} width={width} height={height} className="wg-chart__handles">
            {view.handles.map((handle, i) => (
              <ChartHandle key={i} handle={handle} scope={scope} sx={sx} sy={sy} overlay={overlay} width={width} height={height} currency={currency} />
            ))}
          </svg>
        ) : null}
        {activePoint ? (
          <div className="wg-chart__tip" style={{ left: tipLeft }} role="status">
            <p className="wg-chart__tip-x">
              {view.x.label && !categories ? `${view.x.label} ` : ""}
              {xText(activePoint.x)}
            </p>
            {series.map((s, j) => Number.isFinite(activePoint.ys[j]) ? (
              <p key={j} className="wg-chart__tip-row">
                <span className={cx("wg-swatch", `wg-c-${s.color}`)} aria-hidden="true" />
                {s.label}: <strong>{formatNumber(activePoint.ys[j]!, yFormat)}</strong>
              </p>
            ) : null)}
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
              <td>{xText(p.x)}</td>
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

type Handle = NonNullable<ChartView["handles"]>[number];

/** A point the reader drags to set an input; it sits where its x and y formulas put it. */
function ChartHandle({ handle, scope, sx, sy, overlay, width, height, currency }: { handle: Handle; scope: Scope; sx: (x: number) => number; sy: (y: number) => number; overlay: RefObject<SVGSVGElement | null>; width: number; height: number; currency?: string }) {
  const control = useInputDrag(handle.input, (event) => {
    const box = overlay.current?.getBoundingClientRect();
    if (!box || !box.width) return undefined;
    const px = ((event.clientX - box.left) / box.width) * width;
    const py = ((event.clientY - box.top) / box.height) * height;
    return (s) => Math.hypot(sx(valueOf(handle.x, s)) - px, sy(valueOf(handle.y, s)) - py);
  });
  const x = valueOf(handle.x, scope);
  const y = valueOf(handle.y, scope);
  if (!control || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cx0 = sx(x);
  const cy0 = sy(y);
  const label = handle.label ? renderTemplate(handle.label, scope, currency) : undefined;
  return (
    <g className={cx("wg-chart__handle", `wg-c-${handle.color ?? "orange"}`)}>
      <circle cx={cx0} cy={cy0} r={16} className="wg-handle__halo" aria-hidden="true" />
      <circle cx={cx0} cy={cy0} r={7.5} className="wg-handle" {...control.slider} {...control.drag} />
      {label ? (
        <text x={Math.min(cx0 + 12, width - 4)} y={cy0 - 12} textAnchor={cx0 + 12 > width - 80 ? "end" : "start"} className="wg-chart__handle-label" aria-hidden="true">
          {label}
        </text>
      ) : null}
    </g>
  );
}
