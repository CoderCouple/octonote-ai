export type Point = { x: number; y: number };

export type DetectedShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rectangle"; x: number; y: number; w: number; h: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | null;

export interface DetectionDebug {
  pointCount: number;
  pathLength: number;
  bboxAspect: number;
  closure: number;
  straightness: number;
  cornerCount: number;
  radiusCoefVar: number;
  rectAnglesOk: number;
  decision: string;
}

export function detectShapeVerbose(points: Point[]): {
  shape: DetectedShape;
  debug: DetectionDebug;
} {
  const debug: DetectionDebug = {
    pointCount: points.length,
    pathLength: 0,
    bboxAspect: 0,
    closure: 0,
    straightness: 0,
    cornerCount: 0,
    radiusCoefVar: 0,
    rectAnglesOk: 0,
    decision: "skip-too-few-points",
  };

  if (points.length < 6) return { shape: null, debug };

  const perimeter = pathLength(points);
  debug.pathLength = perimeter;
  if (perimeter < 30) {
    debug.decision = "skip-too-short";
    return { shape: null, debug };
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const directGap = distance(first, last);
  debug.straightness = directGap / perimeter;
  debug.closure = 1 - directGap / perimeter;

  if (debug.straightness > 0.92) {
    debug.decision = "line";
    return {
      shape: { kind: "line", x1: first.x, y1: first.y, x2: last.x, y2: last.y },
      debug,
    };
  }

  const bbox = boundingBox(points);
  if (bbox.w === 0 || bbox.h === 0) {
    debug.decision = "skip-degenerate-bbox";
    return { shape: null, debug };
  }
  debug.bboxAspect = bbox.w / bbox.h;

  const isClosed = directGap / Math.max(bbox.w, bbox.h) < 0.5;
  if (!isClosed) {
    debug.decision = "skip-not-closed";
    return { shape: null, debug };
  }

  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const meanR = avg(radii);
  const stdR =
    meanR > 0 ? Math.sqrt(avg(radii.map((r) => (r - meanR) ** 2))) / meanR : Infinity;
  debug.radiusCoefVar = stdR;

  const simplified = rdp(points, Math.max(2, perimeter * 0.04));
  const corners = simplified.length - 1;
  debug.cornerCount = corners;

  if (corners >= 4 && corners <= 7) {
    const rectMetrics = scoreRectangleCorners(simplified);
    debug.rectAnglesOk = rectMetrics.rightAngles;
    if (rectMetrics.rightAngles >= 3) {
      debug.decision = "rectangle";
      return {
        shape: { kind: "rectangle", x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
        debug,
      };
    }
  }

  if (stdR < 0.22 && corners >= 6) {
    if (debug.bboxAspect > 0.8 && debug.bboxAspect < 1.25) {
      debug.decision = "circle";
      const r = Math.max(bbox.w, bbox.h) / 2;
      return { shape: { kind: "circle", cx, cy, r }, debug };
    }
    debug.decision = "ellipse";
    return {
      shape: {
        kind: "ellipse",
        cx,
        cy,
        rx: bbox.w / 2,
        ry: bbox.h / 2,
      },
      debug,
    };
  }

  debug.decision = "no-match";
  return { shape: null, debug };
}

export function detectShape(points: Point[]): DetectedShape {
  return detectShapeVerbose(points).shape;
}

function scoreRectangleCorners(simplified: Point[]): { rightAngles: number } {
  const closed = simplified.slice(0, simplified.length - 1);
  let rightAngles = 0;
  for (let i = 0; i < closed.length; i++) {
    const a = closed[(i - 1 + closed.length) % closed.length]!;
    const b = closed[i]!;
    const c = closed[(i + 1) % closed.length]!;
    const angle = cornerAngle(a, b, c);
    if (Math.abs(angle - Math.PI / 2) < 0.45) rightAngles++;
  }
  return { rightAngles };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

function boundingBox(points: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function cornerAngle(a: Point, b: Point, c: Point): number {
  const ax = a.x - b.x,
    ay = a.y - b.y;
  const cx = c.x - b.x,
    cy = c.y - b.y;
  const dot = ax * cx + ay * cy;
  const mag = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  if (mag === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag)));
}

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return distance(p, a);
  return Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len;
}
