import type { LayoutEntity } from '@eraserlabs/layout';
import type { LayoutNode, Point } from './layout';

// Outlines of the drawn shapes, shared by the corridor router (so arrows meet
// the drawn edge) and by `routing: straight` arrows, which run in a straight
// line from one outline to the other.

/** True outlines (0–100 frame) so arrows attach to the drawn shape, not its bounding box. */
export function outlineFor(shape: string | undefined): LayoutEntity['outline'] {
  switch (shape) {
    case 'diamond':
      return { kind: 'polygon', vertices: [[50, 0], [100, 50], [50, 100], [0, 50]] };
    case 'triangle':
      return { kind: 'polygon', vertices: [[50, 0], [100, 100], [0, 100]] };
    case 'hexagon':
      return { kind: 'polygon', vertices: [[12, 0], [88, 0], [100, 50], [88, 100], [12, 100], [0, 50]] };
    case 'parallelogram':
      return { kind: 'polygon', vertices: [[12, 0], [100, 0], [88, 100], [0, 100]] };
    case 'trapezoid':
      return { kind: 'polygon', vertices: [[12, 0], [88, 0], [100, 100], [0, 100]] };
    case 'ellipse':
    case 'circle':
      return { kind: 'ellipse' };
    default:
      return undefined;
  }
}

type Box = Pick<LayoutNode, 'x' | 'y' | 'width' | 'height'> & Partial<Pick<LayoutNode, 'variant' | 'properties'>>;

const centerOf = (n: Box): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

/**
 * Where the ray from a node's centre in direction (dx, dy) leaves its outline,
 * as a multiple of (dx, dy). Undefined when it can't be found.
 */
function exitScale(n: Box, dx: number, dy: number): number | undefined {
  const hw = n.width / 2;
  const hh = n.height / 2;
  if (hw <= 0 || hh <= 0 || (dx === 0 && dy === 0)) return undefined;
  const outline = n.variant === 'card' ? outlineFor(n.properties?.shape) : undefined;
  if (outline?.kind === 'ellipse') return 1 / Math.hypot(dx / hw, dy / hh);
  if (outline?.kind === 'polygon') {
    const pts = outline.vertices.map(([px, py]) => ({ x: ((px - 50) / 50) * hw, y: ((py - 50) / 50) * hh }));
    let best: number | undefined;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      // Solve t·d = a + s·(b − a) for t > 0, 0 ≤ s ≤ 1.
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const det = dx * -ey - dy * -ex;
      if (Math.abs(det) < 1e-9) continue;
      const t = (a.x * -ey - a.y * -ex) / det;
      const s = (dx * a.y - dy * a.x) / det;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && (best === undefined || t < best)) best = t;
    }
    return best;
  }
  return Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
}

/** A straight line from `a`'s outline to `b`'s, along the line between their centres. */
export function straightRoute(a: Box, b: Box): Point[] {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const ta = exitScale(a, dx, dy);
  const tb = exitScale(b, -dx, -dy);
  // Overlapping boxes (or a box inside a group): fall back to centre to centre.
  if (ta === undefined || tb === undefined || ta + tb >= 1) return [ca, cb];
  return [
    { x: ca.x + dx * ta, y: ca.y + dy * ta },
    { x: cb.x - dx * tb, y: cb.y - dy * tb },
  ];
}
