import type { Diagnostic } from '../dsl/types';
import type { DiagramLayout, LayoutEdge, LayoutNode, Point } from '../layout/layout';
import { groupTitle } from '../layout/layout';

// Imports the positioned JSON that Eraser generates (Shape / Group /
// Relationship / Textbox elements, the eraser-diagrams element vocabulary) so
// it can be rendered as-is: as a fidelity reference and as an input format.

interface EraserText {
  text: string;
  fontSize?: number;
  color?: string;
}

interface EraserElement {
  tag: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  containerId?: string;
  // Shape
  icon?: string;
  shape?: string;
  texts?: EraserText[];
  bgColor?: string;
  borderColor?: string;
  color?: string;
  // Group
  title?: { text?: string; icon?: string };
  // Relationship
  from?: string;
  to?: string;
  label?: string;
  labelPlacement?: { x: number; y: number; width: number; height: number };
  points?: [number, number][];
  startArrowhead?: string;
  endArrowhead?: string;
  lineStyle?: string;
  lineWidth?: number;
  // Textbox
  text?: string;
}

export interface ImportedDiagram {
  title?: string;
  layout: DiagramLayout;
  diagnostics: Diagnostic[];
}

/** Eraser's default line color; mapped to the theme's edge color so dark mode works. */
const DEFAULT_LINE = '#1c1c1c';
const PADDING = 24;

export function looksLikeEraserJson(source: string): boolean {
  return /^\s*\{/.test(source);
}

export function importEraserJson(source: string): ImportedDiagram {
  const diagnostics: Diagnostic[] = [];
  let doc: { title?: string; elements?: EraserElement[] };
  try {
    doc = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = /position (\d+)/.exec(message);
    const line = position ? source.slice(0, Number(position[1])).split('\n').length : 1;
    diagnostics.push({ severity: 'error', message: `Invalid JSON: ${message}`, line, column: 1, endColumn: 2 });
    return { layout: { width: 0, height: 0, nodes: [], edges: [] }, diagnostics };
  }
  const elements = Array.isArray(doc.elements) ? doc.elements : [];
  const byId = new Map(elements.map((e) => [e.id, e]));
  const depthOf = (e: EraserElement): number => {
    let depth = 0;
    for (let cur = e.containerId; cur && depth < 32; cur = byId.get(cur)?.containerId) depth++;
    return depth;
  };

  let title: string | undefined;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  for (const e of elements) {
    if (e.tag === 'Textbox') {
      title ??= e.text?.replace(/^#+\s*/, '');
      continue;
    }
    if (e.tag === 'Shape' || e.tag === 'Group' || e.tag === 'Icon') {
      const isGroup = e.tag === 'Group';
      const texts = e.texts ?? [];
      nodes.push({
        id: e.id,
        kind: isGroup ? 'group' : 'node',
        variant: e.tag === 'Icon' ? 'icon' : 'card',
        labelBox: e.tag === 'Icon' ? iconLabelBox(e) : undefined,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        lines: isGroup ? [groupTitle(e.title?.text ?? e.id, undefined)] : [texts[0]?.text ?? ''],
        description: isGroup ? [] : texts.slice(1).map((t) => t.text),
        properties: {
          ...(e.icon || e.title?.icon ? { icon: (e.icon ?? e.title?.icon)! } : {}),
          ...(e.shape ? { shape: e.shape } : {}),
          ...(e.color ? { color: e.color } : {}),
        },
        style: { fill: normalizeColor(e.bgColor), stroke: normalizeColor(e.borderColor) },
        parent: e.containerId ?? null,
        depth: depthOf(e),
        hiddenCount: 0,
      });
      continue;
    }
    if (e.tag === 'Relationship' && e.from && e.to) {
      const points: Point[] = (e.points ?? []).map(([px, py]) => ({ x: e.x + px, y: e.y + py }));
      const placement = e.labelPlacement;
      edges.push({
        id: e.id,
        from: e.from,
        to: e.to,
        points,
        startArrow: !!e.startArrowhead && e.startArrowhead !== 'none',
        endArrow: !!e.endArrowhead && e.endArrowhead !== 'none',
        dashed: e.lineStyle === 'dashed' || e.lineStyle === 'dotted',
        color: e.color && e.color.toLowerCase() !== DEFAULT_LINE ? e.color : undefined,
        count: 1,
        label: e.label
          ? placement
            ? { text: e.label, x: e.x + placement.x, y: e.y + placement.y, width: placement.width, height: placement.height }
            : midpointLabel(e.label, points)
          : undefined,
      });
      continue;
    }
    diagnostics.push({ severity: 'warning', message: `Unsupported element '${e.tag}' (${e.id})`, line: 1, column: 1, endColumn: 2 });
  }

  // Parents before children, as the renderer expects; then normalize to a padded origin.
  nodes.sort((a, b) => a.depth - b.depth);
  const boxes = [...nodes, ...nodes.flatMap((n) => (n.labelBox ? [n.labelBox] : []))];
  const xs = [...boxes.flatMap((b) => [b.x, b.x + b.width]), ...edges.flatMap((e) => e.points.map((p) => p.x))];
  const ys = [...boxes.flatMap((b) => [b.y, b.y + b.height]), ...edges.flatMap((e) => e.points.map((p) => p.y))];
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const dx = PADDING - minX;
  const dy = PADDING - minY;
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
  return {
    title: title ?? doc.title,
    layout: { width: Math.max(...xs, 0) + dx + PADDING, height: Math.max(...ys, 0) + dy + PADDING, nodes, edges },
    diagnostics,
  };
}

/** Eraser centers an Icon's texts under its box; approximate the block for rendering. */
function iconLabelBox(e: EraserElement): { x: number; y: number; width: number; height: number } {
  const texts = e.texts ?? [];
  const height = texts.reduce((h, t) => h + (t.fontSize ?? 14) * 1.3, 0);
  const width = Math.max(...texts.map((t) => t.text.length * (t.fontSize ?? 14) * 0.56), e.width);
  return { x: e.x + e.width / 2 - width / 2, y: e.y + e.height + 8, width, height };
}

function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return color === 'white' ? '#ffffff' : color;
}

function midpointLabel(text: string, points: Point[]): LayoutEdge['label'] {
  const mid = points[Math.floor((points.length - 1) / 2)] ?? { x: 0, y: 0 };
  const next = points[Math.floor((points.length - 1) / 2) + 1] ?? mid;
  const width = text.length * 6.5 + 8;
  return { text, x: (mid.x + next.x) / 2 - width / 2, y: (mid.y + next.y) / 2 - 8, width, height: 16 };
}
