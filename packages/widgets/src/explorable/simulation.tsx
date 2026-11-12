import { useEffect, useMemo, useState } from "react";
import { cx } from "../provider.js";
import { compile, evaluate, type Scope } from "./expr.js";
import { formatNumber } from "./format.js";
import { valueOf } from "./runtime.js";
import { WIDGET_LIMITS, type WidgetView } from "./schema.js";

type SimulationSpec = Extract<WidgetView, { type: "simulation" }>;

/** A small, fast, seedable random generator (mulberry32), so runs can be replayed and tested. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationResult {
  outcomes: number[];
  /** Per trial: 1 for a success, 0 otherwise (only with `success`). */
  hits?: number[];
}

/** Runs every trial for one seed. Pure: the same seed and inputs give the same results. */
export function runSimulation(view: SimulationSpec, scope: Scope, seed: number): SimulationResult {
  const trials = Math.max(0, Math.min(WIDGET_LIMITS.trials, Math.round(valueOf(view.trials, scope) || 0)));
  const random = seededRandom(seed);
  const outcome = compile(view.outcome);
  const success = view.success ? compile(view.success) : undefined;
  const outcomes: number[] = [];
  const hits: number[] = [];
  for (let i = 0; i < trials; i++) {
    const value = evaluate(outcome, scope, random);
    outcomes.push(value);
    if (success) hits.push(evaluate(success, { ...scope, outcome: value }) ? 1 : 0);
  }
  return success ? { outcomes, hits } : { outcomes };
}

/** How long a run takes to play out; reduced motion shows it at once. */
const PLAY_MS = 1500;

export function SimulationView({ view, scope }: { view: SimulationSpec; scope: Scope }) {
  const [seed, setSeed] = useState(0);
  const [shown, setShown] = useState(0);
  const result = useMemo(() => (seed ? runSimulation(view, scope, seed) : undefined), [view, scope, seed]);
  const total = result?.outcomes.length ?? 0;
  const reduced = usePrefersReducedMotion();

  // Play the run out: trials appear over a second and a half.
  useEffect(() => {
    if (!result) return;
    if (reduced) return setShown(total);
    setShown(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / PLAY_MS);
      // Ease out, so the first trials are visible one by one.
      setShown(Math.max(1, Math.round(total * (1 - (1 - t) ** 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // A new seed starts a new run; input changes update the finished run in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const n = Math.min(shown, total);
  const expected = view.expected ? valueOf(view.expected, scope) : undefined;
  const share = result?.hits ? sum(result.hits, n) / (n || 1) : undefined;
  const mean = result && !result.hits ? sum(result.outcomes, n) / (n || 1) : undefined;
  const estimate = share ?? mean;
  const asShare = !!view.success;
  const show = (v: number) => (asShare ? formatNumber(v, { style: "percent", decimals: 1 }) : formatNumber(v, { decimals: 2 }));
  const trialsWanted = Math.max(0, Math.min(WIDGET_LIMITS.trials, Math.round(valueOf(view.trials, scope) || 0)));

  return (
    <div className="wg-sim">
      <div className="wg-sim__top">
        <button type="button" className="wg-button wg-button--primary wg-button--md" onClick={() => setSeed((s) => s + 1)}>
          {seed ? "Run again" : `Run ${formatNumber(trialsWanted, { decimals: 0 })} trials`}
        </button>
        <dl className="wg-sim__numbers" aria-live="polite">
          <div>
            <dt>{view.label ?? (asShare ? "Share of successes" : "Average outcome")}</dt>
            <dd className="wg-xstat__value">{estimate !== undefined && n ? show(estimate) : "—"}</dd>
            <dd className="wg-xstat__note">{n ? `after ${formatNumber(n, { decimals: 0 })} trials` : "not run yet"}</dd>
          </div>
          {expected !== undefined && Number.isFinite(expected) ? (
            <div>
              <dt>Theory</dt>
              <dd className="wg-xstat__value wg-sim__theory">{show(expected)}</dd>
              {estimate !== undefined && n ? <dd className="wg-xstat__note">off by {show(Math.abs(estimate - expected))}</dd> : null}
            </div>
          ) : null}
        </dl>
      </div>
      {result && n ? <RunningEstimate values={result.hits ?? result.outcomes} n={n} expected={expected} asShare={asShare} /> : null}
      {result && n && view.histogram ? <Histogram outcomes={result.outcomes.slice(0, n)} /> : null}
    </div>
  );
}

const sum = (values: number[], n: number) => {
  let total = 0;
  for (let i = 0; i < n; i++) total += Number.isFinite(values[i]!) ? values[i]! : 0;
  return total;
};

/** The estimate after each trial: wild at first, settling onto the theory (the law of large numbers). */
function RunningEstimate({ values, n, expected, asShare }: { values: number[]; n: number; expected?: number; asShare: boolean }) {
  const width = 600;
  const height = 120;
  const points: [number, number][] = [];
  let running = 0;
  const every = Math.max(1, Math.floor(n / 200));
  for (let i = 0; i < n; i++) {
    running += Number.isFinite(values[i]!) ? values[i]! : 0;
    if (i % every === 0 || i === n - 1) points.push([i + 1, running / (i + 1)]);
  }
  const ys = points.map((p) => p[1]).concat(expected !== undefined && Number.isFinite(expected) ? [expected] : []);
  const lo = asShare ? 0 : Math.min(...ys);
  const hi = asShare ? 1 : Math.max(...ys);
  const sx = (i: number) => 4 + ((i - 1) / Math.max(1, n - 1)) * (width - 8);
  const sy = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (height - 12);
  const d = points.map(([i, v], k) => `${k ? "L" : "M"} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  return (
    <figure className="wg-sim__running">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {expected !== undefined && Number.isFinite(expected) ? <line x1={0} x2={width} y1={sy(expected)} y2={sy(expected)} className="wg-sim__expected" /> : null}
        <path d={d} className="wg-sim__line" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="wg-chart__caption">The estimate after each trial{expected !== undefined ? "; the dashed line is the theory" : ""}.</figcaption>
    </figure>
  );
}

/** How often each outcome came up: one bar per value for small whole numbers, otherwise 20 bins. */
function Histogram({ outcomes }: { outcomes: number[] }) {
  const finite = outcomes.filter(Number.isFinite);
  const distinct = [...new Set(finite)];
  const whole = distinct.length <= 40 && distinct.every(Number.isInteger);
  let bins: { label: string; count: number }[];
  if (whole) {
    const counts = new Map<number, number>();
    for (const v of finite) counts.set(v, (counts.get(v) ?? 0) + 1);
    const min = Math.min(...distinct);
    const max = Math.max(...distinct);
    bins = Array.from({ length: max - min + 1 }, (_, i) => ({ label: String(min + i), count: counts.get(min + i) ?? 0 }));
  } else {
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const width = (max - min) / 20 || 1;
    bins = Array.from({ length: 20 }, (_, i) => ({ label: formatNumber(min + width * (i + 0.5), { decimals: 1 }), count: 0 }));
    for (const v of finite) bins[Math.min(19, Math.floor((v - min) / width))]!.count++;
  }
  const top = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="wg-sim__histogram" role="img" aria-label={`How often each outcome came up: ${bins.map((b) => `${b.label}: ${b.count}`).join(", ")}`}>
      {bins.map((b, i) => (
        <div key={i} className="wg-sim__bin" title={`${b.label}: ${b.count}`}>
          <span className={cx("wg-sim__bar")} style={{ height: `${(b.count / top) * 100}%` }} />
          {bins.length <= 24 || i % Math.ceil(bins.length / 12) === 0 ? <span className="wg-sim__bin-label">{b.label}</span> : <span className="wg-sim__bin-label" />}
        </div>
      ))}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
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
