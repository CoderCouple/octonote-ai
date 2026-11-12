import type { Scene, SceneAction, SceneElement } from "../schema.js";
import { clamp01, EASINGS, lerp, type Easing } from "./easing.js";
import type { Layout } from "./layout.js";
import type { Point } from "./geometry.js";

/**
 * The scene compiled into tracks: every animated property of every element is
 * a list of tweens with absolute start times. `stateAt(t)` is then a pure
 * function of time, so playing, scrubbing, stepping and exporting all agree.
 */
export type Prop = "opacity" | "dx" | "dy" | "scale" | "rotate" | "draw" | "reveal" | "pulse" | "outline" | "flash" | "morph" | "along" | "value" | "colorMix" | "camX" | "camY" | "camZoom";

export interface Tween {
  start: number;
  duration: number;
  from: number;
  to: number;
  ease: Easing;
}

export interface Track {
  initial: number;
  tweens: Tween[];
}

export interface CompiledScene {
  duration: number;
  /** Where each step starts and ends, for the scrubber and captions. */
  steps: { start: number; end: number; caption?: string }[];
  tracks: Map<string, Track>;
  /** Morph target, trace path and colour target per element (the latest set before a time wins). */
  morphTarget: Map<string, { start: number; into: string }[]>;
  alongPath: Map<string, { start: number; path: string }[]>;
  colorTarget: Map<string, { start: number; from: string | undefined; to: string }[]>;
}

const DEFAULTS: Partial<Record<SceneAction["do"], number>> = {
  show: 0.3,
  hide: 0.3,
  fadeIn: 0.6,
  fadeOut: 0.5,
  draw: 1.2,
  write: 1,
  grow: 0.6,
  move: 0.9,
  scale: 0.6,
  rotate: 0.9,
  color: 0.5,
  morph: 1.2,
  trace: 2,
  indicate: 0.7,
  circumscribe: 1.2,
  flash: 0.6,
  count: 1.2,
  camera: 1.2,
};

const key = (id: string, prop: Prop) => `${id}.${prop}`;
const ease0 = (ease: string | undefined): Easing => (ease ?? "smooth") as Easing;

/** Text writes at a reading pace: longer text takes longer, within reason. */
function writeDuration(el: SceneElement | undefined): number {
  const length = el?.shape === "text" ? el.text.length : el?.shape === "math" ? el.tex.length : 10;
  return Math.min(2.5, Math.max(0.6, length * 0.045));
}

export function compileScene(scene: Scene, layout: Layout): CompiledScene {
  const tracks = new Map<string, Track>();
  const settled = new Map<string, number>();
  const morphTarget = new Map<string, { start: number; into: string }[]>();
  const alongPath = new Map<string, { start: number; path: string }[]>();
  const colorTarget = new Map<string, { start: number; from: string | undefined; to: string }[]>();
  const currentColor = new Map<string, string | undefined>();

  const track = (id: string, prop: Prop, initial: number) => {
    const k = key(id, prop);
    let t = tracks.get(k);
    if (!t) {
      t = { initial, tweens: [] };
      tracks.set(k, t);
      settled.set(k, initial);
    }
    return t;
  };
  const initialOf = (id: string, prop: Prop): number => {
    const el = layout.byId.get(id);
    switch (prop) {
      case "opacity":
        return el?.hidden ? 0 : (el?.opacity ?? 1);
      case "scale":
        return el?.scale ?? 1;
      case "rotate":
        return el?.rotate ?? 0;
      case "draw":
      case "reveal":
        return el?.hidden ? 0 : 1;
      case "value":
        return el?.shape === "number" ? el.value : 0;
      case "camZoom":
        return 1;
      default:
        return 0;
    }
  };
  /** Adds a tween from wherever the property was left, to `to`. */
  const tween = (id: string, prop: Prop, start: number, duration: number, to: number, ease: Easing = "smooth", from?: number) => {
    const t = track(id, prop, initialOf(id, prop));
    const k = key(id, prop);
    t.tweens.push({ start, duration: Math.max(0, duration), from: from ?? settled.get(k)!, to, ease });
    settled.set(k, to);
  };
  const set = (id: string, prop: Prop, at: number, value: number) => tween(id, prop, at, 0, value, "linear");

  // Animating a group's appearance animates its children's; moving or scaling it moves the whole group.
  const expand = (id: string): string[] => {
    const el = layout.byId.get(id);
    // The group itself too, so a hidden group becomes visible along with its children.
    return el?.shape === "group" ? [id, ...el.children.flatMap(expand)] : [id];
  };

  const centerOf = (id: string): Point => {
    const b = layout.boxes.get(id);
    return b ? [b.x, b.y] : [0, 0];
  };

  let time = 0;
  const steps: CompiledScene["steps"] = [];

  for (const step of scene.steps) {
    const stepStart = time;
    let cursor = stepStart;
    let stepEnd = stepStart;

    for (const action of step.actions) {
      const begin = (step.sequential ? cursor : stepStart) + ("delay" in action ? (action.delay ?? 0) : 0);
      if (action.do === "wait") {
        const end = begin + action.duration;
        stepEnd = Math.max(stepEnd, end);
        if (step.sequential) cursor = end;
        continue;
      }
      const ease = (action.ease ?? (action.do === "write" || action.do === "trace" ? "linear" : "smooth")) as Easing;
      if (action.do === "camera") {
        const d = action.duration ?? DEFAULTS.camera!;
        const focus = typeof action.focus === "string" ? centerOf(action.focus) : (action.focus as Point | undefined);
        if (focus) {
          tween("camera", "camX", begin, d, focus[0], ease0(action.ease));
          tween("camera", "camY", begin, d, focus[1], ease0(action.ease));
        }
        if (action.zoom) tween("camera", "camZoom", begin, d, action.zoom, ease0(action.ease));
        stepEnd = Math.max(stepEnd, begin + d);
        if (step.sequential) cursor = begin + d;
        continue;
      }
      const ids = Array.isArray(action.target) ? action.target : [action.target];
      const appearance = ["show", "hide", "fadeIn", "fadeOut", "draw", "write", "grow", "indicate", "flash", "circumscribe", "color"].includes(action.do);
      const targets = appearance ? ids.flatMap(expand) : ids;
      const stagger = action.stagger ?? (targets.length > 1 && appearance ? 0.12 : 0);
      let actionEnd = begin;

      targets.forEach((id, i) => {
        const el = layout.byId.get(id);
        const s = begin + i * stagger;
        const d = action.duration ?? (action.do === "write" ? writeDuration(el) : (DEFAULTS[action.do] ?? 0.6));
        switch (action.do) {
          case "show":
            tween(id, "opacity", s, d, el?.opacity ?? 1);
            set(id, "draw", s, 1);
            set(id, "reveal", s, 1);
            break;
          case "hide":
          case "fadeOut":
            tween(id, "opacity", s, d, 0);
            break;
          case "fadeIn": {
            const shift: Record<string, Point> = { up: [0, -0.4], down: [0, 0.4], left: [0.4, 0], right: [-0.4, 0] };
            const [sx, sy] = shift[action.from ?? "up"]!;
            const dx = tracks.get(key(id, "dx")) ? settled.get(key(id, "dx"))! : 0;
            const dy = tracks.get(key(id, "dy")) ? settled.get(key(id, "dy"))! : 0;
            set(id, "draw", s, 1);
            set(id, "reveal", s, 1);
            const fade = (action.ease ?? "out") as Easing;
            tween(id, "opacity", s, d, el?.opacity ?? 1, fade, 0);
            tween(id, "dx", s, d, dx, fade, dx + sx);
            tween(id, "dy", s, d, dy, fade, dy + sy);
            break;
          }
          case "draw":
            set(id, "opacity", s, el?.opacity ?? 1);
            set(id, "reveal", s, 1);
            tween(id, "draw", s, d, 1, ease, 0);
            break;
          case "write":
            set(id, "opacity", s, el?.opacity ?? 1);
            set(id, "draw", s, 1);
            tween(id, "reveal", s, d, 1, ease, 0);
            break;
          case "grow":
            set(id, "opacity", s, el?.opacity ?? 1);
            set(id, "draw", s, 1);
            set(id, "reveal", s, 1);
            tween(id, "scale", s, d, el?.scale ?? 1, "back", 0);
            break;
          case "move": {
            let dx: number;
            let dy: number;
            if (action.by) {
              dx = (settled.get(key(id, "dx")) ?? 0) + action.by[0];
              dy = (settled.get(key(id, "dy")) ?? 0) + action.by[1];
            } else {
              const [cx, cy] = centerOf(id);
              const [tx, ty] = resolveTarget(action.to!, layout, id);
              dx = tx - cx;
              dy = ty - cy;
            }
            tween(id, "dx", s, d, dx, ease);
            tween(id, "dy", s, d, dy, ease);
            break;
          }
          case "scale":
            tween(id, "scale", s, d, action.to, ease);
            break;
          case "rotate":
            tween(id, "rotate", s, d, (settled.get(key(id, "rotate")) ?? initialOf(id, "rotate")) + action.by, ease);
            break;
          case "color": {
            const list = colorTarget.get(id) ?? [];
            list.push({ start: s, from: currentColor.has(id) ? currentColor.get(id) : el?.color, to: action.to });
            colorTarget.set(id, list);
            currentColor.set(id, action.to);
            tween(id, "colorMix", s, d, 1, ease, 0);
            break;
          }
          case "morph": {
            const list = morphTarget.get(id) ?? [];
            list.push({ start: s, into: action.into });
            morphTarget.set(id, list);
            tween(id, "morph", s, d, 1, ease, 0);
            break;
          }
          case "trace": {
            const list = alongPath.get(id) ?? [];
            list.push({ start: s, path: action.along });
            alongPath.set(id, list);
            set(id, "opacity", s, el?.opacity ?? 1);
            set(id, "draw", s, 1);
            set(id, "reveal", s, 1);
            tween(id, "along", s, d, 1, ease, 0);
            break;
          }
          case "indicate":
            tween(id, "pulse", s, d, 1, "linear", 0);
            set(id, "pulse", s + d, 0);
            break;
          case "flash":
            tween(id, "flash", s, d, 1, "linear", 0);
            set(id, "flash", s + d, 0);
            break;
          case "circumscribe":
            tween(id, "outline", s, d, 1, "linear", 0);
            set(id, "outline", s + d, 0);
            break;
          case "count":
            tween(id, "value", s, d, action.to, ease);
            break;
        }
        actionEnd = Math.max(actionEnd, s + d);
      });
      stepEnd = Math.max(stepEnd, actionEnd);
      if (step.sequential) cursor = actionEnd;
    }
    const end = stepEnd + (step.hold ?? 1);
    steps.push({ start: stepStart, end, caption: step.caption });
    time = end;
  }

  return { duration: time, steps, tracks, morphTarget, alongPath, colorTarget };
}

function resolveTarget(to: NonNullable<Extract<SceneAction, { do: "move" }>["to"]>, layout: Layout, self: string): Point {
  if (Array.isArray(to)) return [to[0], to[1]];
  if ("of" in to) {
    const other = layout.boxes.get(to.of);
    const me = layout.boxes.get(self);
    if (!other || !me) return [0, 0];
    const gap = to.gap ?? 0.3;
    switch (to.side ?? "center") {
      case "above":
        return [other.x, other.y + other.h / 2 + gap + me.h / 2];
      case "below":
        return [other.x, other.y - other.h / 2 - gap - me.h / 2];
      case "left":
        return [other.x - other.w / 2 - gap - me.w / 2, other.y];
      case "right":
        return [other.x + other.w / 2 + gap + me.w / 2, other.y];
      default:
        return [other.x, other.y];
    }
  }
  const frame = layout.axes.get(to.axes);
  if (!frame) return [0, 0];
  return frame.toCanvas(to.x, to.y ?? 0);
}

/** A property's value at time t. */
export function valueAt(compiled: CompiledScene, id: string, prop: Prop, t: number, fallback: number): number {
  const track = compiled.tracks.get(key(id, prop));
  if (!track) return fallback;
  let value = track.initial;
  for (const tw of track.tweens) {
    if (t < tw.start) break;
    const p = tw.duration ? clamp01((t - tw.start) / tw.duration) : 1;
    value = lerp(tw.from, tw.to, EASINGS[tw.ease](p));
  }
  return value;
}

/** The latest entry that has started by time t. */
export function latest<T extends { start: number }>(list: T[] | undefined, t: number): T | undefined {
  let found: T | undefined;
  for (const item of list ?? []) if (item.start <= t) found = item;
  return found;
}
