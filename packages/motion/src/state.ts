import type { Scene, SceneColor, SceneElement } from "./schema.js";

export const DEFAULT_SIZE = { width: 800, height: 450 } as const;
export const DEFAULT_STEP_MS = 2400;

export interface ElementState {
  visible: boolean;
  x: number;
  y: number;
  color?: SceneColor;
  text?: string;
  value?: number;
  /** Pulsing because the current step highlights it. */
  highlighted: boolean;
}

export type SceneState = Record<string, ElementState>;

function initial(el: SceneElement): ElementState {
  const position = "x" in el ? { x: el.x, y: el.y } : { x: 0, y: 0 };
  return {
    visible: !el.hidden,
    ...position,
    color: el.color,
    text: "text" in el ? el.text : undefined,
    value: el.kind === "counter" ? el.value : undefined,
    highlighted: false,
  };
}

/**
 * What every element looks like at a step: the starting state with every
 * action up to and including that step applied. Pure, so any step can be shown
 * directly (scrubbing, going back) and the renderer animates the difference.
 * Step -1 is the scene before anything happens.
 */
export function sceneStateAt(scene: Scene, stepIndex: number): SceneState {
  const state: SceneState = Object.fromEntries(scene.elements.map((el) => [el.id, initial(el)]));
  const last = Math.min(stepIndex, scene.steps.length - 1);
  for (let s = 0; s <= last; s++) {
    for (const action of scene.steps[s]!.actions) {
      const el = state[action.target];
      if (!el) continue;
      switch (action.do) {
        case "show":
          el.visible = true;
          break;
        case "hide":
          el.visible = false;
          break;
        case "move":
          el.x = action.x;
          el.y = action.y;
          break;
        case "color":
          el.color = action.color;
          break;
        case "count":
          el.value = action.value;
          break;
        case "text":
          el.text = action.text;
          break;
        case "highlight":
          // Highlights only last for their own step; a highlighted element is shown.
          if (s === last) el.highlighted = true;
          el.visible = true;
          break;
      }
    }
  }
  return state;
}

export interface Point {
  x: number;
  y: number;
}

/** Where a line from a shape's centre towards `toward` leaves the shape. */
function edgePoint(el: SceneElement, at: ElementState, toward: Point): Point {
  if (el.kind === "circle") {
    const dx = toward.x - at.x;
    const dy = toward.y - at.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: at.x + (dx / length) * el.r, y: at.y + (dy / length) * el.r };
  }
  if (el.kind === "box") {
    const cx = at.x + el.w / 2;
    const cy = at.y + el.h / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    // Scale the direction so it just touches the nearer pair of sides.
    const scale = Math.min(dx ? el.w / 2 / Math.abs(dx) : Infinity, dy ? el.h / 2 / Math.abs(dy) : Infinity);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
  return { x: at.x, y: at.y };
}

export function centreOf(el: SceneElement, at: ElementState): Point {
  return el.kind === "box" ? { x: at.x + el.w / 2, y: at.y + el.h / 2 } : { x: at.x, y: at.y };
}

/** The visible segment of an arrow between its two shapes, with a gap for the arrowhead. */
export function arrowEnds(from: SceneElement, fromAt: ElementState, to: SceneElement, toAt: ElementState, gap = 4): { start: Point; end: Point } {
  const start = edgePoint(from, fromAt, centreOf(to, toAt));
  const end = edgePoint(to, toAt, centreOf(from, fromAt));
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return { start: { x: start.x + (dx / length) * gap, y: start.y + (dy / length) * gap }, end: { x: end.x - (dx / length) * gap, y: end.y - (dy / length) * gap } };
}
