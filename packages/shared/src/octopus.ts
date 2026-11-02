/**
 * The Octonote octopus: octopod's body with our face (capsule eyes, a small
 * smile). One source for web, mobile, the API (assistant card) and the asset
 * generator (`scripts/brand-assets.mjs`).
 *
 * Two colours: `ink` fills the body; the face is cut out in `paper`. Light
 * mode = black ink on white paper, dark mode = white ink on black paper
 * (paper is the surface the mark sits on).
 */
export type OctopusMood = "happy" | "waiting" | "error" | "sleepy";

export const OCTOPUS_MOODS: OctopusMood[] = ["happy", "waiting", "error", "sleepy"];

export const OCTOPUS_VIEWBOX = "0 0 512 512";

export const OCTOPUS_BODY =
  "M440.86,303.607c-27.106,0-59.31-6.311-68.409-24.022c-5.41-10.534,0.128-22.059,5.728-29.872c21.037-29.36,32.158-62.108,32.158-94.703C410.336,69.538,341.101,0,255.999,0S101.662,69.538,101.662,155.01c0,32.595,11.12,65.343,32.158,94.703c5.598,7.813,11.138,19.339,5.728,29.872c-9.099,17.712-41.303,24.022-68.409,24.022c-30.01,0-54.424,24.497-54.424,54.609s24.415,54.609,54.424,54.609c13.878,0,32.714-3.057,49.694-7.208c-3.563,2.705-7.187,5.417-10.638,7.91c-21.305,15.39-28.094,40.131-17.718,64.568c6.132,14.441,18.071,25.704,32.76,30.902c13.514,4.781,27.708,3.827,39.96-2.695c35.939-19.129,59.199-51.213,76.181-74.639c4.617-6.369,10.521-14.513,14.62-19.001c4.099,4.489,10.003,12.633,14.621,19.001c16.983,23.426,40.242,55.509,76.181,74.639c7.114,3.786,14.882,5.698,22.793,5.698c5.713,0,11.5-0.997,17.168-3.002c14.688-5.197,26.629-16.46,32.76-30.902c10.375-24.438,3.587-49.178-17.717-64.568c-3.453-2.493-7.075-5.206-10.639-7.91c16.979,4.15,35.818,7.208,49.694,7.208c30.01,0,54.424-24.497,54.424-54.609C495.285,328.106,470.87,303.607,440.86,303.607z";

/** One part of a face, drawn in `paper`: a filled rect/circle, or a stroked path. */
export type OctopusFacePart =
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { kind: "circle"; cx: number; cy: number; r: number; /** Pulses in turn (the "…" of waiting). */ pulse?: number }
  | { kind: "stroke"; d: string; width: number };

export const OCTOPUS_FACES: Record<OctopusMood, OctopusFacePart[]> = {
  happy: [
    { kind: "rect", x: 187, y: 146, width: 34, height: 54, rx: 17 },
    { kind: "rect", x: 291, y: 146, width: 34, height: 54, rx: 17 },
    { kind: "stroke", d: "M234 230 Q256 248 278 230", width: 15 },
  ],
  waiting: [
    { kind: "rect", x: 199, y: 140, width: 32, height: 48, rx: 16 },
    { kind: "rect", x: 303, y: 140, width: 32, height: 48, rx: 16 },
    { kind: "circle", cx: 234, cy: 238, r: 10, pulse: 0 },
    { kind: "circle", cx: 256, cy: 238, r: 10, pulse: 1 },
    { kind: "circle", cx: 278, cy: 238, r: 10, pulse: 2 },
  ],
  error: [
    { kind: "stroke", d: "M187 156 L221 190", width: 15 },
    { kind: "stroke", d: "M221 156 L187 190", width: 15 },
    { kind: "stroke", d: "M291 156 L325 190", width: 15 },
    { kind: "stroke", d: "M325 156 L291 190", width: 15 },
    { kind: "stroke", d: "M224 242 Q235 232 246 242 Q257 252 268 242 Q278 234 288 242", width: 14 },
  ],
  sleepy: [
    { kind: "stroke", d: "M186 172 Q204 190 222 172", width: 15 },
    { kind: "stroke", d: "M290 172 Q308 190 326 172", width: 15 },
    { kind: "stroke", d: "M242 234 Q256 242 270 234", width: 15 },
  ],
};

/** What each mood is for (the brand page and docs use these). */
export const OCTOPUS_MOOD_INFO: Record<OctopusMood, { name: string; use: string }> = {
  happy: { name: "Default", use: "The logo: app icon, nav, favicon, emails, published pages." },
  waiting: { name: "In progress", use: "Uploads, imports, an assistant working. The dots pulse." },
  error: { name: "Error", use: "A failed save, a missing page, no access. Crossed-out eyes, a wiggly mouth." },
  sleepy: { name: "Offline / empty", use: "Offline, signed out, nothing here yet." },
};

/** Keyframes for the waiting dots (`.octo-p0`–`.octo-p2`); off with reduced motion. */
export const OCTOPUS_PULSE_CSS =
  "@keyframes octo-pulse{0%,100%{opacity:1}50%{opacity:.2}}.octo-p0{animation:octo-pulse 1.2s ease-in-out infinite}.octo-p1{animation:octo-pulse 1.2s ease-in-out .2s infinite}.octo-p2{animation:octo-pulse 1.2s ease-in-out .4s infinite}@media (prefers-reduced-motion:reduce){.octo-p0,.octo-p1,.octo-p2{animation:none}}";

/**
 * The octopus as an SVG string. `ink`/`paper` may be any CSS colour, including
 * `currentColor` or `var(--x)`. `animate` adds the waiting dots' pulse.
 */
export function octopusSvg(opts: { mood?: OctopusMood; ink?: string; paper?: string; size?: number; title?: string; animate?: boolean } = {}): string {
  const { mood = "happy", ink = "#000000", paper = "#ffffff", size, title, animate = false } = opts;
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const label = title ? ` role="img" aria-label="${title}"` : ` aria-hidden="true"`;
  const face = OCTOPUS_FACES[mood]
    .map((p) => {
      if (p.kind === "rect") return `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.rx}" fill="${paper}"/>`;
      if (p.kind === "circle") return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${paper}"${animate && p.pulse !== undefined ? ` class="octo-p${p.pulse}"` : ""}/>`;
      return `<path d="${p.d}" fill="none" stroke="${paper}" stroke-width="${p.width}" stroke-linecap="round"/>`;
    })
    .join("");
  const style = animate && mood === "waiting" ? `<style>${OCTOPUS_PULSE_CSS}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${OCTOPUS_VIEWBOX}"${dims}${label}>${style}<path fill="${ink}" d="${OCTOPUS_BODY}"/>${face}</svg>`;
}
