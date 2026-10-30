import { LayoutManager, routeCorridorConnectionBatch, type LayoutEntity, type NewConnection } from '@eraserlabs/layout';
import type { DiagramView } from '../view/view';
import {
  edgeLabel,
  GROUP_METRICS,
  LEGEND_METRICS,
  type LayoutEdge,
  type LayoutLegend,
  type LayoutNode,
  type LayoutOptions,
  type Point,
} from './layout';
import { outlineFor, straightRoute } from './straight';
import { edgeFont as edgeFontFor, edgeStyle, edgeStyleFields, groupHeaderExtra } from './style';

// Edge routing (Eraser's corridor router) and legend placement on final node
// geometry. Kept apart from the ELK-based placement so hand-placed nodes can
// be re-routed without loading ELK.

/**
 * Sizes the legend and puts it outside the diagram on the side its `position`
 * names (default top-right); when it goes left or above, the diagram shifts.
 */
export function placeLegend(view: DiagramView, nodes: LayoutNode[], edges: LayoutEdge[], measure: NonNullable<LayoutOptions['measureText']>, type: { description: { size: number; weight: number } }): LayoutLegend | undefined {
  const source = view.legend;
  if (!source || source.items.length === 0) return undefined;
  const L = LEGEND_METRICS;
  const items = source.items.map((i) => ({ label: i.properties.label ?? '', connection: i.properties.connection, color: i.properties.color, icon: i.properties.icon, shape: i.properties.shape }));
  const width = Math.ceil(L.padding * 2 + L.swatchWidth + L.gap + Math.max(measure('Legend', type.description), ...items.map((i) => measure(i.label, type.description))));
  const height = L.padding * 2 + L.titleHeight + items.length * L.rowHeight - 6;

  const boxes = [...nodes, ...nodes.flatMap((n) => (n.labelBox ? [n.labelBox] : []))];
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const position = source.properties.position ?? 'top-right';
  const [vertical, horizontal] = position.includes('-') ? position.split('-') : position === 'left' || position === 'right' ? ['middle', position] : [position, 'center'];

  let x: number;
  let y: number;
  if (vertical === 'middle') {
    x = horizontal === 'left' ? minX - width - L.margin : maxX + L.margin;
    y = (minY + maxY) / 2 - height / 2;
  } else if (horizontal === 'center') {
    x = (minX + maxX) / 2 - width / 2;
    y = vertical === 'top' ? minY - height - L.margin : maxY + L.margin;
  } else if (vertical === 'top') {
    // Top corners sit beside the diagram, aligned with its top.
    x = horizontal === 'left' ? minX - width - L.margin : maxX + L.margin;
    y = minY;
  } else {
    // Bottom corners sit underneath, aligned with that side.
    x = horizontal === 'left' ? minX : maxX - width;
    y = maxY + L.margin;
  }

  // Keep everything in positive space: shift the diagram if the legend went left or above.
  const dx = Math.max(0, minX - x);
  const dy = Math.max(0, minY - y);
  if (dx || dy) {
    for (const n of nodes) {
      n.x += dx;
      n.y += dy;
      if (n.labelBox) {
        n.labelBox.x += dx;
        n.labelBox.y += dy;
      }
    }
    for (const e of edges) {
      for (const p of e.points) {
        p.x += dx;
        p.y += dy;
      }
      if (e.label) {
        e.label.x += dx;
        e.label.y += dy;
      }
    }
  }
  return { x: x + dx, y: y + dy, width, height, items };
}

export function routeEdges(
  view: DiagramView,
  nodes: Map<string, LayoutNode>,
  options: LayoutOptions,
  edgeFont: { size: number; weight: number; lineHeight: number },
  measure: NonNullable<LayoutOptions['measureText']>,
): LayoutEdge[] {
  const entities: LayoutEntity[] = [];
  for (const n of nodes.values()) {
    entities.push({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      containerId: n.parent,
      isContainer: n.kind === 'group',
      ...(n.variant === 'card' && outlineFor(n.properties.shape) ? { outline: outlineFor(n.properties.shape) } : {}),
      ...(n.kind === 'group' ? { textPlacement: { relativeX: 0, relativeY: 0, width: Math.min(n.width, 320), height: GROUP_METRICS.headerHeight + groupHeaderExtra(n.properties) - 12 } } : {}),
    });
    // Icon labels are obstacles too, so lines don't run through the text.
    if (n.labelBox) entities.push({ id: `${n.id}::label`, ...n.labelBox, containerId: n.parent });
  }

  const labels = new Map<string, string>();
  const styles = new Map(view.edges.map((edge) => [edge, edgeStyle(edge)]));
  const fonts = new Map(view.edges.map((edge) => [edge, edgeFontFor(edgeFont, edge)]));
  // `routing: straight` arrows skip the router.
  const connections: NewConnection[] = view.edges.filter((edge) => styles.get(edge)!.routing !== 'straight').map((edge) => {
    const text = edgeLabel(edge);
    const font = fonts.get(edge)!;
    if (text) labels.set(edge.id, text);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromArrowhead: styles.get(edge)!.startArrow,
      toArrowhead: styles.get(edge)!.endArrow,
      ...(text
        ? { textPlacement: { x: 0, y: 0, width: Math.ceil(measure(text, font) + 10), height: Math.ceil(font.size * font.lineHeight + 4) } }
        : {}),
    };
  });

  const routed = new Map<string, { points: Point[]; label?: LayoutEdge['label'] }>();
  try {
    const manager = new LayoutManager({ entities, connections: [] });
    routeCorridorConnectionBatch({ layoutManager: manager, connectionsToRoute: connections, options: { labels: true, repair: true } });
    for (const edge of view.edges) {
      if (styles.get(edge)!.routing === 'straight') continue;
      const c = manager.getConnectionById(edge.id);
      if (!c) continue;
      const points = c.points.map((p) => toPoint(p, c.x, c.y));
      const text = labels.get(edge.id);
      const tp = c.textPlacement;
      routed.set(edge.id, { points, label: text ? (tp ? { text, x: tp.x, y: tp.y, width: tp.width, height: tp.height } : midLabel(text, points, fonts.get(edge)!, measure)) : undefined });
    }
  } catch (error) {
    // The router is young (0.x); never let it take the diagram down.
    console.warn('octodraw: edge routing failed, drawing straight lines', error);
  }

  return view.edges.map((edge) => {
    const style = styles.get(edge)!;
    const r = style.routing === 'straight' ? { points: straightRoute(nodes.get(edge.from)!, nodes.get(edge.to)!), label: undefined } : (routed.get(edge.id) ?? straight(nodes.get(edge.from)!, nodes.get(edge.to)!));
    const text = edgeLabel(edge);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      points: r.points,
      ...edgeStyleFields(style),
      color: edge.color,
      count: edge.groupFan ? 1 : edge.sources.length,
      label: r.label ?? (text ? midLabel(text, r.points, fonts.get(edge)!, measure) : undefined),
    };
  });

  function straight(a: LayoutNode, b: LayoutNode) {
    return { points: [center(a), center(b)], label: undefined };
  }
}

function toPoint(p: unknown, ox: number, oy: number): Point {
  if (Array.isArray(p)) return { x: ox + (p[0] as number), y: oy + (p[1] as number) };
  const q = p as Point;
  return { x: ox + q.x, y: oy + q.y };
}

function center(n: LayoutNode): Point {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

function midLabel(text: string, points: Point[], font: { size: number; weight: number; lineHeight: number }, measure: NonNullable<LayoutOptions['measureText']>): LayoutEdge['label'] {
  // Middle of the longest segment.
  let best = 0;
  let at = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    if (len > best) [best, at] = [len, i];
  }
  const a = points[at - 1] ?? points[0] ?? { x: 0, y: 0 };
  const b = points[at] ?? a;
  const width = Math.ceil(measure(text, font) + 10);
  const height = Math.ceil(font.size * font.lineHeight + 4);
  return { text, x: (a.x + b.x) / 2 - width / 2, y: (a.y + b.y) / 2 - height / 2, width, height };
}
