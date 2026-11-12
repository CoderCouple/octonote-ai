import type { ReactNode } from "react";
import type { MathTypesetter } from "./math.js";
import type { Scene, SceneElement } from "../schema.js";
import { mixRgb, PALETTE_NAMES, resolveColor, rgbCss, type Rgb, type SceneTheme } from "./color.js";
import { clamp01, EASINGS } from "./easing.js";
import { morphPoints, pointAlong, rotatePoint, type Box, type Point } from "./geometry.js";
import { TEXT_SIZE, type Layout } from "./layout.js";
import { latest, valueAt, type CompiledScene } from "./timeline.js";

export const UNIT = 100;

export interface FrameOptions {
  scene: Scene;
  layout: Layout;
  compiled: CompiledScene;
  t: number;
  theme: SceneTheme;
  /** Renders TeX (e.g. KaTeX to HTML). Without it, formulas show as readable text. */
  /** Typesets TeX as vector paths. Without it, formulas show as readable text. */
  math?: MathTypesetter;
  /** Burn the current caption into the frame (used for export, and on by default). */
  captions?: boolean;
  /** Prefix for clip-path ids, so several players on one page don't collide. */
  idPrefix?: string;
}

/** TeX as readable Unicode, for when no math renderer is available. */
export function texToText(tex: string): string {
  const map: Record<string, string> = {
    pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", lambda: "λ", mu: "μ", sigma: "σ", Sigma: "Σ", omega: "ω", phi: "φ",
    times: "×", cdot: "·", div: "÷", pm: "±", leq: "≤", geq: "≥", neq: "≠", approx: "≈", infty: "∞", to: "→", rightarrow: "→", sum: "Σ", int: "∫", partial: "∂", circ: "°", degree: "°",
  };
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", n: "ⁿ", "+": "⁺", "-": "⁻", x: "ˣ", t: "ᵗ", i: "ⁱ" };
  const sub: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", n: "ₙ", i: "ᵢ", x: "ₓ" };
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a: string, b: string) => FRACTIONS[`${a}/${b}`] ?? (/^\w+$/.test(a) && /^\w+$/.test(b) ? `${a}/${b}` : `(${a})/(${b})`))
    .replace(/\\(sin|cos|tan|log|ln|exp|max|min|lim)(?![A-Za-z])/g, "$1 ")
    .replace(/\\ /g, " ")
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\left|\\right|\\,|\\;|\\!|\\quad/g, " ")
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => map[name] ?? name)
    .replace(/\^\{([^{}]*)\}|\^(.)/g, (m, group: string | undefined, one: string | undefined) => {
      const s = group ?? one ?? "";
      return [...s].every((c) => sup[c]) ? [...s].map((c) => sup[c]).join("") : `^${s}`;
    })
    .replace(/_\{([^{}]*)\}|_(.)/g, (m, group: string | undefined, one: string | undefined) => {
      const s = group ?? one ?? "";
      return [...s].every((c) => sub[c]) ? [...s].map((c) => sub[c]).join("") : `_${s}`;
    })
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FRACTIONS: Record<string, string> = { "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "1/8": "⅛" };

interface Transform {
  dx: number;
  dy: number;
  scale: number;
  rotate: number;
  opacity: number;
  center: Point;
}

const OUTLINE_SHAPES = new Set(["rect", "circle", "ellipse", "dot", "polygon", "arc", "curve", "brace", "line", "arrow", "plot"]);

/** One frame of the scene at time t, as SVG children in a 1600×900 (or 900×1600) viewBox. */
export function renderFrame({ scene, layout, compiled, t, theme, math, captions = true, idPrefix = "mo" }: FrameOptions): ReactNode {
  const W = layout.canvas.w * UNIT;
  const H = layout.canvas.h * UNIT;
  const cam = { x: valueAt(compiled, "camera", "camX", t, 0), y: valueAt(compiled, "camera", "camY", t, 0), zoom: valueAt(compiled, "camera", "camZoom", t, 1) };
  const k = UNIT * cam.zoom;
  const toPx = ([x, y]: Point): Point => [(x - cam.x) * k + W / 2, H / 2 - (y - cam.y) * k];

  const v = (id: string, prop: Parameters<typeof valueAt>[2], fallback: number) => valueAt(compiled, id, prop, t, fallback);

  const ownTransform = (el: SceneElement): Transform => {
    const box = layout.boxes.get(el.id) ?? { x: 0, y: 0, w: 0, h: 0 };
    let dx = v(el.id, "dx", 0);
    let dy = v(el.id, "dy", 0);
    // A traced element rides its path.
    const along = latest(compiled.alongPath.get(el.id), t);
    if (along) {
      const path = layout.outlines.get(along.path);
      if (path) {
        const p = pointAlong(path.points.filter((q) => Number.isFinite(q[0])), v(el.id, "along", 0), path.closed);
        dx = p[0] - box.x;
        dy = p[1] - box.y;
      }
    }
    const pulse = EASINGS.there_and_back(v(el.id, "pulse", 0));
    return {
      dx,
      dy,
      scale: v(el.id, "scale", el.scale ?? 1) * (1 + 0.18 * pulse),
      rotate: v(el.id, "rotate", el.rotate ?? 0) - (el.rotate ?? 0),
      opacity: v(el.id, "opacity", el.hidden ? 0 : (el.opacity ?? 1)),
      center: [box.x, box.y],
    };
  };

  const chain = (el: SceneElement): Transform[] => {
    const list = [ownTransform(el)];
    for (let p = layout.parent.get(el.id); p; p = layout.parent.get(p)) {
      const g = layout.byId.get(p);
      if (g) list.push(ownTransform(g));
    }
    return list;
  };

  /** Scene point → pixels, through the element's and its groups' scale, rotation and offset. */
  const transformer = (transforms: Transform[]) => (p: Point): Point => {
    let q = p;
    for (const tr of transforms) {
      q = [tr.center[0] + (q[0] - tr.center[0]) * tr.scale, tr.center[1] + (q[1] - tr.center[1]) * tr.scale];
      q = rotatePoint(q, tr.center, tr.rotate);
      q = [q[0] + tr.dx, q[1] + tr.dy];
    }
    return toPx(q);
  };

  const colorOf = (el: SceneElement, fallback: Parameters<typeof resolveColor>[2] = "ink"): Rgb => {
    let c = resolveColor(el.color, theme, fallback);
    const change = latest(compiled.colorTarget.get(el.id), t);
    if (change) {
      const from = resolveColor(change.from, theme, fallback);
      c = mixRgb(from, resolveColor(change.to, theme, fallback), v(el.id, "colorMix", 0));
    }
    const pulse = EASINGS.there_and_back(v(el.id, "pulse", 0));
    if (pulse) c = mixRgb(c, resolveColor("yellow", theme), pulse * 0.7);
    const flash = EASINGS.there_and_back(v(el.id, "flash", 0));
    if (flash) c = mixRgb(c, [255, 255, 255], flash * 0.8);
    return c;
  };

  const pathD = (points: Point[], closed: boolean): string => {
    let d = "";
    let pen = false;
    for (const p of points) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
      pen = true;
    }
    return closed && d ? `${d}Z` : d.trim();
  };

  const nodes: ReactNode[] = [];
  const strokePx = (el: SceneElement) => (el.stroke ?? 0.04) * k;

  for (const el of scene.elements) {
    if (el.shape === "plot" || el.shape === "group") {
      if (el.shape === "group") {
        // Groups draw nothing themselves, except a circumscribe outline.
        const outline = v(el.id, "outline", 0);
        if (outline > 0) nodes.push(circumscribeNode(el.id, layout.boxes.get(el.id)!, outline, transformer(chain(el)), theme, k));
        continue;
      }
    }
    const transforms = chain(el);
    const opacity = transforms.reduce((o, tr) => o * tr.opacity, 1);
    if (opacity <= 0.002) continue;
    const tx = transformer(transforms);
    const color = colorOf(el, el.shape === "plot" ? "yellow" : el.shape === "axes" || el.shape === "numberline" || el.shape === "grid" ? "muted" : el.shape === "dot" ? "ink" : "blue");
    const draw = clamp01(v(el.id, "draw", el.hidden ? 0 : 1));
    const reveal = clamp01(v(el.id, "reveal", el.hidden ? 0 : 1));
    const box = layout.boxes.get(el.id) ?? { x: 0, y: 0, w: 0, h: 0 };
    const sw = strokePx(el);
    const items: ReactNode[] = [];

    if (OUTLINE_SHAPES.has(el.shape)) {
      const own = layout.outlines.get(el.id);
      if (own) {
        // Plots keep their breaks (NaN points) where the curve leaves the axes.
        let points = el.shape === "plot" ? (layout.plots.get(el.id) ?? own.points) : own.points;
        let closed = own.closed;
        const morph = latest(compiled.morphTarget.get(el.id), t);
        if (morph) {
          const target = layout.outlines.get(morph.into);
          const p = v(el.id, "morph", 0);
          if (target && p > 0) {
            closed = p < 0.5 ? own.closed : target.closed;
            points = morphPoints(own.points.filter((q) => Number.isFinite(q[0])), target.points.filter((q) => Number.isFinite(q[0])), p, own.closed && target.closed);
          }
        }
        const px = points.map((p) => (Number.isFinite(p[0]) ? tx(p) : ([NaN, NaN] as Point)));
        const d = pathD(px, closed);
        const fill = el.shape === "dot" ? (el.fill === false ? null : resolveFill(el.fill ?? true, color, theme, 1)) : resolveFill(el.fill, color, theme);
        const fillOpacity = clamp01((draw - 0.55) / 0.45);
        const dashed = el.shape === "arrow" && el.dashed;
        items.push(
          <path
            key="shape"
            d={d}
            pathLength={dashed ? undefined : 1}
            fill={fill && closed ? rgbCss(fill.rgb, fill.alpha * fillOpacity) : "none"}
            stroke={rgbCss(color)}
            strokeWidth={el.shape === "dot" ? 0 : sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashed ? `${sw * 3} ${sw * 2.5}` : "1"}
            strokeDashoffset={dashed ? 0 : 1 - draw}
          />,
        );
        if (el.shape === "arrow" && draw > 0.85 && px.length >= 2) {
          const tip = px.at(-1)!;
          const back = px.at(-2)!;
          const ang = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
          const size = Math.max(10, sw * 4.5);
          const head = (da: number): Point => [tip[0] - size * Math.cos(ang + da), tip[1] - size * Math.sin(ang + da)];
          const h1 = head(0.45);
          const h2 = head(-0.45);
          items.push(<path key="head" d={`M${tip[0]} ${tip[1]} L${h1[0]} ${h1[1]} L${h2[0]} ${h2[1]} Z`} fill={rgbCss(color, clamp01((draw - 0.85) / 0.15))} />);
        }
      }
      const label = "label" in el ? el.label : undefined;
      if (label) {
        const at = el.shape === "dot" ? tx([box.x, box.y + box.h / 2 + 0.3]) : el.shape === "arrow" || el.shape === "brace" ? labelForLine(el, layout, tx) : tx([box.x, box.y]);
        items.push(textNode("label", label, at, TEXT_SIZE * 0.85 * k, resolveColor("ink", theme), clamp01((draw - 0.5) / 0.5), false));
      }
    } else if (el.shape === "text" || el.shape === "math" || el.shape === "number") {
      const center = tx([box.x, box.y]);
      const scale = transforms.reduce((s, tr) => s * tr.scale, 1);
      const size = ((el.shape === "number" ? el.size ?? 0.8 : el.shape === "math" ? el.size ?? 0.55 : el.size ?? TEXT_SIZE) * k) * scale;
      const textColor = el.color ? color : resolveColor("ink", theme);
      const clip = `${idPrefix}-${el.id}-clip`;
      const width = box.w * k * scale * 1.15;
      if (reveal < 1) {
        items.push(
          <clipPath key="clip" id={clip}>
            <rect x={center[0] - width / 2} y={center[1] - box.h * k * scale} width={width * reveal} height={box.h * k * scale * 2} />
          </clipPath>,
        );
      }
      let content: ReactNode;
      const typeset = el.shape === "math" ? math?.typeset(el.tex) : undefined;
      if (typeset && !("error" in typeset)) {
        // MathJax paths, scaled so one em is the font size, centred on the element.
        const w = typeset.width * size;
        const h = typeset.height * size;
        content = (
          <svg
            x={center[0] - w / 2}
            y={center[1] - h / 2}
            width={w}
            height={h}
            viewBox={typeset.viewBox.join(" ")}
            overflow="visible"
            color={rgbCss(textColor)}
            dangerouslySetInnerHTML={{ __html: paletteColors(typeset.body, theme) }}
          />
        );
      } else {
        const shown =
          el.shape === "text"
            ? el.text
            : el.shape === "math"
              ? texToText(el.tex)
              : `${el.prefix ?? ""}${v(el.id, "value", el.value).toLocaleString(undefined, { minimumFractionDigits: el.decimals ?? 0, maximumFractionDigits: el.decimals ?? 0 })}${el.suffix ?? ""}`;
        content = textNode("text", shown, center, size, textColor, 1, el.shape === "math", el.shape === "number" || (el.shape === "text" && el.weight === "bold"));
      }
      items.push(
        <g key="body" clipPath={reveal < 1 ? `url(#${clip})` : undefined}>
          {content}
        </g>,
      );
    } else if (el.shape === "axes") {
      items.push(...axesNodes(el, layout, tx, color, theme, draw, sw, k));
    } else if (el.shape === "numberline") {
      items.push(...numberLineNodes(el, box, tx, color, theme, draw, sw, k));
    } else if (el.shape === "bars") {
      items.push(...barNodes(el, box, tx, theme, draw, k, el.color));
    } else if (el.shape === "table") {
      items.push(...tableNodes(el, box, tx, color, theme, draw, sw, k));
    } else if (el.shape === "grid") {
      const cell = el.cell ?? 0.5;
      const x0 = box.x - box.w / 2;
      const y0 = box.y - box.h / 2;
      // Lines start one after another across the first 40% of the draw, and all finish together.
      const line = (i: number, n: number) => clamp01((draw - 0.4 * (i / n)) / 0.6);
      for (let i = 0; i <= el.cols; i++) items.push(lineNode(`v${i}`, tx([x0 + i * cell, y0]), tx([x0 + i * cell, y0 + box.h]), color, sw * 0.6, line(i, el.cols)));
      for (let j = 0; j <= el.rows; j++) items.push(lineNode(`h${j}`, tx([x0, y0 + j * cell]), tx([x0 + box.w, y0 + j * cell]), color, sw * 0.6, line(j, el.rows)));
    }

    const outline = v(el.id, "outline", 0);
    if (outline > 0) items.push(circumscribeNode("circ", box, outline, tx, theme, k));

    nodes.push(
      <g key={el.id} opacity={opacity}>
        {items}
      </g>,
    );
  }

  if (captions) {
    const step = compiled.steps.find((s) => t >= s.start && t < s.end) ?? (t >= compiled.duration ? compiled.steps.at(-1) : undefined);
    if (step?.caption) {
      // Fade in as the step starts; stay readable until the next caption replaces it.
      const alpha = clamp01((t - step.start) / 0.25);
      nodes.push(captionNode(step.caption, W, H, theme, alpha));
    }
  }

  return nodes;
}

function resolveFill(fill: SceneElement["fill"], color: Rgb, theme: SceneTheme, alphaWhenTrue = 0.2): { rgb: Rgb; alpha: number } | null {
  if (!fill) return null;
  if (fill === true) return { rgb: color, alpha: alphaWhenTrue };
  return { rgb: resolveColor(fill, theme), alpha: 0.85 };
}

function textNode(key: string, text: string, at: Point, size: number, color: Rgb, alpha: number, serif = false, bold = false): ReactNode {
  return (
    <text
      key={key}
      x={at[0]}
      y={at[1]}
      textAnchor="middle"
      dominantBaseline="central"
      fill={rgbCss(color, alpha)}
      fontSize={size}
      fontFamily={serif ? "'Latin Modern Math', 'STIX Two Math', 'Cambria Math', Georgia, serif" : "Inter, 'Helvetica Neue', Arial, sans-serif"}
      fontStyle={serif ? "italic" : undefined}
      fontWeight={bold ? 700 : 500}
    >
      {text}
    </text>
  );
}

function lineNode(key: string, a: Point, b: Point, color: Rgb, width: number, draw: number): ReactNode {
  return <path key={key} d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} pathLength={1} stroke={rgbCss(color)} strokeWidth={width} strokeDasharray="1" strokeDashoffset={1 - clamp01(draw)} strokeLinecap="round" fill="none" />;
}

function labelForLine(el: SceneElement, layout: Layout, tx: (p: Point) => Point): Point {
  const outline = layout.outlines.get(el.id);
  if (!outline || outline.points.length < 2) return tx([0, 0]);
  const a = outline.points[0]!;
  const b = outline.points.at(-1)!;
  const mid: Point = el.shape === "brace" ? outline.points[Math.floor(outline.points.length / 2)]! : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Off to the side the brace bulges towards (or above an arrow).
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const off = el.shape === "brace" ? 0.45 : 0.3;
  return tx([mid[0] - (dy / len) * off, mid[1] + (dx / len) * off]);
}

function circumscribeNode(key: string, box: Box, value: number, tx: (p: Point) => Point, theme: SceneTheme, k: number): ReactNode {
  const pad = 0.18;
  const a = tx([box.x - box.w / 2 - pad, box.y + box.h / 2 + pad]);
  const b = tx([box.x + box.w / 2 + pad, box.y - box.h / 2 - pad]);
  const draw = clamp01(value * 2);
  const alpha = value < 0.5 ? 1 : clamp01((1 - value) * 2);
  return (
    <rect
      key={key}
      x={Math.min(a[0], b[0])}
      y={Math.min(a[1], b[1])}
      width={Math.abs(b[0] - a[0])}
      height={Math.abs(b[1] - a[1])}
      rx={0.12 * k}
      pathLength={1}
      fill="none"
      stroke={rgbCss(resolveColor("yellow", theme), alpha)}
      strokeWidth={0.05 * k}
      strokeDasharray="1"
      strokeDashoffset={1 - draw}
    />
  );
}

/** \\color{orange} in TeX means the scene's orange, so formulas match the shapes they talk about. */
function paletteColors(body: string, theme: SceneTheme): string {
  return body.replace(/(fill|stroke)="([a-z]+)"/g, (whole, attr: string, name: string) => ((PALETTE_NAMES as readonly string[]).includes(name) ? `${attr}="${rgbCss(resolveColor(name, theme))}"` : whole));
}

/** How a caption is wrapped and where its band starts, in pixels from the top. Shared with the layout linter. */
export function captionLayout(caption: string, W: number, H: number) {
  const size = Math.max(W, H) * (W > H ? 0.026 : 0.022);
  const maxChars = Math.floor((W * 0.86) / (size * 0.52));
  const lines: string[] = [];
  let line = "";
  for (const word of caption.split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const lineHeight = size * 1.3;
  const top = H - size * 1.2 - lineHeight * shown.length;
  // The band, including its feathered edge, starts here.
  return { size, lines: shown, lineHeight, top, bandTop: top - size * 1.4 };
}

function captionNode(caption: string, W: number, H: number, theme: SceneTheme, alpha: number): ReactNode {
  const { size, lines: shown, lineHeight, top } = captionLayout(caption, W, H);
  return (
    <g key="caption" opacity={alpha}>
      {/* Near-solid behind the words, feathered above them, so drawings never show through the text. */}
      <rect x={0} y={top - size * 1.4} width={W} height={size * 0.8} fill={theme.background} opacity={0.5} />
      <rect x={0} y={top - size * 0.6} width={W} height={H - top + size * 0.6} fill={theme.background} opacity={0.95} />
      {shown.map((l, i) => (
        <text key={i} x={W / 2} y={top + lineHeight * (i + 0.6)} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={500} fontFamily="Inter, 'Helvetica Neue', Arial, sans-serif" fill={rgbCss(resolveColor("ink", theme))}>
          {l}
        </text>
      ))}
    </g>
  );
}

function niceStep(step: number) {
  return step > 0 ? step : 1;
}

function axesNodes(el: Extract<SceneElement, { shape: "axes" }>, layout: Layout, tx: (p: Point) => Point, color: Rgb, theme: SceneTheme, draw: number, sw: number, k: number): ReactNode[] {
  const frame = layout.axes.get(el.id);
  if (!frame) return [];
  const out: ReactNode[] = [];
  const [x0, x1, xs] = el.x;
  const [y0, y1, ys] = el.y;
  const xAxisY = y0 <= 0 && y1 >= 0 ? 0 : y0;
  const yAxisX = x0 <= 0 && x1 >= 0 ? 0 : x0;
  const c = (x: number, y: number) => tx(frame.toCanvas(x, y));
  out.push(lineNode("x", c(x0, xAxisY), c(x1, xAxisY), color, sw, draw));
  out.push(lineNode("y", c(yAxisX, y0), c(yAxisX, y1), color, sw, draw));
  const tickAlpha = clamp01((draw - 0.4) / 0.6);
  const labels = el.labels ?? true;
  const fontSize = 0.24 * k;
  const ink = resolveColor("muted", theme);
  const tick = 0.08;
  const ticks = (from: number, to: number, step: number) => {
    const list: number[] = [];
    for (let v = Math.ceil(from / step) * step; v <= to + 1e-9 && list.length < 60; v += step) list.push(Number(v.toPrecision(10)));
    return list;
  };
  for (const x of ticks(x0, x1, niceStep(xs))) {
    if (Math.abs(x - yAxisX) < 1e-9 && yAxisX !== x0) continue;
    const a = c(x, xAxisY);
    out.push(<line key={`xt${x}`} x1={a[0]} y1={a[1] - tick * k} x2={a[0]} y2={a[1] + tick * k} stroke={rgbCss(color, tickAlpha)} strokeWidth={sw * 0.8} />);
    if (labels) out.push(textNode(`xl${x}`, String(x), [a[0], a[1] + 0.3 * k], fontSize, ink, tickAlpha));
  }
  for (const y of ticks(y0, y1, niceStep(ys))) {
    if (Math.abs(y - xAxisY) < 1e-9 && xAxisY !== y0) continue;
    const a = c(yAxisX, y);
    out.push(<line key={`yt${y}`} x1={a[0] - tick * k} y1={a[1]} x2={a[0] + tick * k} y2={a[1]} stroke={rgbCss(color, tickAlpha)} strokeWidth={sw * 0.8} />);
    if (labels) out.push(textNode(`yl${y}`, String(y), [a[0] - 0.35 * k, a[1]], fontSize, ink, tickAlpha));
  }
  if (el.xLabel) {
    const a = c(x1, xAxisY);
    out.push(textNode("xlabel", el.xLabel, [a[0] + 0.1 * k, a[1] - 0.35 * k], 0.3 * k, ink, tickAlpha));
  }
  if (el.yLabel) {
    const a = c(yAxisX, y1);
    out.push(textNode("ylabel", el.yLabel, [a[0] + 0.35 * k, a[1] - 0.05 * k], 0.3 * k, ink, tickAlpha));
  }
  return out;
}

function numberLineNodes(el: Extract<SceneElement, { shape: "numberline" }>, box: Box, tx: (p: Point) => Point, color: Rgb, theme: SceneTheme, draw: number, sw: number, k: number): ReactNode[] {
  const [a, b, step] = el.range;
  const toX = (v: number) => box.x - box.w / 2 + ((v - a) / (b - a || 1)) * box.w;
  const out: ReactNode[] = [lineNode("line", tx([toX(a), box.y]), tx([toX(b), box.y]), color, sw, draw)];
  const alpha = clamp01((draw - 0.4) / 0.6);
  for (let v = a, i = 0; v <= b + 1e-9 && i < 80; v += step, i++) {
    const value = Number(v.toPrecision(10));
    const p = tx([toX(value), box.y]);
    out.push(<line key={`t${i}`} x1={p[0]} y1={p[1] - 0.1 * k} x2={p[0]} y2={p[1] + 0.1 * k} stroke={rgbCss(color, alpha)} strokeWidth={sw} />);
    if (el.labels ?? true) out.push(textNode(`l${i}`, String(value), [p[0], p[1] + 0.35 * k], 0.26 * k, resolveColor("muted", theme), alpha));
  }
  return out;
}

const BAR_COLORS = ["blue", "green", "orange", "purple", "teal", "pink", "red", "yellow"] as const;

function barNodes(el: Extract<SceneElement, { shape: "bars" }>, box: Box, tx: (p: Point) => Point, theme: SceneTheme, draw: number, k: number, color?: string): ReactNode[] {
  const n = el.values.length;
  const max = el.max ?? Math.max(...el.values.map(Math.abs), 1e-9);
  const slot = box.w / n;
  const base = box.y - box.h / 2;
  const out: ReactNode[] = [];
  el.values.forEach((value, i) => {
    // Bars grow one after another as the whole set is drawn.
    const p = clamp01((draw * (n + 2) - i) / 3);
    const h = (Math.max(0, value) / max) * box.h * EASINGS.out(p);
    const x = box.x - box.w / 2 + slot * i + slot * 0.15;
    const a = tx([x, base + h]);
    const b = tx([x + slot * 0.7, base]);
    const rgb = resolveColor(color ?? BAR_COLORS[i % BAR_COLORS.length], theme);
    out.push(<rect key={`b${i}`} x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} rx={0.05 * k} fill={rgbCss(rgb, 0.9)} />);
    const labelAt = tx([x + slot * 0.35, base - 0.3]);
    if (el.labels?.[i]) out.push(textNode(`l${i}`, el.labels[i]!, labelAt, 0.26 * k, resolveColor("muted", theme), clamp01(draw * 2)));
    if (p >= 1) out.push(textNode(`v${i}`, String(value), tx([x + slot * 0.35, base + h + 0.25]), 0.26 * k, resolveColor("ink", theme), 1));
  });
  return out;
}

function tableNodes(el: Extract<SceneElement, { shape: "table" }>, box: Box, tx: (p: Point) => Point, color: Rgb, theme: SceneTheme, draw: number, sw: number, k: number): ReactNode[] {
  const [cw, ch] = el.cell ?? [1.6, 0.6];
  const cols = Math.max(...el.rows.map((r) => r.length));
  const x0 = box.x - box.w / 2;
  const y1 = box.y + box.h / 2;
  const out: ReactNode[] = [];
  for (let r = 0; r <= el.rows.length; r++) out.push(lineNode(`h${r}`, tx([x0, y1 - r * ch]), tx([x0 + cols * cw, y1 - r * ch]), color, sw * 0.7, draw));
  for (let c = 0; c <= cols; c++) out.push(lineNode(`v${c}`, tx([x0 + c * cw, y1]), tx([x0 + c * cw, y1 - el.rows.length * ch]), color, sw * 0.7, draw));
  const alpha = clamp01((draw - 0.5) / 0.5);
  el.rows.forEach((row, r) =>
    row.forEach((cell, c) => out.push(textNode(`c${r}-${c}`, cell, tx([x0 + (c + 0.5) * cw, y1 - (r + 0.5) * ch]), Math.min(0.3, ch * 0.5) * k, resolveColor(r === 0 ? "ink" : "muted", theme), alpha, false, r === 0))),
  );
  return out;
}
