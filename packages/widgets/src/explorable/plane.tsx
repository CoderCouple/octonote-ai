import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "../provider.js";
import { niceTicks, useWidth } from "./chart.js";
import type { Scope } from "./expr.js";
import { formatNumber, renderTemplate } from "./format.js";
import { formatInput, keyStep, solveInput, useDrag, useRuntime, type WidgetRuntime } from "./interact.js";
import { valueOf } from "./runtime.js";
import type { WidgetView } from "./schema.js";

type PlaneSpec = Extract<WidgetView, { type: "plane" }>;
type Pair = readonly [string, string];

/** A coordinate plane: points, segments, vectors, polygons, circles, curves and text, all placed by formulas. */
export function PlaneView({ view, scope, currency }: { view: PlaneSpec; scope: Scope; currency?: string }) {
  const [ref, width] = useWidth(560);
  const svg = useRef<SVGSVGElement>(null);
  const [x0, x1] = view.x;
  const [y0, y1] = view.y;
  // Same scale on both axes when it fits, so circles stay round.
  const height = Math.round(Math.min(480, Math.max(220, (width * (y1 - y0)) / (x1 - x0))));
  const pad = 8;
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0)) * (width - pad * 2);
  const sy = (y: number) => pad + (1 - (y - y0) / (y1 - y0)) * (height - pad * 2);
  const at = (pt: Pair | undefined, s: Scope = scope): [number, number] => (pt ? [valueOf(pt[0], s), valueOf(pt[1], s)] : [0, 0]);
  const ok = (...ns: number[]) => ns.every(Number.isFinite);
  const text = (template: string | undefined) => (template ? renderTemplate(template, scope, currency) : undefined);
  const xTicks = niceTicks(x0, x1, Math.max(4, Math.floor(width / 60))).filter((t) => t > x0 && t < x1);
  const yTicks = niceTicks(y0, y1, Math.max(4, Math.floor(height / 50))).filter((t) => t > y0 && t < y1);
  const arrowId = useRef(`wg-arrow-${Math.random().toString(36).slice(2)}`).current;

  const shapes: ReactNode[] = view.shapes.map((shape, i) => {
    const c = `wg-c-${shape.color ?? "blue"}`;
    switch (shape.kind) {
      case "point": {
        const [x, y] = at(shape.at);
        if (!ok(x, y)) return null;
        return (
          <g key={i} className={c}>
            <circle cx={sx(x)} cy={sy(y)} r={4.5} className="wg-plane__point" />
            {shape.label ? <Label x={sx(x) + 8} y={sy(y) - 8} text={text(shape.label)!} /> : null}
          </g>
        );
      }
      case "segment":
      case "vector": {
        const [ax, ay] = at(shape.kind === "vector" ? (shape.from ?? ["0", "0"]) : shape.from);
        const [bx, by] = at(shape.to);
        if (!ok(ax, ay, bx, by)) return null;
        return (
          <g key={i} className={c}>
            <line
              x1={sx(ax)}
              y1={sy(ay)}
              x2={sx(bx)}
              y2={sy(by)}
              className={cx("wg-plane__line", shape.kind === "segment" && shape.dashed && "wg-plane__line--dashed")}
              markerEnd={shape.kind === "vector" && Math.hypot(sx(bx) - sx(ax), sy(by) - sy(ay)) > 6 ? `url(#${arrowId}-${shape.color ?? "blue"})` : undefined}
            />
            {shape.label ? <Label x={(sx(ax) + sx(bx)) / 2 + 6} y={(sy(ay) + sy(by)) / 2 - 6} text={text(shape.label)!} /> : null}
          </g>
        );
      }
      case "polygon": {
        const pts = shape.points.map((p) => at(p));
        if (!pts.every(([x, y]) => ok(x, y))) return null;
        const cxm = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cym = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        return (
          <g key={i} className={c}>
            <polygon points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} className="wg-plane__polygon" />
            {shape.label ? <Label x={sx(cxm)} y={sy(cym)} text={text(shape.label)!} anchor="middle" /> : null}
          </g>
        );
      }
      case "circle": {
        const [x, y] = at(shape.center);
        const r = valueOf(shape.r, scope);
        if (!ok(x, y, r) || r < 0) return null;
        return <ellipse key={i} className={cx(c, "wg-plane__circle", shape.dashed && "wg-plane__line--dashed")} cx={sx(x)} cy={sy(y)} rx={Math.abs(sx(x + r) - sx(x))} ry={Math.abs(sy(y + r) - sy(y))} />;
      }
      case "function": {
        const steps = Math.max(60, Math.round(width / 3));
        let d = "";
        let pen = false;
        for (let k = 0; k <= steps; k++) {
          const x = x0 + ((x1 - x0) * k) / steps;
          const y = valueOf(shape.y, { ...scope, x });
          if (!Number.isFinite(y) || y < y0 - (y1 - y0) * 4 || y > y1 + (y1 - y0) * 4) {
            pen = false;
            continue;
          }
          d += `${pen ? "L" : "M"} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)} `;
          pen = true;
        }
        return d ? <path key={i} d={d} className={cx(c, "wg-plane__curve")} /> : null;
      }
      case "text": {
        const [x, y] = at(shape.at);
        if (!ok(x, y)) return null;
        return (
          <g key={i} className={c}>
            <Label x={sx(x)} y={sy(y)} text={text(shape.text)!} anchor="middle" />
          </g>
        );
      }
    }
  });

  const colors = [...new Set(view.shapes.filter((s) => s.kind === "vector").map((s) => s.color ?? "blue"))];

  return (
    <figure className="wg-plane">
      <div ref={ref} className="wg-plane__box">
        <svg ref={svg} width={width} height={height} className="wg-plane__svg">
          <defs>
            <clipPath id={`${arrowId}-clip`}>
              <rect x={0} y={0} width={width} height={height} />
            </clipPath>
            {colors.map((color) => (
              <marker key={color} id={`${arrowId}-${color}`} viewBox="0 0 10 10" refX={8.5} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse" className={`wg-c-${color}`}>
                <path d="M 0 0 L 10 5 L 0 10 z" className="wg-plane__arrowhead" />
              </marker>
            ))}
          </defs>
          <g aria-hidden="true">
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={0} y2={height} className="wg-plane__grid" />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={0} x2={width} y1={sy(t)} y2={sy(t)} className="wg-plane__grid" />
            ))}
            {x0 < 0 && x1 > 0 ? <line x1={sx(0)} x2={sx(0)} y1={0} y2={height} className="wg-plane__axis" /> : null}
            {y0 < 0 && y1 > 0 ? <line x1={0} x2={width} y1={sy(0)} y2={sy(0)} className="wg-plane__axis" /> : null}
            {xTicks.map((t) =>
              t === 0 ? null : (
                <text key={`tx${t}`} x={sx(t)} y={Math.min(height - 4, Math.max(12, sy(0) + 14))} textAnchor="middle" className="wg-chart__tick">
                  {formatNumber(t)}
                </text>
              ),
            )}
            {yTicks.map((t) =>
              t === 0 ? null : (
                <text key={`ty${t}`} x={Math.min(width - 4, Math.max(14, sx(0) - 6))} y={sy(t)} textAnchor="end" dominantBaseline="middle" className="wg-chart__tick">
                  {formatNumber(t)}
                </text>
              ),
            )}
            <g clipPath={`url(#${arrowId}-clip)`}>{shapes}</g>
          </g>
          {view.handles?.map((h, i) => <PlaneHandle key={i} handle={h} scope={scope} sx={sx} sy={sy} svg={svg} width={width} height={height} label={text(h.label)} />)}
        </svg>
      </div>
    </figure>
  );
}

function Label({ x, y, text, anchor = "start" }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="wg-plane__label">
      {text}
    </text>
  );
}

type Handle = NonNullable<PlaneSpec["handles"]>[number];

/** A point the reader drags. With two inputs it moves freely: x then y are solved from the pointer. */
function PlaneHandle({ handle, scope, sx, sy, svg, width, height, label }: { handle: Handle; scope: Scope; sx: (x: number) => number; sy: (y: number) => number; svg: React.RefObject<SVGSVGElement | null>; width: number; height: number; label?: string }) {
  const runtime = useRuntime();
  const drag = useDrag((event: PointerEvent<Element>) => {
    if (!runtime) return;
    const box = svg.current?.getBoundingClientRect();
    if (!box?.width) return;
    const px = ((event.clientX - box.left) / box.width) * width;
    const py = ((event.clientY - box.top) / box.height) * height;
    const cost = (s: Scope) => Math.hypot(sx(valueOf(handle.at[0], s)) - px, sy(valueOf(handle.at[1], s)) - py);
    // Coordinate descent: each input in turn, starting from the others' new values.
    let current: WidgetRuntime = runtime;
    for (let pass = 0; pass < (handle.inputs.length > 1 ? 2 : 1); pass++) {
      for (const id of handle.inputs) {
        const value = solveInput(current, id, cost);
        if (value !== undefined) current = { ...current, inputs: { ...current.inputs, [id]: value } };
      }
    }
    for (const id of handle.inputs) if (current.inputs[id] !== runtime.inputs[id]) runtime.setInput(id, current.inputs[id]!);
  });
  if (!runtime) return null;
  const x = valueOf(handle.at[0], scope);
  const y = valueOf(handle.at[1], scope);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const inputs = handle.inputs.map((id) => runtime.spec.inputs.find((i) => i.id === id)).filter((i) => !!i);
  const [first, second] = inputs;
  const describe = inputs.map((i) => `${i.label} ${formatInput(i, runtime.inputs[i.id]!, runtime.spec.currency)}`).join(", ");
  const onKeyDown = (event: KeyboardEvent) => {
    // Left/right move the first input; up/down the second (or the first, when there's one).
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    const target = vertical && second ? second : first;
    if (!target) return;
    const key = vertical && second ? (event.key === "ArrowUp" ? "ArrowRight" : "ArrowLeft") : event.key;
    const next = keyStep(target, runtime.inputs[target.id]!, key);
    if (next === undefined) return;
    event.preventDefault();
    runtime.setInput(target.id, next);
  };
  return (
    <g className={cx("wg-chart__handle", `wg-c-${handle.color ?? "orange"}`)}>
      <circle cx={sx(x)} cy={sy(y)} r={16} className="wg-handle__halo" aria-hidden="true" />
      <circle
        cx={sx(x)}
        cy={sy(y)}
        r={8}
        className="wg-handle"
        role="slider"
        tabIndex={0}
        aria-label={`Drag point (${inputs.map((i) => i.label).join(" and ")}); arrow keys move it`}
        aria-valuenow={first ? runtime.inputs[first.id] : undefined}
        aria-valuetext={describe}
        onKeyDown={onKeyDown}
        {...drag}
      />
      {label ? (
        <text x={Math.min(sx(x) + 12, width - 4)} y={sy(y) - 14} textAnchor={sx(x) + 12 > width - 80 ? "end" : "start"} className="wg-chart__handle-label" aria-hidden="true">
          {label}
        </text>
      ) : null}
    </g>
  );
}
