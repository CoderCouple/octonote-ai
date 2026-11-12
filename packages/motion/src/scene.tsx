import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx, useCountUp, useReducedMotion } from "./primitives.js";
import { validateScene, type Scene, type SceneElement, type SpecIssue } from "./schema.js";
import { arrowEnds, DEFAULT_SIZE, DEFAULT_STEP_MS, sceneStateAt, type ElementState } from "./state.js";

export type Theme = "light" | "dark" | "system";

export interface ScenePlayerProps {
  /** A scene from any source. It is validated before anything renders. */
  spec: unknown;
  autoPlay?: boolean;
  loop?: boolean;
  theme?: Theme;
  className?: string;
  onStepChange?: (index: number) => void;
  fallback?: (issues: SpecIssue[]) => ReactNode;
}

/** Validates a scene and plays it, or shows a safe message. */
export function ScenePlayer({ spec, fallback, theme = "system", className, ...rest }: ScenePlayerProps) {
  const result = useMemo(() => validateScene(spec), [spec]);
  return (
    <div className={cx("mo-root", className)} data-mo-theme={theme}>
      {result.ok ? (
        <Player key={result.spec.id} scene={result.spec} {...rest} />
      ) : fallback ? (
        fallback(result.issues)
      ) : (
        <div className="mo-notice" role="alert">
          <p className="mo-notice__title">This animation couldn't be shown</p>
          <ul>
            {result.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                {issue.path ? <code>{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

function Player({ scene, autoPlay = false, loop = false, onStepChange }: { scene: Scene; autoPlay?: boolean; loop?: boolean; onStepChange?: (index: number) => void }) {
  const total = scene.steps.length;
  // -1 is the scene before the first step.
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const reduced = useReducedMotion();
  const state = useMemo(() => sceneStateAt(scene, step), [scene, step]);
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  const transcriptId = useId();

  const go = (index: number) => setStep(Math.max(-1, Math.min(index, total - 1)));

  useEffect(() => {
    onStepChangeRef.current?.(step);
  }, [step]);

  // Autoplay: wait out the current step, then move on.
  useEffect(() => {
    if (!playing) return;
    if (step >= total - 1 && !loop) {
      setPlaying(false);
      return;
    }
    const wait = step < 0 ? 400 : (scene.steps[step]!.duration ?? DEFAULT_STEP_MS) / speed;
    const timer = setTimeout(() => setStep((s) => (s >= total - 1 ? (loop ? -1 : s) : s + 1)), wait);
    return () => clearTimeout(timer);
  }, [playing, step, speed, total, loop, scene]);

  const togglePlay = () => {
    if (!playing && step >= total - 1) setStep(-1);
    setPlaying((p) => !p);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
    if (event.key === " " && target.tagName !== "BUTTON") togglePlay();
    else if (event.key === "ArrowRight") go(step + 1);
    else if (event.key === "ArrowLeft") go(step - 1);
    else if (event.key === "Home") go(-1);
    else if (event.key === "End") go(total - 1);
    else return;
    event.preventDefault();
  };

  const width = scene.width ?? DEFAULT_SIZE.width;
  const height = scene.height ?? DEFAULT_SIZE.height;
  const byId = useMemo(() => new Map(scene.elements.map((el) => [el.id, el])), [scene]);
  const caption = step < 0 ? "Press play, or use the arrow keys to step through." : scene.steps[step]!.caption;
  // Arrows draw behind shapes.
  const ordered = useMemo(() => [...scene.elements].sort((a, b) => Number(b.kind === "arrow") - Number(a.kind === "arrow")), [scene]);

  return (
    <section className={cx("mo-player", reduced && "mo-player--reduced")} aria-label={scene.title ?? "Animation"} tabIndex={0} onKeyDown={onKeyDown}>
      {scene.title ? <h3 className="mo-player__title">{scene.title}</h3> : null}
      <div className="mo-stage">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${scene.title ?? "Animation"}: ${caption}`} className="mo-svg">
          <defs>
            <marker id={`${transcriptId}-head`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="mo-arrowhead" />
            </marker>
          </defs>
          {ordered.map((el) => (
            <SceneShape key={el.id} el={el} at={state[el.id]!} state={state} byId={byId} marker={`${transcriptId}-head`} />
          ))}
        </svg>
      </div>

      <p className="mo-caption" aria-live="polite">
        {step >= 0 ? (
          <span className="mo-caption__count">
            {step + 1}/{total}
          </span>
        ) : null}
        {caption}
      </p>

      <div className="mo-controls">
        <button type="button" className="mo-button" onClick={() => go(step - 1)} disabled={step < 0} aria-label="Previous step">
          ←
        </button>
        <button type="button" className="mo-button mo-button--primary" onClick={togglePlay} aria-label={playing ? "Pause" : step >= total - 1 ? "Replay" : "Play"}>
          {playing ? "❚❚" : step >= total - 1 ? "↺" : "▶"}
        </button>
        <button type="button" className="mo-button" onClick={() => go(step + 1)} disabled={step >= total - 1} aria-label="Next step">
          →
        </button>
        <input
          type="range"
          className="mo-scrubber"
          min={-1}
          max={total - 1}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            go(Number(e.target.value));
          }}
          aria-label="Step"
          aria-valuetext={step < 0 ? "Start" : `Step ${step + 1} of ${total}`}
        />
        <label className="mo-speed">
          <span className="mo-visually-hidden">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="mo-transcript">
        <summary>Transcript</summary>
        <ol>
          {scene.steps.map((s, i) => (
            <li key={i} aria-current={i === step ? "step" : undefined}>
              <button type="button" onClick={() => go(i)}>
                {s.caption}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/** Splits text into lines of about `max` characters for SVG, which doesn't wrap. */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function Label({ text, x, y, width, size = 16 }: { text: string; x: number; y: number; width: number; size?: number }) {
  const lines = wrapText(text, Math.max(6, Math.floor(width / (size * 0.56))));
  const top = y - ((lines.length - 1) * size * 1.2) / 2;
  return (
    <text x={x} y={top} textAnchor="middle" dominantBaseline="central" className="mo-label" style={{ fontSize: size }}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size * 1.2}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Counter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const shown = useCountUp(value, 900);
  const decimals = Number.isInteger(value) ? 0 : 1;
  return (
    <>
      {prefix}
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  );
}

function SceneShape({ el, at, state, byId, marker }: { el: SceneElement; at: ElementState; state: Record<string, ElementState>; byId: Map<string, SceneElement>; marker: string }) {
  const tone = `mo-tone-${at.color ?? (el.kind === "text" || el.kind === "counter" ? "ink" : "blue")}`;
  if (el.kind === "arrow") {
    const from = byId.get(el.from)!;
    const to = byId.get(el.to)!;
    const fromAt = state[el.from]!;
    const toAt = state[el.to]!;
    const visible = at.visible && fromAt.visible && toAt.visible;
    const { start, end } = arrowEnds(from, fromAt, to, toAt);
    return (
      <g className={cx("mo-arrow", tone, at.highlighted && "mo-pulse")} style={{ opacity: visible ? 1 : 0 }}>
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          pathLength={1}
          markerEnd={`url(#${marker})`}
          className={cx("mo-arrow__line", el.dashed && "mo-arrow__line--dashed")}
          style={el.dashed ? undefined : { strokeDasharray: 1, strokeDashoffset: visible ? 0 : 1 }}
        />
        {el.label ? (
          <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 10} textAnchor="middle" className="mo-arrow__label">
            {el.label}
          </text>
        ) : null}
      </g>
    );
  }
  return (
    <g className={cx("mo-el", tone)} style={{ opacity: at.visible ? 1 : 0, transform: `translate(${at.x}px, ${at.y}px)` }} aria-hidden={!at.visible}>
      <g className={cx(at.highlighted && "mo-pulse")}>
        {el.kind === "box" ? (
          <>
            <rect width={el.w} height={el.h} rx={14} className="mo-shape" />
            {at.text ? <Label text={at.text} x={el.w / 2} y={el.h / 2} width={el.w - 16} /> : null}
          </>
        ) : el.kind === "circle" ? (
          <>
            <circle r={el.r} className="mo-shape" />
            {at.text ? <Label text={at.text} x={0} y={0} width={el.r * 1.6} /> : null}
          </>
        ) : el.kind === "text" ? (
          <text textAnchor={el.align ?? "start"} dominantBaseline="central" className="mo-text" style={{ fontSize: el.size ?? 18 }}>
            {at.text}
          </text>
        ) : (
          <text textAnchor="middle" dominantBaseline="central" className="mo-counter" style={{ fontSize: el.size ?? 40 }}>
            <Counter value={at.value ?? el.value} prefix={el.prefix} suffix={el.suffix} />
          </text>
        )}
      </g>
    </g>
  );
}
