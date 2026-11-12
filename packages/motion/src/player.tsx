import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DARK_THEME, LIGHT_THEME } from "./engine/color.js";
import { computeLayout } from "./engine/layout.js";
import { renderFrame, UNIT } from "./engine/render.js";
import { compileScene } from "./engine/timeline.js";
import { cx, useInView, useReducedMotion } from "./primitives.js";
import { validateScene, type Scene, type SpecIssue } from "./schema.js";

export type Theme = "light" | "dark" | "system";

export interface ScenePlayerProps {
  /** A scene from any source. It is validated before anything renders. */
  spec: unknown;
  /** Start playing when the player scrolls into view. */
  autoPlay?: boolean;
  loop?: boolean;
  /** Theme of the player's controls; the scene's own background comes from the spec. */
  theme?: Theme;
  /** Renders TeX formulas (e.g. with KaTeX). Without it, formulas show as readable text. */
  renderMath?: (tex: string) => ReactNode;
  className?: string;
  onStepChange?: (index: number) => void;
  fallback?: (issues: SpecIssue[]) => ReactNode;
  /** Show the "Download video" button. Defaults to true. */
  allowDownload?: boolean;
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
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Player({ scene, autoPlay = false, loop = false, renderMath, onStepChange, allowDownload = true }: Omit<ScenePlayerProps, "spec" | "fallback" | "theme" | "className"> & { scene: Scene }) {
  const layout = useMemo(() => computeLayout(scene), [scene]);
  const compiled = useMemo(() => compileScene(scene, layout), [scene, layout]);
  const sceneTheme = scene.background === "light" ? LIGHT_THEME : DARK_THEME;
  const duration = compiled.duration;
  const W = layout.canvas.w * UNIT;
  const H = layout.canvas.h * UNIT;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [recording, setRecording] = useState<null | { progress: number }>(null);
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const inView = useInView(root, { once: true });
  const prefix = useId().replace(/:/g, "");
  const tRef = useRef(t);
  tRef.current = t;
  const holdUntil = useRef(0);

  const stepIndex = Math.max(0, compiled.steps.findIndex((s) => t >= s.start && t < s.end) === -1 ? compiled.steps.length - 1 : compiled.steps.findIndex((s) => t >= s.start && t < s.end));
  const onStepRef = useRef(onStepChange);
  onStepRef.current = onStepChange;
  useEffect(() => onStepRef.current?.(stepIndex), [stepIndex]);

  // The clock: a pure time value the frame is drawn from.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * (recording ? 1 : speed);
      last = now;
      if (reduced && !recording) {
        // Reduced motion: show each step's finished state, hold it as long as the step lasts, move on.
        if (now < holdUntil.current) {
          frame = requestAnimationFrame(tick);
          return;
        }
        const next = compiled.steps.find((s) => tRef.current < s.end - 0.06);
        if (!next) {
          setT(duration);
          setPlaying(false);
          return;
        }
        setT(next.end - 0.05);
        holdUntil.current = now + ((next.end - next.start) * 1000) / speed;
        frame = requestAnimationFrame(tick);
        return;
      }
      let next = tRef.current + dt;
      if (next >= duration) {
        if (loop && !recording) next = 0;
        else {
          setT(duration);
          setPlaying(false);
          return;
        }
      }
      setT(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, duration, loop, reduced, recording, compiled.steps]);

  useEffect(() => {
    if (autoPlay && inView) setPlaying(true);
  }, [autoPlay, inView]);

  const seek = useCallback((time: number) => setT(Math.max(0, Math.min(duration, time))), [duration]);
  const togglePlay = () => {
    if (!playing && t >= duration - 1e-3) setT(0);
    setPlaying((p) => !p);
  };
  const stepTo = (index: number) => {
    const s = compiled.steps[Math.max(0, Math.min(compiled.steps.length - 1, index))];
    if (!s) return;
    setPlaying(false);
    // Land at the end of the step's animation, so the step reads complete.
    seek(index < 0 ? 0 : Math.max(s.start, s.end - 0.05));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
    if (event.key === " " && target.tagName !== "BUTTON") togglePlay();
    else if (event.key === "ArrowRight") stepTo(stepIndex + 1);
    else if (event.key === "ArrowLeft") stepTo(t - compiled.steps[stepIndex]!.start > 0.6 ? stepIndex - 1 : stepIndex - 2);
    else if (event.key === "Home") seek(0);
    else if (event.key === "End") seek(duration);
    else if (event.key.toLowerCase() === "f") void fullscreen();
    else return;
    event.preventDefault();
  };

  const fullscreen = async () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await el.requestFullscreen?.().catch(() => {});
  };

  /** Records the scene in real time from a canvas copy of each frame, then downloads it as WebM. */
  const download = async () => {
    const el = svg.current;
    if (!el || recording || typeof MediaRecorder === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const stream = canvas.captureStream(30);
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    setRecording({ progress: 0 });
    setT(0);
    setPlaying(true);
    recorder.start(250);
    const paint = async () => {
      const markup = new XMLSerializer().serializeToString(el);
      const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
    };
    while (tRef.current < duration - 1e-3) {
      await paint();
      setRecording({ progress: tRef.current / duration });
      await new Promise((r) => requestAnimationFrame(r));
    }
    await paint();
    recorder.stop();
    await stopped;
    setRecording(null);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    link.download = `${(scene.title ?? scene.id).replace(/[^\w-]+/g, "-").toLowerCase()}.webm`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  };

  const caption = compiled.steps[stepIndex]?.caption ?? "";
  const frame = renderFrame({ scene, layout, compiled, t, theme: sceneTheme, renderMath: recording ? undefined : renderMath, idPrefix: prefix });

  return (
    <section ref={root} className={cx("mo-player", reduced && "mo-player--reduced")} aria-label={scene.title ?? "Animation"} tabIndex={0} onKeyDown={onKeyDown}>
      {scene.title ? <h3 className="mo-player__title">{scene.title}</h3> : null}
      <div className={cx("mo-stage", layout.canvas.h > layout.canvas.w && "mo-stage--portrait")}>
        <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${scene.title ?? "Animation"}: ${caption}`} className="mo-svg">
          <rect width={W} height={H} fill={sceneTheme.background} />
          {frame}
        </svg>
      </div>
      <p className="mo-visually-hidden" aria-live="polite">
        {caption}
      </p>

      <div className="mo-timeline">
        <input
          type="range"
          className="mo-scrubber"
          min={0}
          max={duration}
          step={0.01}
          value={t}
          disabled={!!recording}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Time"
          aria-valuetext={`${clock(t)} of ${clock(duration)}, step ${stepIndex + 1} of ${compiled.steps.length}`}
        />
        <div className="mo-markers" aria-hidden="true">
          {compiled.steps.slice(1).map((s, i) => (
            <span key={i} style={{ left: `${(s.start / duration) * 100}%` }} />
          ))}
        </div>
      </div>

      <div className="mo-controls">
        <button type="button" className="mo-button" onClick={() => stepTo(stepIndex - 1)} disabled={!!recording || t <= 0} aria-label="Previous step">
          ←
        </button>
        <button type="button" className="mo-button mo-button--primary" onClick={togglePlay} disabled={!!recording} aria-label={playing ? "Pause" : t >= duration - 1e-3 ? "Replay" : "Play"}>
          {playing ? "❚❚" : t >= duration - 1e-3 ? "↺" : "▶"}
        </button>
        <button type="button" className="mo-button" onClick={() => stepTo(stepIndex + 1)} disabled={!!recording || stepIndex >= compiled.steps.length - 1} aria-label="Next step">
          →
        </button>
        <span className="mo-time">
          {clock(t)} / {clock(duration)}
        </span>
        <span className="mo-spacer" />
        <label className="mo-speed">
          <span className="mo-visually-hidden">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])} disabled={!!recording}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        {allowDownload ? (
          <button type="button" className="mo-button mo-button--wide" onClick={() => void download()} disabled={!!recording} aria-label="Download as video">
            {recording ? `Recording ${Math.round(recording.progress * 100)}%` : "⤓ Video"}
          </button>
        ) : null}
        <button type="button" className="mo-button" onClick={() => void fullscreen()} aria-label="Fullscreen">
          ⛶
        </button>
      </div>

      <details className="mo-transcript">
        <summary>Transcript</summary>
        <ol>
          {compiled.steps.map((s, i) =>
            s.caption ? (
              <li key={i} aria-current={i === stepIndex ? "step" : undefined}>
                <button type="button" onClick={() => stepTo(i)}>
                  {s.caption}
                </button>
              </li>
            ) : null,
          )}
        </ol>
      </details>
    </section>
  );
}
