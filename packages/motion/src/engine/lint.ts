import type { Scene, SceneElement } from "../schema.js";
import { pointAlong, type Box } from "./geometry.js";
import { computeLayout, type Layout } from "./layout.js";
import type { MathTypesetter } from "./math.js";
import { captionLayout, UNIT } from "./render.js";
import { compileScene, latest, valueAt, type CompiledScene } from "./timeline.js";

/**
 * Layout problems a viewer would notice, found by replaying the scene to the
 * end of every step: things off the canvas, under the caption, or text on
 * text. Each message says what to change, so a model can fix it.
 */
export interface LayoutIssue {
  step: number;
  elements: string[];
  message: string;
}

const TEXTUAL = new Set(["text", "math", "number"]);
/** Small overhangs (strokes, glyph tails) aren't worth reporting. */
const TOLERANCE = 0.12;

export function lintScene(scene: Scene, options: { math?: MathTypesetter; layout?: Layout; compiled?: CompiledScene } = {}): LayoutIssue[] {
  const layout = options.layout ?? computeLayout(scene, { math: options.math });
  const compiled = options.compiled ?? compileScene(scene, layout);
  const { w: cw, h: ch } = layout.canvas;
  const issues: LayoutIssue[] = [];
  const seen = new Set<string>();
  const report = (step: number, elements: string[], kind: string, message: string) => {
    const key = `${kind}:${elements.join("+")}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ step, elements, message });
  };

  compiled.steps.forEach((step, s) => {
    const t = Math.max(step.start, step.end - 0.01);
    const zoom = valueAt(compiled, "camera", "camZoom", t, 1);
    const cam = [valueAt(compiled, "camera", "camX", t, 0), valueAt(compiled, "camera", "camY", t, 0)] as const;
    const visible: { el: SceneElement; box: Box }[] = [];
    for (const el of scene.elements) {
      if (el.shape === "group") continue;
      const box = screenBox(el, layout, compiled, t);
      if (!box) continue;
      // Into the camera's view, still in units with the origin at the centre.
      visible.push({ el, box: { x: (box.x - cam[0]) * zoom, y: (box.y - cam[1]) * zoom, w: box.w * zoom, h: box.h * zoom } });
    }

    const captionBottom = step.caption ? ch / 2 - captionLayout(step.caption, cw * UNIT, ch * UNIT).bandTop / UNIT : -ch / 2;
    const where = (n: number) => Math.round(n * 10) / 10;
    // Zooming in crops on purpose, so edges and the caption only count at normal zoom or wider.
    const cropping = zoom > 1.05;
    for (const { el, box } of cropping ? [] : visible) {
      const left = box.x - box.w / 2;
      const right = box.x + box.w / 2;
      const top = box.y + box.h / 2;
      const bottom = box.y - box.h / 2;
      const off = [left < -cw / 2 - TOLERANCE && "left", right > cw / 2 + TOLERANCE && "right", top > ch / 2 + TOLERANCE && "top", bottom < -ch / 2 - TOLERANCE && "bottom"].filter(Boolean);
      if (off.length) {
        report(s, [el.id], "off", `Step ${s + 1}: "${el.id}" goes off the ${off.join(" and ")} edge of the canvas (x ${where(left)} to ${where(right)}, y ${where(bottom)} to ${where(top)}; the canvas is x ±${cw / 2}, y ±${ch / 2}${zoom !== 1 ? ` with the camera zoomed out to ${where(zoom)}` : ""}). Move it in or make it smaller.`);
      } else if (step.caption && bottom < captionBottom - TOLERANCE && top > -ch / 2) {
        report(s, [el.id], "caption", `Step ${s + 1}: "${el.id}" runs under the caption (its bottom is at y ${where(bottom)}; keep content above y ${where(captionBottom)}). Move it up or make it smaller.`);
      }
    }

    const words = visible.filter((v) => TEXTUAL.has(v.el.shape));
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = words[i]!;
        const b = words[j]!;
        const overlap = overlapArea(a.box, b.box);
        if (overlap > 0.15 * Math.min(a.box.w * a.box.h, b.box.w * b.box.h)) {
          report(s, [a.el.id, b.el.id], "overlap", `Step ${s + 1}: "${a.el.id}" and "${b.el.id}" overlap. Place one relative to the other (e.g. { "of": "${a.el.id}", "side": "below" }), put them in a column, or fade one out first.`);
        }
      }
    }
  });
  return issues;
}

/** Where an element is at time t, in scene units, or nothing if it's invisible. Rotation is ignored (boxes only). */
function screenBox(el: SceneElement, layout: Layout, compiled: CompiledScene, t: number): Box | undefined {
  const base = layout.boxes.get(el.id);
  if (!base || (base.w === 0 && base.h === 0)) return undefined;
  let opacity = 1;
  let box: Box = { ...base };
  // The element's own motion, then each enclosing group's, as the renderer applies them.
  for (let id: string | undefined = el.id; id; id = layout.parent.get(id)) {
    const node = layout.byId.get(id);
    const origin = layout.boxes.get(id) ?? base;
    opacity *= valueAt(compiled, id, "opacity", t, node?.hidden ? 0 : (node?.opacity ?? 1));
    const scale = valueAt(compiled, id, "scale", t, node?.scale ?? 1);
    let dx = valueAt(compiled, id, "dx", t, 0);
    let dy = valueAt(compiled, id, "dy", t, 0);
    const along = latest(compiled.alongPath.get(id), t);
    const path = along && layout.outlines.get(along.path);
    if (path) {
      const p = pointAlong(path.points.filter((q) => Number.isFinite(q[0])), valueAt(compiled, id, "along", t, 0), path.closed);
      dx = p[0] - origin.x;
      dy = p[1] - origin.y;
    }
    box = { x: origin.x + (box.x - origin.x) * scale + dx, y: origin.y + (box.y - origin.y) * scale + dy, w: box.w * scale, h: box.h * scale };
  }
  return opacity > 0.05 ? box : undefined;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const h = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return w > 0 && h > 0 ? w * h : 0;
}
