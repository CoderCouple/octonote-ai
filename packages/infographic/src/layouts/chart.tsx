import type { CSSProperties } from "react";
import { Icon } from "../icons.js";
import { cx, Desc, Figure, figureOf, formatNumber, Label, Part, toneVar, useInfographic } from "../parts.js";
import type { InfographicContent, ItemStyle } from "../schema.js";
import { arcPath, niceTicks, r2 } from "./geometry.js";

type Props = { spec: InfographicContent; style: ItemStyle };

const v = (n: number | undefined) => n ?? 0;

/** Horizontal bars to scale, largest value filling the track. */
export function BarsLayout({ spec }: Props) {
  const max = Math.max(...spec.items.map((it) => v(it.value)), 0) || 1;
  return (
    <ul className="ig-bars">
      {spec.items.map((item, i) => (
        <li key={i}>
          <Part k={`${i}`} item={item} index={i} className="ig-bar" style={{ "--ig-w": `${(Math.max(0, v(item.value)) / max) * 100}%` } as CSSProperties}>
            <span className="ig-bar__label">
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
              <Label>{item.label}</Label>
            </span>
            <span className="ig-bar__track" aria-hidden="true">
              <span className="ig-bar__fill" />
            </span>
            <Figure item={item} className="ig-bar__value" />
          </Part>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns on a labelled axis with light gridlines. */
export function ColumnsChartLayout({ spec }: Props) {
  const { unit } = useInfographic();
  const values = spec.items.map((it) => v(it.value));
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values, 0) || 1);
  const top = ticks[ticks.length - 1]!;
  const bottom = ticks[0]!;
  const pct = (n: number) => ((n - bottom) / (top - bottom || 1)) * 100;
  return (
    <div className="ig-cchart" style={{ "--ig-n": spec.items.length } as CSSProperties}>
      <div className="ig-cchart__plot">
        <div className="ig-cchart__ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="ig-cchart__tick" style={{ bottom: `${pct(t)}%` }}>
              <span>{formatNumber(t)}</span>
            </span>
          ))}
        </div>
        <ol className="ig-cchart__cols">
          {spec.items.map((item, i) => (
            <li key={i} className="ig-cchart__slot">
              <Part k={`${i}`} item={item} index={i} className="ig-cchart__part" style={{ "--ig-h": `${pct(v(item.value)) - pct(Math.max(0, bottom))}%`, "--ig-b": `${pct(Math.max(0, bottom))}%` } as CSSProperties}>
                <span className="ig-cchart__value">{figureOf(item, unit)}</span>
                <span className="ig-cchart__col" aria-hidden="true" />
                <span className="ig-sr">{item.label}</span>
              </Part>
            </li>
          ))}
        </ol>
      </div>
      <ol className="ig-cchart__labels" aria-hidden="true">
        {spec.items.map((item, i) => (
          <li key={i}>{item.label}</li>
        ))}
      </ol>
    </div>
  );
}

/** A pie or donut with a legend; the open slice pops out. The donut shows the total in the middle. */
export function PieLayout({ spec, donut }: Props & { donut?: boolean }) {
  const { open, unit } = useInfographic();
  const total = spec.items.reduce((s, it) => s + Math.max(0, v(it.value)), 0) || 1;
  let at = 0;
  const slices = spec.items.map((item, i) => {
    const share = Math.max(0, v(item.value)) / total;
    const a0 = at * 360;
    at += share;
    return { item, i, share, a0, a1: at * 360 };
  });
  // Values that are already percentages: show them once, and the biggest slice in a donut's middle.
  const percentages = unit === "%";
  const top = slices.reduce((a, b) => (b.share > a.share ? b : a), slices[0]!);
  return (
    <div className="ig-pie">
      <div className="ig-pie__chart">
        <svg viewBox="-110 -110 220 220" aria-hidden="true">
          {slices.map(({ item, i, a0, a1, share }) => {
            if (share <= 0) return null;
            const mid = (((a0 + a1) / 2 - 90) * Math.PI) / 180;
            const out = open === `${i}` ? 8 : 0;
            return (
              <path
                key={i}
                d={arcPath(0, 0, 100, donut ? 60 : 0, a0, a1)}
                transform={`translate(${r2(Math.cos(mid) * out)} ${r2(Math.sin(mid) * out)})`}
                className="ig-pie__slice ig-anim"
                style={{ fill: toneVar(item, i), "--ig-i": i } as CSSProperties}
              />
            );
          })}
          {!donut
            ? slices.map(({ i, a0, a1, share }) => {
                if (share < 0.06) return null;
                const mid = (((a0 + a1) / 2 - 90) * Math.PI) / 180;
                return (
                  <text key={`t${i}`} x={r2(Math.cos(mid) * 64)} y={r2(Math.sin(mid) * 64)} className="ig-pie__pct" textAnchor="middle" dominantBaseline="central">
                    {Math.round(share * 100)}%
                  </text>
                );
              })
            : null}
        </svg>
        {donut ? (
          <div className="ig-pie__center">
            {percentages ? (
              <>
                <span className="ig-pie__total">{Math.round(top.share * 100)}%</span>
                <span className="ig-pie__caption">{top.item.label}</span>
              </>
            ) : (
              <>
                <span className="ig-pie__total">{formatNumber(total)}{unit ? ` ${unit}` : ""}</span>
                <span className="ig-pie__caption">Total</span>
              </>
            )}
          </div>
        ) : null}
      </div>
      <ul className="ig-legend">
        {slices.map(({ item, i, share }) => (
          <li key={i}>
            <Part k={`${i}`} item={item} index={i} className="ig-legend__row">
              <span className="ig-legend__swatch" aria-hidden="true" />
              <span className="ig-item__text">
                <Label>{item.label}</Label>
                <Desc lines={1}>{item.desc}</Desc>
              </span>
              <span className="ig-legend__nums">
                <Figure item={item} className="ig-figure--inline" />
                {percentages ? null : <span className="ig-legend__pct">{Math.round(share * 100)}%</span>}
              </span>
            </Part>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Big numbers, each with a coloured rule and what it means. */
export function StatsLayout({ spec }: Props) {
  const n = spec.items.length;
  return (
    <div className="ig-stats" style={{ "--ig-cols": n <= 4 ? n : 3 } as CSSProperties}>
      {spec.items.map((item, i) => (
        <Part key={i} k={`${i}`} item={item} index={i} className="ig-stat">
          <span className="ig-stat__top">
            {item.icon ? (
              <span className="ig-stat__icon" aria-hidden="true">
                <Icon name={item.icon} size={18} />
              </span>
            ) : null}
            <Label>{item.label}</Label>
          </span>
          <Figure item={item} className="ig-stat__big" />
          <Desc lines={3}>{item.desc}</Desc>
        </Part>
      ))}
    </div>
  );
}

/** Progress rings, one per item, the percentage in the middle. */
export function RingsLayout({ spec }: Props) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="ig-rings" style={{ "--ig-cols": spec.items.length } as CSSProperties}>
      {spec.items.map((item, i) => {
        const p = Math.min(100, Math.max(0, v(item.value)));
        return (
          <Part key={i} k={`${i}`} item={item} index={i} className="ig-ring">
            <span className="ig-ring__dial">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={r} className="ig-ring__track" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  className="ig-ring__arc"
                  style={{ strokeDasharray: c, "--ig-off": c * (1 - p / 100), "--ig-full": c } as CSSProperties}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <span className="ig-ring__pct">{item.display ?? `${formatNumber(p)}%`}</span>
            </span>
            <Label>{item.label}</Label>
            <Desc lines={2}>{item.desc}</Desc>
          </Part>
        );
      })}
    </div>
  );
}

/** A trend: points joined by a line over a soft area, with nice ticks and the values above. */
export function LineLayout({ spec }: Props) {
  const { unit } = useInfographic();
  const values = spec.items.map((it) => v(it.value));
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values) || 1);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const n = spec.items.length;
  const X = (i: number) => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92);
  const Y = (val: number) => 100 - ((val - lo) / (hi - lo || 1)) * 100;
  const line = values.map((val, i) => `${X(i)},${Y(val)}`).join(" ");
  const area = `${X(0)},100 ${line} ${X(n - 1)},100`;
  const tone = toneVar(spec.items[0], 0);
  const showValues = n <= 12;
  return (
    <div className="ig-line" style={{ "--ig-tone": tone } as CSSProperties}>
      <div className="ig-line__plot">
        <div className="ig-cchart__ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="ig-cchart__tick" style={{ bottom: `${((t - lo) / (hi - lo || 1)) * 100}%` }}>
              <span>{formatNumber(t)}</span>
            </span>
          ))}
        </div>
        <svg className="ig-line__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="ig-line-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#ig-line-area)" className="ig-line__area" />
          <polyline points={line} className="ig-line__path" vectorEffect="non-scaling-stroke" />
        </svg>
        {spec.items.map((item, i) => (
          <div key={i} className="ig-line__spot" style={{ left: `${X(i)}%`, top: `${Y(values[i]!)}%` }}>
            <Part k={`${i}`} item={{ ...item, tone: undefined }} index={0} className={cx("ig-line__point", item.detail && "ig-line__point--open")}>
              <span className="ig-line__dot" aria-hidden="true" />
              {showValues ? <span className="ig-line__value">{figureOf(item, unit)}</span> : null}
              <span className="ig-sr">{item.label}</span>
            </Part>
          </div>
        ))}
      </div>
      <ol className="ig-line__labels" aria-hidden="true">
        {spec.items.map((item, i) => (
          <li key={i} style={{ left: `${X(i)}%` }}>
            {n > 12 && i % Math.ceil(n / 8) !== 0 && i !== n - 1 ? "" : item.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
