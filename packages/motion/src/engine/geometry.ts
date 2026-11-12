/**
 * Shapes as point lists in scene units (y up, origin at the centre). Every
 * outline-type shape becomes points, so any shape can morph into any other
 * (resample both to the same count, interpolate), be traced along, or be drawn
 * stroke by stroke.
 */
export type Point = [number, number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SAMPLES = 96;

export function circlePoints(cx: number, cy: number, rx: number, ry = rx, start = 0, end = 360, n = SAMPLES): Point[] {
  const full = Math.abs(end - start) >= 360;
  const count = full ? n : Math.max(8, Math.round((n * Math.abs(end - start)) / 360));
  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    if (full && i === count) break;
    const a = ((start + ((end - start) * i) / count) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return points;
}

export function rectPoints(cx: number, cy: number, w: number, h: number, radius = 0): Point[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) return [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
  // Rounded corners as short arcs, clockwise from the top-left.
  const corner = (cx2: number, cy2: number, from: number) => circlePoints(cx2, cy2, r, r, from, from - 90, 8).slice(0, 8);
  return [...corner(x0 + r, y1 - r, 180), ...corner(x1 - r, y1 - r, 90), ...corner(x1 - r, y0 + r, 0), ...corner(x0 + r, y0 + r, -90)];
}

export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = 90): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((rotation + (360 * i) / sides) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

/** A smooth curve through the points (Catmull-Rom), sampled densely. */
export function smoothCurve(points: readonly Point[], perSegment = 12): Point[] {
  if (points.length < 3) return [...points];
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** A curly brace from a to b, bulging to the left of the a→b direction by `depth`. */
export function bracePoints(a: Point, b: Point, depth = 0.25): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * depth;
  const ny = ux * depth;
  const at = (t: number, k: number): Point => [a[0] + dx * t + nx * k, a[1] + dy * t + ny * k];
  return smoothCurve([at(0, 0), at(0.08, 0.5), at(0.42, 0.5), at(0.5, 1), at(0.58, 0.5), at(0.92, 0.5), at(1, 0)], 10);
}

export function pathLength(points: readonly Point[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  if (closed && points.length > 2) total += Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1]);
  return total;
}

/** The point a fraction t (0…1) of the way along the path, by length. */
export function pointAlong(points: readonly Point[], t: number, closed = false): Point {
  if (!points.length) return [0, 0];
  const ring = closed ? [...points, points[0]!] : points;
  const total = pathLength(ring, false);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!;
    const b = ring[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (target <= seg || i === ring.length - 1) {
      const f = seg ? Math.min(1, target / seg) : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= seg;
  }
  return ring.at(-1)!;
}

/** Evenly spaced points along the path, so two shapes can be interpolated point by point. */
export function resample(points: readonly Point[], n: number, closed: boolean): Point[] {
  if (!points.length) return Array.from({ length: n }, () => [0, 0] as Point);
  return Array.from({ length: n }, (_, i) => pointAlong(points, closed ? i / n : i / (n - 1), closed));
}

/**
 * Points of `from` turning into `to`. Closed shapes are rotated so their
 * starting points line up, which keeps the morph from twisting.
 */
export function morphPoints(from: readonly Point[], to: readonly Point[], t: number, closed: boolean): Point[] {
  const a = resample(from, SAMPLES, closed);
  let b = resample(to, SAMPLES, closed);
  if (closed) {
    let best = 0;
    let bestCost = Infinity;
    for (let shift = 0; shift < SAMPLES; shift += 2) {
      let cost = 0;
      for (let i = 0; i < SAMPLES; i += 4) {
        const p = a[i]!;
        const q = b[(i + shift) % SAMPLES]!;
        cost += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = shift;
      }
    }
    b = b.map((_, i) => b[(i + best) % SAMPLES]!);
  }
  return a.map((p, i) => [p[0] + (b[i]![0] - p[0]) * t, p[1] + (b[i]![1] - p[1]) * t]);
}

export function bounds(points: readonly Point[]): Box {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** Where a ray from a box's centre towards `toward` leaves the box (for arrows between things). */
export function boxEdge(box: Box, toward: Point, round = false): Point {
  const dx = toward[0] - box.x;
  const dy = toward[1] - box.y;
  if (!dx && !dy) return [box.x, box.y];
  if (round) {
    const r = Math.max(box.w, box.h) / 2;
    const len = Math.hypot(dx, dy);
    return [box.x + (dx / len) * r, box.y + (dy / len) * r];
  }
  const s = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity);
  return [box.x + dx * s, box.y + dy * s];
}

export function rotatePoint(p: Point, center: Point, degrees: number): Point {
  if (!degrees) return p;
  const a = (degrees * Math.PI) / 180;
  const x = p[0] - center[0];
  const y = p[1] - center[1];
  return [center[0] + x * Math.cos(a) - y * Math.sin(a), center[1] + x * Math.sin(a) + y * Math.cos(a)];
}
