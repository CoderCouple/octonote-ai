/** SVG path helpers, angles in degrees clockwise from 12 o'clock. */

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;

/** Rounds to 0.01: server and browser trig can differ in the last digits, which breaks hydration. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [r2(cx + r * Math.cos(rad(deg))), r2(cy + r * Math.sin(rad(deg)))];
}

/** A ring segment (or a pie wedge when inner is 0) from a0 to a1. */
export function arcPath(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number): string {
  const sweep = a1 - a0;
  if (sweep >= 359.99) {
    // A full ring: two half arcs (an SVG arc can't start and end at one point).
    return `${arcPath(cx, cy, outer, inner, a0, a0 + 180)} ${arcPath(cx, cy, outer, inner, a0 + 180, a0 + 359.99)}`;
  }
  const large = sweep > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, a0);
  const [x1, y1] = polar(cx, cy, outer, a1);
  if (inner <= 0) return `M${cx},${cy} L${x0},${y0} A${outer},${outer} 0 ${large} 1 ${x1},${y1} Z`;
  const [x2, y2] = polar(cx, cy, inner, a1);
  const [x3, y3] = polar(cx, cy, inner, a0);
  return `M${x0},${y0} A${outer},${outer} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z`;
}

/** An open arc along a circle, for cycle arrows. */
export function arcLine(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
}

/** Round "nice" ticks for an axis from 0 (or min) to max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}
