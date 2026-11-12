/** Scene colours: palette names (resolved per theme) or #rrggbb. */
export const PALETTE_NAMES = ["blue", "green", "orange", "purple", "red", "teal", "yellow", "pink", "gray", "ink", "muted"] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export type Rgb = [number, number, number];

export interface SceneTheme {
  background: string;
  palette: Record<PaletteName, string>;
}

export const DARK_THEME: SceneTheme = {
  background: "#0f1115",
  palette: { blue: "#5aa2ff", green: "#4fcf95", orange: "#f2a04e", purple: "#a98bff", red: "#ff7b73", teal: "#3fc9c9", yellow: "#f0c050", pink: "#ff7fbf", gray: "#8b8a86", ink: "#f2f2ef", muted: "#a09f9b" },
};

export const LIGHT_THEME: SceneTheme = {
  background: "#fbfbfa",
  palette: { blue: "#1f6fe0", green: "#1f9d6b", orange: "#d9771e", purple: "#7a47d5", red: "#d1453b", teal: "#0f8a8a", yellow: "#c99a12", pink: "#c43f87", gray: "#8b8a86", ink: "#191919", muted: "#6b6a66" },
};

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
}

export function resolveColor(color: string | undefined, theme: SceneTheme, fallback: PaletteName = "ink"): Rgb {
  if (color && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) return hexToRgb(color);
  const name = (color && color in theme.palette ? color : fallback) as PaletteName;
  return hexToRgb(theme.palette[name]);
}

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgbCss = (c: Rgb, alpha = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.round(alpha * 1000) / 1000})`;
