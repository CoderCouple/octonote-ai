import type { Diagram, DiagramNode } from '../dsl/types';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { DEFAULT_TYPOGRAPHY, estimateTextWidth, wrapText, type LayoutEdge, type LayoutNode, type TextMeasurer, type Typography } from '../layout/layout';
import { routeEdges } from '../layout/route';
import { Icon, Wash, WatercolorDefs } from '../react/DiagramSvg';
import { lineColor, swatchFor } from '../react/theme';
import type { Theme } from '../theme/tokens';
import { buildView } from '../view/view';

// BPMN (swimlane) diagrams, in Eraser's syntax: the architecture syntax where
// top-level groups are pools, groups inside them are lanes, and nodes have
// `type: activity | event | gateway`. Pools are stacked horizontal bands with
// their name in a strip on the left; the process reads left to right, every
// step in the column of its place in the flow and the row of its lane.

/** activity, event and gateway are Eraser's; subprocess, data (object) and store are octodraw extensions. */
export type BpmnElementType = 'activity' | 'event' | 'gateway' | 'subprocess' | 'data' | 'store';

export interface BpmnBand {
  id: string;
  kind: 'pool' | 'lane';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  icon?: string;
}

export interface BpmnElement {
  id: string;
  type: BpmnElementType;
  /** Start / end events (no incoming / no outgoing connections) are drawn thin / thick; others are intermediate (double ring). */
  role?: 'start' | 'end' | 'intermediate';
  /** Gateway kind (octodraw extension `gateway:`), exclusive by default. */
  gateway?: 'exclusive' | 'parallel' | 'inclusive' | 'event';
  /** Event trigger (octodraw extension `event:`). */
  trigger?: 'message' | 'timer' | 'error' | 'signal';
  /** The pool it belongs to (connections across pools are message flows). */
  pool: string | null;
  /** Boundary events: the task whose edge they sit on. */
  attached?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  /** Events and gateways carry their label outside the shape. */
  labelBox?: { x: number; y: number; width: number; height: number };
  color?: string;
  icon?: string;
}

export interface BpmnLayout {
  width: number;
  height: number;
  bands: BpmnBand[];
  elements: BpmnElement[];
  edges: LayoutEdge[];
}

const PAD = 24;
const POOL_STRIP = 34;
const LANE_STRIP = 28;
const COL_GAP = 64;
const ROW_GAP = 28;
const LANE_PAD = 24;
const ACTIVITY = { minWidth: 112, maxWidth: 168, height: 60, padX: 12 };
const EVENT = 36;
const GATEWAY = 46;
const LABEL_GAP = 6;

const TYPES: readonly BpmnElementType[] = ['event', 'gateway', 'subprocess', 'data', 'store'];
export const elementType = (node: DiagramNode): BpmnElementType => TYPES.find((t) => t === node.properties.type) ?? 'activity';
/** Boxes with their label inside (activities, subprocesses); the rest carry it below. */
const boxed = (t: BpmnElementType) => t === 'activity' || t === 'subprocess';
const SMALL: Partial<Record<BpmnElementType, { width: number; height: number }>> = { event: { width: 36, height: 36 }, gateway: { width: 46, height: 46 }, data: { width: 34, height: 44 }, store: { width: 46, height: 40 } };

/** Column of each element: its longest path from a start, ignoring connections that loop back. */
function columns(ids: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const order = new Map(ids.map((id, i) => [id, i]));
  const out = new Map<string, string[]>();
  const indegree = new Map(ids.map((id) => [id, 0]));
  // Back edges (to something declared earlier that reaches here) are dropped by walking in declaration order.
  const forward = edges.filter((e) => order.has(e.from) && order.has(e.to) && e.from !== e.to);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const kept: { from: string; to: string }[] = [];
  const adjacency = new Map<string, string[]>();
  for (const e of forward) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
  const dfs = (id: string) => {
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visiting.has(next)) continue; // a loop back
      kept.push({ from: id, to: next });
      if (!done.has(next)) dfs(next);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const id of ids) if (!done.has(id)) dfs(id);
  for (const e of kept) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const col = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of out.get(id) ?? []) {
      col.set(next, Math.max(col.get(next)!, col.get(id)! + 1));
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return col;
}

export interface BpmnLayoutOptions {
  measureText?: TextMeasurer;
  typography?: Typography;
  /** Hand placements (top-left per element); elements stay inside their lane. */
  placements?: Record<string, { x: number; y: number }>;
}

export function layoutBpmn(diagram: Diagram, options: BpmnLayoutOptions = {}): BpmnLayout {
  const measure = options.measureText ?? estimateTextWidth;
  const type = options.typography ?? DEFAULT_TYPOGRAPHY;
  const font = type.node;
  const lineHeight = font.size * font.lineHeight;

  // Rows: each lane (or a pool without lanes) is a row; elements outside any pool share a row at the top.
  interface Row { id: string | null; pool: string | null; elements: string[] }
  const rows: Row[] = [];
  const loose: string[] = [];
  const elementsIn = (id: string): string[] => diagram.nodes.get(id)!.children.flatMap((c) => (diagram.nodes.get(c)!.kind === 'group' ? elementsIn(c) : [c]));
  for (const id of diagram.roots) {
    const node = diagram.nodes.get(id)!;
    if (node.kind !== 'group') {
      loose.push(id);
      continue;
    }
    const lanes = node.children.filter((c) => diagram.nodes.get(c)!.kind === 'group');
    const direct = node.children.filter((c) => diagram.nodes.get(c)!.kind !== 'group');
    if (!lanes.length) rows.push({ id, pool: id, elements: direct });
    else {
      // Steps written straight in a pool with lanes go in its first lane.
      lanes.forEach((lane, i) => rows.push({ id: lane, pool: id, elements: [...(i === 0 ? direct : []), ...elementsIn(lane)] }));
    }
  }
  if (loose.length) rows.unshift({ id: null, pool: null, elements: loose });

  // Boundary events (`attached: Task`) sit on their task's edge instead of taking a place in the flow.
  const attachedTo = new Map<string, string>();
  for (const node of diagram.nodes.values()) {
    const host = node.properties.attached ? diagram.nodes.get(node.properties.attached) : undefined;
    if (node.kind === 'node' && elementType(node) === 'event' && host && host.kind === 'node' && boxed(elementType(host))) attachedTo.set(node.id, host.id);
  }
  for (const row of rows) row.elements = row.elements.filter((id) => !attachedTo.has(id));
  const allElements = rows.flatMap((r) => r.elements);
  const col = columns(allElements, diagram.edges);
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.elements.forEach((id) => rowOf.set(id, i)));

  // Element sizes.
  const sizes = new Map<string, { width: number; height: number; lines: string[]; label?: { width: number; height: number } }>();
  for (const id of allElements) {
    const node = diagram.nodes.get(id)!;
    const t = elementType(node);
    if (boxed(t)) {
      const lines = wrapText(node.label, font, ACTIVITY.maxWidth - ACTIVITY.padX * 2, measure);
      const width = Math.max(ACTIVITY.minWidth, Math.ceil(Math.max(...lines.map((l) => measure(l, font))) + ACTIVITY.padX * 2 + (node.properties.icon ? 22 : 0)));
      sizes.set(id, { width, height: Math.max(ACTIVITY.height, lines.length * lineHeight + 20), lines });
    } else {
      const lines = wrapText(node.label, font, 140, measure);
      const size = SMALL[t] ?? { width: EVENT, height: EVENT };
      sizes.set(id, { width: size.width, height: size.height, lines, label: { width: Math.ceil(Math.max(...lines.map((l) => measure(l, font)))), height: lines.length * lineHeight } });
    }
  }
  // A column is as wide as its widest element (or label).
  const colCount = Math.max(0, ...allElements.map((id) => col.get(id)!)) + 1;
  const colWidth = Array.from({ length: colCount }, (_, c) => Math.max(60, ...allElements.filter((id) => col.get(id) === c).map((id) => Math.max(sizes.get(id)!.width, sizes.get(id)!.label?.width ?? 0))));
  const contentLeft = PAD + POOL_STRIP + (rows.some((r) => r.id !== r.pool) ? LANE_STRIP : 0) + LANE_PAD;
  const colX: number[] = [];
  colX[0] = contentLeft;
  for (let c = 1; c < colCount; c++) colX[c] = colX[c - 1]! + colWidth[c - 1]! + COL_GAP;
  const contentRight = colCount ? colX[colCount - 1]! + colWidth[colCount - 1]! + LANE_PAD : contentLeft + 200;

  // Rows: elements in the same lane and column stack; labels outside shapes take room below.
  // Tasks carrying boundary events keep room below for the event's lower half and its label.
  const hosts = new Set(attachedTo.values());
  const slotHeight = (id: string) => sizes.get(id)!.height + (sizes.get(id)!.label ? sizes.get(id)!.label!.height + LABEL_GAP : 0) + (hosts.has(id) ? SMALL.event!.height / 2 + LABEL_GAP + lineHeight * 2 : 0);
  const elements: BpmnElement[] = [];
  const bands: BpmnBand[] = [];
  let y = PAD;
  const rowBox = new Map<number, { y: number; height: number }>();
  rows.forEach((row, r) => {
    const stacks = new Map<number, string[]>();
    for (const id of row.elements) stacks.set(col.get(id)!, [...(stacks.get(col.get(id)!) ?? []), id]);
    const height = Math.max(96, ...[...stacks.values()].map((ids) => ids.reduce((h, id) => h + slotHeight(id), 0) + (ids.length - 1) * ROW_GAP + LANE_PAD * 2));
    rowBox.set(r, { y, height });
    for (const [c, ids] of stacks) {
      const total = ids.reduce((h, id) => h + slotHeight(id), 0) + (ids.length - 1) * ROW_GAP;
      let cy = y + (height - total) / 2;
      for (const id of ids) {
        const node = diagram.nodes.get(id)!;
        const s = sizes.get(id)!;
        const x = colX[c]! + (colWidth[c]! - s.width) / 2;
        const t = elementType(node);
        const hasIn = diagram.edges.some((e) => e.to === id && e.from !== id);
        const hasOut = diagram.edges.some((e) => e.from === id && e.to !== id);
        elements.push({
          id,
          type: t,
          role: t === 'event' ? (!hasIn ? 'start' : !hasOut ? 'end' : 'intermediate') : undefined,
          gateway: t === 'gateway' ? ((['parallel', 'inclusive', 'event'] as const).find((g) => g === node.properties.gateway) ?? 'exclusive') : undefined,
          trigger: t === 'event' ? (['message', 'timer', 'error', 'signal'] as const).find((g) => g === node.properties.event) : undefined,
          pool: row.pool,
          x,
          y: cy,
          width: s.width,
          height: s.height,
          lines: s.lines,
          labelBox: s.label && { x: colX[c]! + (colWidth[c]! - s.label.width) / 2, y: cy + s.height + LABEL_GAP, width: s.label.width, height: s.label.height },
          color: node.properties.color,
          icon: node.properties.icon,
        });
        cy += slotHeight(id) + ROW_GAP;
      }
    }
    y += height;
    // Pools sit apart from each other; lanes of one pool touch.
    if (rows[r + 1] && rows[r + 1]!.pool !== row.pool) y += 24;
  });

  for (const r of rows.keys()) {
    const row = rows[r]!;
    const box = rowBox.get(r)!;
    if (row.id !== null && row.id !== row.pool) {
      const lane = diagram.nodes.get(row.id)!;
      bands.push({ id: row.id, kind: 'lane', label: lane.label, x: PAD + POOL_STRIP, y: box.y, width: contentRight - PAD - POOL_STRIP, height: box.height, color: lane.properties.color, icon: lane.properties.icon });
    }
  }
  for (const pool of new Set(rows.map((r) => r.pool))) {
    if (pool === null) continue;
    const mine = [...rows.keys()].filter((r) => rows[r]!.pool === pool).map((r) => rowBox.get(r)!);
    const node = diagram.nodes.get(pool)!;
    const top = mine[0]!.y;
    const bottom = mine.at(-1)!.y + mine.at(-1)!.height;
    bands.unshift({ id: pool, kind: 'pool', label: node.label, x: PAD, y: top, width: contentRight - PAD, height: bottom - top, color: node.properties.color, icon: node.properties.icon });
  }

  // Hand placements: an element keeps its lane (it can move along it and up or down inside it).
  const placements = options.placements ?? {};
  for (const e of elements) {
    const p = placements[e.id];
    if (!p) continue;
    const row = rowBox.get(rowOf.get(e.id)!)!;
    const labelH = e.labelBox ? e.labelBox.height + LABEL_GAP : 0;
    const x = Math.max(contentLeft - LANE_PAD + 4, p.x);
    const y = Math.min(Math.max(row.y + 6, p.y), row.y + row.height - e.height - labelH - 6);
    const dx = x - e.x;
    const dy = y - e.y;
    e.x = x;
    e.y = y;
    if (e.labelBox) e.labelBox = { ...e.labelBox, x: e.labelBox.x + dx, y: e.labelBox.y + dy };
  }
  // Boundary events on the bottom edge of their task, right to left.
  const perHost = new Map<string, number>();
  for (const [id, hostId] of attachedTo) {
    const host = elements.find((e) => e.id === hostId);
    if (!host) continue;
    const node = diagram.nodes.get(id)!;
    const n = perHost.get(hostId) ?? 0;
    perHost.set(hostId, n + 1);
    const size = SMALL.event!.width;
    const x = host.x + host.width - size - 10 - n * (size + 10);
    const y = host.y + host.height - size / 2;
    const lines = wrapText(node.label, font, 120, measure);
    const labelWidth = Math.ceil(Math.max(...lines.map((l) => measure(l, font))));
    elements.push({
      id,
      type: 'event',
      role: 'intermediate',
      trigger: (['message', 'timer', 'error', 'signal'] as const).find((g) => g === node.properties.event),
      x,
      y,
      width: size,
      height: size,
      lines,
      labelBox: { x: x + size / 2 - labelWidth / 2, y: y + size + LABEL_GAP, width: labelWidth, height: lines.length * lineHeight },
      color: node.properties.color,
      icon: node.properties.icon,
      pool: host.pool,
      attached: hostId,
    });
  }
  // Bands reach past elements dragged beyond the last column.
  const reach = Math.max(contentRight, ...elements.map((e) => Math.max(e.x + e.width, e.labelBox ? e.labelBox.x + e.labelBox.width : 0) + LANE_PAD));
  for (const b of bands) b.width = reach - b.x;

  // Route connections around the shapes with the same router as architecture diagrams.
  const view = buildView(diagram, { focus: null });
  const byId = new Map<string, LayoutNode>();
  const base = { description: [], properties: {}, parent: null, depth: 0, hiddenCount: 0, variant: 'card' as const };
  for (const e of elements) {
    const shape = e.type === 'event' ? 'ellipse' : e.type === 'gateway' ? 'diamond' : e.type === 'store' ? 'cylinder' : undefined;
    byId.set(e.id, { ...base, id: e.id, kind: 'node', x: e.x, y: e.y, width: e.width, height: e.height, lines: e.lines, properties: shape ? { shape } : {}, labelBox: e.labelBox });
  }
  const edges = view.edges.every((edge) => byId.has(edge.from) && byId.has(edge.to)) ? routeEdges({ ...view, edges: view.edges }, byId, { direction: 'right' }, type.edge, measure) : [];

  const width = Math.max(reach, ...edges.flatMap((e) => e.points.map((p) => p.x))) + PAD;
  const height = Math.max(y, ...elements.map((e) => (e.labelBox ? e.labelBox.y + e.labelBox.height : e.y + e.height)), ...edges.flatMap((e) => e.points.map((p) => p.y))) + PAD;
  return { width, height, bands, elements, edges };
}

export interface BpmnSvgProps {
  layout: BpmnLayout;
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Draw-in: how many elements (then connections) are shown; undefined shows all. */
  reveal?: number;
  /** shadow (default) | plain | watercolor */
  styleMode?: string;
}

export function BpmnSvg({ layout, theme, icons, iconSet, reveal, styleMode }: BpmnSvgProps) {
  const watercolor = styleMode === 'watercolor';
  const shadow = styleMode !== 'plain' && !watercolor;
  const font = theme.text.node;
  const lineHeight = font.size * font.lineHeight;
  const elements = reveal === undefined ? layout.elements : layout.elements.slice(0, reveal);
  const shown = new Set(elements.map((e) => e.id));
  const poolOf = new Map(layout.elements.map((e) => [e.id, e.pool]));
  // Lines to data objects and stores are associations (dotted).
  const dataIds = new Set(layout.elements.filter((e) => e.type === 'data' || e.type === 'store').map((e) => e.id));
  const edges = (reveal === undefined ? layout.edges : layout.edges.slice(0, Math.max(0, reveal - layout.elements.length))).filter((e) => shown.has(e.from) && shown.has(e.to));
  const text = (lines: string[], cx: number, top: number, fill: string) => (
    <text textAnchor="middle" fontSize={font.size} fontWeight={font.weight} fill={fill}>
      {lines.map((line, i) => (
        <tspan key={i} x={cx} y={top + i * lineHeight + font.size * 0.95}>
          {line}
        </tspan>
      ))}
    </text>
  );
  return (
    <g fontFamily={theme.font.sans}>
      {watercolor && <WatercolorDefs />}
      {layout.bands.map((b) => {
        const swatch = swatchFor(theme, b.color);
        const stroke = swatch?.stroke ?? theme.color.borderStrong;
        const strip = b.kind === 'pool' ? POOL_STRIP : LANE_STRIP;
        const cx = b.x + strip / 2;
        const cy = b.y + b.height / 2;
        return (
          <g key={`${b.kind}:${b.id}`} data-node-id={b.id}>
            <rect x={b.x} y={b.y} width={b.width} height={b.height} fill={b.kind === 'pool' ? theme.color.canvas : (swatch?.groupFills[0] ?? 'none')} stroke={stroke} strokeWidth={b.kind === 'pool' ? 1.2 : 1} />
            <rect x={b.x} y={b.y} width={strip} height={b.height} fill={swatch?.nodeFill ?? theme.color.hover} stroke={stroke} strokeWidth={b.kind === 'pool' ? 1.2 : 1} />
            <text x={cx} y={cy} transform={`rotate(-90 ${cx} ${cy})`} textAnchor="middle" dominantBaseline="central" fontSize={b.kind === 'pool' ? 13.5 : 12.5} fontWeight={600} fill={theme.color.text}>
              {b.label}
            </text>
          </g>
        );
      })}
      {edges.map((e) => {
        const color = lineColor(theme, e.color) ?? theme.color.edge;
        const marker = `od-bpmn-arrow-${color.replace(/[^\w]/g, '')}`;
        // Between pools a connection is a message flow: dashed, open circle at the start, open arrowhead.
        const association = dataIds.has(e.from) || dataIds.has(e.to);
        const message = !association && poolOf.get(e.from) !== poolOf.get(e.to);
        const start = e.points[0]!;
        return (
          <g key={e.id}>
            <defs>
              <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={color} />
              </marker>
              <marker id={`${marker}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={theme.color.canvas} stroke={color} strokeWidth={1.2} />
              </marker>
            </defs>
            <polyline points={e.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={theme.stroke.edge * 1.2} strokeDasharray={association ? '2 4' : message || e.dashed ? '6 4' : undefined} strokeLinejoin="round" markerEnd={e.endArrow ? `url(#${marker}${message ? '-open' : ''})` : undefined} markerStart={e.startArrow ? `url(#${marker}${message ? '-open' : ''})` : undefined} />
            {message && <circle cx={start.x} cy={start.y} r={3.5} fill={theme.color.canvas} stroke={color} strokeWidth={1.2} />}
            {e.label && (
              <text x={e.label.x + e.label.width / 2} y={e.label.y + e.label.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={theme.text.edge.size} fill={theme.color.textMuted} stroke={theme.color.canvas} strokeWidth={4} paintOrder="stroke">
                {e.label.text}
              </text>
            )}
          </g>
        );
      })}
      {elements.map((e) => {
        const swatch = swatchFor(theme, e.color);
        const stroke = swatch?.stroke ?? theme.node.stroke;
        const fill = swatch?.nodeFill ?? theme.node.fill;
        const cx = e.x + e.width / 2;
        const cy = e.y + e.height / 2;
        const icon = e.icon ? resolveIcon(e.icon, icons, iconSet) : undefined;
        const shapeFill = watercolor ? 'none' : fill;
        const fold = 9;
        const dataPath = `M${e.x},${e.y} H${e.x + e.width - fold} L${e.x + e.width},${e.y + fold} V${e.y + e.height} H${e.x} Z`;
        const ry = 6;
        const storePath = `M${e.x},${e.y + ry} A${e.width / 2},${ry} 0 0 1 ${e.x + e.width},${e.y + ry} V${e.y + e.height - ry} A${e.width / 2},${ry} 0 0 1 ${e.x},${e.y + e.height - ry} Z`;
        const outline =
          e.type === 'activity' || e.type === 'subprocess' ? <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={10} /> : e.type === 'event' ? <circle cx={cx} cy={cy} r={e.width / 2} /> : e.type === 'data' ? <path d={dataPath} /> : e.type === 'store' ? <path d={storePath} /> : <path d={`M${cx},${e.y} L${e.x + e.width},${cy} L${cx},${e.y + e.height} L${e.x},${cy} Z`} />;
        return (
          <g key={e.id} data-node-id={e.id}>
            {watercolor && (
              <Wash color={stroke} theme={theme}>
                {outline}
              </Wash>
            )}
            {(e.type === 'activity' || e.type === 'subprocess') && (
              <>
                {shadow && <rect x={e.x + 3} y={e.y + 3} width={e.width} height={e.height} rx={10} fill={theme.shadow.shape.color} />}
                <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={10} fill={shapeFill} stroke={stroke} />
                {icon && <Icon name={e.icon!} resolved={icon} x={e.x + 8} y={e.y + 8} size={16} tint={icon.tint ?? swatch?.icon ?? theme.node.icon} theme={theme} />}
                {text(e.lines, cx + (icon ? 8 : 0), cy - (e.lines.length * lineHeight) / 2 - (e.type === 'subprocess' ? 5 : 0), theme.color.text)}
                {e.type === 'subprocess' && (
                  // The collapsed-subprocess marker: a small boxed plus at the bottom.
                  <g stroke={stroke} strokeWidth={1.1} fill="none">
                    <rect x={cx - 7} y={e.y + e.height - 17} width={14} height={14} rx={2} />
                    <path d={`M${cx},${e.y + e.height - 14} V${e.y + e.height - 6} M${cx - 4},${e.y + e.height - 10} H${cx + 4}`} />
                  </g>
                )}
              </>
            )}
            {e.type === 'data' && (
              <g stroke={stroke} strokeWidth={1.2}>
                <path d={dataPath} fill={shapeFill} />
                <path d={`M${e.x + e.width - fold},${e.y} V${e.y + fold} H${e.x + e.width}`} fill="none" />
              </g>
            )}
            {e.type === 'store' && (
              <g stroke={stroke} strokeWidth={1.2}>
                <path d={storePath} fill={shapeFill} />
                <path d={`M${e.x},${e.y + ry} A${e.width / 2},${ry} 0 0 0 ${e.x + e.width},${e.y + ry}`} fill="none" />
              </g>
            )}
            {e.type === 'event' && (
              <>
                <circle cx={cx} cy={cy} r={e.width / 2} fill={shapeFill} stroke={stroke} strokeWidth={e.role === 'end' ? 3.5 : 1.4} />
                {e.role === 'intermediate' && <circle cx={cx} cy={cy} r={e.width / 2 - 3.5} fill="none" stroke={stroke} strokeWidth={1.2} />}
                {e.trigger && <EventMarker trigger={e.trigger} cx={cx} cy={cy} color={stroke} filled={e.role === 'end'} />}
              </>
            )}
            {e.type === 'gateway' && (
              <>
                <path d={`M${cx},${e.y} L${e.x + e.width},${cy} L${cx},${e.y + e.height} L${e.x},${cy} Z`} fill={shapeFill} stroke={stroke} strokeWidth={1.3} />
                <GatewayMarker kind={e.gateway ?? 'exclusive'} cx={cx} cy={cy} color={stroke} />
              </>
            )}
            {e.labelBox && text(e.lines, cx, e.labelBox.y, theme.color.text)}
          </g>
        );
      })}
    </g>
  );
}

/** The symbol inside a gateway: X exclusive, + parallel, O inclusive, pentagon in a ring event-based. */
function GatewayMarker({ kind, cx, cy, color }: { kind: NonNullable<BpmnElement['gateway']>; cx: number; cy: number; color: string }) {
  if (kind === 'parallel') return <path d={`M${cx},${cy - 9} V${cy + 9} M${cx - 9},${cy} H${cx + 9}`} stroke={color} strokeWidth={2.4} strokeLinecap="round" />;
  if (kind === 'inclusive') return <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={2.2} />;
  if (kind === 'event') {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${cx + Math.cos(a) * 5.5},${cy + Math.sin(a) * 5.5}`;
    }).join(' ');
    return (
      <g fill="none" stroke={color} strokeWidth={1.2}>
        <circle cx={cx} cy={cy} r={10} />
        <circle cx={cx} cy={cy} r={8} />
        <polygon points={pts} />
      </g>
    );
  }
  return <path d={`M${cx - 7},${cy - 7} L${cx + 7},${cy + 7} M${cx + 7},${cy - 7} L${cx - 7},${cy + 7}`} stroke={color} strokeWidth={2} strokeLinecap="round" />;
}

/** The trigger symbol inside an event (filled for end events, which "throw"). */
function EventMarker({ trigger, cx, cy, color, filled }: { trigger: NonNullable<BpmnElement['trigger']>; cx: number; cy: number; color: string; filled: boolean }) {
  const fill = filled ? color : 'none';
  switch (trigger) {
    case 'message':
      return (
        <g stroke={color} strokeWidth={1.2} fill={fill}>
          <rect x={cx - 8} y={cy - 5.5} width={16} height={11} rx={1} />
          <path d={`M${cx - 8},${cy - 5.5} L${cx},${cy + 1} L${cx + 8},${cy - 5.5}`} fill="none" stroke={filled ? '#fff' : color} />
        </g>
      );
    case 'timer':
      return (
        <g stroke={color} strokeWidth={1.2} fill="none">
          <circle cx={cx} cy={cy} r={8} />
          <path d={`M${cx},${cy - 5.5} V${cy} L${cx + 4},${cy + 2.5}`} strokeLinecap="round" />
        </g>
      );
    case 'error':
      return <path d={`M${cx - 7},${cy + 7} L${cx - 3},${cy - 6} L${cx + 2},${cy + 2} L${cx + 7},${cy - 7} L${cx + 3},${cy + 6} L${cx - 2},${cy - 2} Z`} stroke={color} strokeWidth={1.2} fill={fill} strokeLinejoin="round" />;
    case 'signal':
      return <path d={`M${cx},${cy - 8} L${cx + 8},${cy + 6} L${cx - 8},${cy + 6} Z`} stroke={color} strokeWidth={1.2} fill={fill} strokeLinejoin="round" />;
  }
}
