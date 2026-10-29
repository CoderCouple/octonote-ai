// octodraw design tokens. Everything visual — canvas, diagram shapes, overlay
// chrome and the playground — reads from a Theme, never from literals.
// Color scales follow Tailwind's palette (MIT) so hosts can match them easily.

export type ColorScheme = 'light' | 'dark';

/** Names accepted by `[color: ...]` in the DSL. Anything else is used as a raw CSS color. */
export const PALETTE_NAMES = [
  'blue', 'lightblue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange',
  'red', 'pink', 'purple', 'violet', 'indigo', 'brown', 'gray', 'black',
] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

interface Scale {
  50: string;
  100: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  900: string;
}

const SCALES: Record<PaletteName, Scale> = {
  blue: { 50: '#eff6ff', 100: '#dbeafe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
  lightblue: { 50: '#f0f9ff', 100: '#e0f2fe', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 900: '#0c4a6e' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 900: '#164e63' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 900: '#134e4a' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 900: '#14532d' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 900: '#365314' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 900: '#713f12' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 900: '#7c2d12' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 900: '#7f1d1d' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 900: '#831843' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 900: '#581c87' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 900: '#4c1d95' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#312e81' },
  brown: { 50: '#fdf8f6', 100: '#f2e8e5', 300: '#d2bab0', 400: '#bfa094', 500: '#a18072', 600: '#977669', 700: '#846358', 900: '#43302b' },
  gray: { 50: '#fafafa', 100: '#f4f4f5', 300: '#d4d4d8', 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 900: '#18181b' },
  black: { 50: '#f4f4f5', 100: '#e4e4e7', 300: '#a1a1aa', 400: '#71717a', 500: '#27272a', 600: '#18181b', 700: '#18181b', 900: '#09090b' },
};

/** Colors for one palette entry in one scheme. */
export interface Swatch {
  /** Outline color for colored nodes and groups (Eraser's classic renderer uses the 500 shade). */
  stroke: string;
  /** Group fills by nesting depth, cycled: tint, white, tint. */
  groupFills: readonly [string, string, string];
  /** Fill of a colored card (the 100 shade). */
  nodeFill: string;
  /** Tint of a colored icon node's glyph. */
  icon: string;
  /** Solid fill for colorMode bold. */
  solid: string;
  /** Text on the solid fill. */
  onSolid: string;
  /** Stroke icons and edge label text when the color is applied to a line. */
  ink: string;
}

export interface TextStyle {
  size: number;
  weight: number;
  lineHeight: number;
}

export interface Theme {
  scheme: ColorScheme;
  color: {
    canvas: string;
    grid: string;
    /** Card background inside colored groups and for UI surfaces. */
    surface: string;
    /** Floating chrome: breadcrumbs, zoom controls, menus. */
    raised: string;
    hover: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    accent: string;
    accentSoft: string;
    onAccent: string;
    edge: string;
    focusRing: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    success: string;
  };
  /** Uncolored cards: white with a near-black outline, as in Eraser's classic renderer. */
  node: { stroke: string; fill: string; icon: string };
  /** Uncolored groups; fills cycle by nesting depth. */
  group: { stroke: string; fills: readonly [string, string, string] };
  external: { stroke: string; fill: string; text: string };
  palette: Record<PaletteName, Swatch>;
  /** `rough` is the hand-drawn face for `typeface rough`; hosts load the font (e.g. @fontsource/patrick-hand). */
  font: { sans: string; mono: string; rough: string };
  text: { title: TextStyle; node: TextStyle; description: TextStyle; group: TextStyle; edge: TextStyle; ui: TextStyle; code: TextStyle };
  radius: { sm: number; md: number; lg: number; xl: number };
  /** 4px base spacing scale. */
  space: { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number; 8: number; 10: number; 12: number };
  stroke: { hairline: number; default: number; strong: number; edge: number };
  shadow: {
    /** Flat offset shadow behind nodes and groups (styleMode shadow). */
    shape: { dx: number; dy: number; color: string };
    chrome: string;
  };
  motion: { fast: number; normal: number; drill: number; ease: string };
}

const FONT = {
  sans: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  rough: '"Patrick Hand", "Comic Neue", "Comic Sans MS", cursive',
};

const SHARED = {
  font: FONT,
  // Sizes match Eraser's generated diagrams: 14px labels, 12px secondary text.
  text: {
    title: { size: 22, weight: 700, lineHeight: 1.25 },
    node: { size: 14, weight: 400, lineHeight: 1.3 },
    description: { size: 12, weight: 400, lineHeight: 1.35 },
    group: { size: 15, weight: 400, lineHeight: 1.3 },
    edge: { size: 13, weight: 400, lineHeight: 1.3 },
    ui: { size: 13, weight: 450, lineHeight: 1.4 },
    code: { size: 13, weight: 400, lineHeight: 1.55 },
  },
  radius: { sm: 4, md: 6, lg: 8, xl: 12 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  stroke: { hairline: 1, default: 1.25, strong: 2, edge: 1 },
  motion: { fast: 120, normal: 200, drill: 320, ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
} satisfies Partial<Theme>;

/** Pale hues whose 500 shade reads too dark as an outline next to their 100 fill. */
const LIGHT_OUTLINE_400 = new Set<PaletteName>(['yellow', 'lime']);

function palette(scheme: ColorScheme, surface: string): Record<PaletteName, Swatch> {
  const entries = PALETTE_NAMES.map((name): [PaletteName, Swatch] => {
    const s = SCALES[name];
    return [
      name,
      scheme === 'light'
        ? {
            // e.g. yellow → #fef9c3 card with a yellow outline; blue group → #eff6ff with a blue-500 border.
            stroke: LIGHT_OUTLINE_400.has(name) ? s[400] : s[500],
            groupFills: [s[50], surface, s[50]],
            nodeFill: s[100],
            icon: s[500],
            solid: s[500],
            onSolid: '#ffffff',
            ink: s[600],
          }
        : {
            stroke: s[400],
            groupFills: [mix(s[500], surface, 8), surface, mix(s[500], surface, 8)],
            nodeFill: mix(s[500], surface, 18),
            icon: s[400],
            solid: s[600],
            onSolid: '#ffffff',
            ink: s[300],
          },
    ];
  });
  return Object.fromEntries(entries) as Record<PaletteName, Swatch>;
}

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#1b1b1e';

export const lightTheme: Theme = {
  scheme: 'light',
  color: {
    canvas: '#ffffff',
    grid: '#ececee',
    surface: LIGHT_SURFACE,
    raised: '#ffffff',
    hover: '#f4f4f5',
    border: '#e4e4e7',
    borderStrong: '#d4d4d8',
    text: '#1c1c1c',
    textMuted: '#71717a',
    textSubtle: '#a1a1aa',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    onAccent: '#ffffff',
    edge: '#1c1c1c',
    focusRing: 'rgba(37, 99, 235, 0.45)',
    danger: '#dc2626',
    dangerSoft: '#fef2f2',
    warning: '#b45309',
    success: '#15803d',
  },
  node: { stroke: '#1c1c1c', fill: '#ffffff', icon: '#1c1c1c' },
  group: { stroke: '#a1a1aa', fills: ['#f4f4f5', '#ffffff', '#f4f4f5'] },
  external: { stroke: '#94a3b8', fill: '#ffffff', text: '#52525b' },
  palette: palette('light', LIGHT_SURFACE),
  shadow: {
    shape: { dx: 4, dy: 4, color: 'rgba(15, 23, 42, 0.07)' },
    chrome: '0 1px 2px rgba(24, 24, 27, 0.06), 0 1px 3px rgba(24, 24, 27, 0.04)',
  },
  ...SHARED,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  color: {
    canvas: '#111113',
    grid: '#2a2a2e',
    surface: DARK_SURFACE,
    raised: '#1c1c1f',
    hover: '#27272a',
    border: '#2e2e33',
    borderStrong: '#3f3f46',
    text: '#ececee',
    textMuted: '#a1a1aa',
    textSubtle: '#71717a',
    accent: '#60a5fa',
    accentSoft: 'rgba(96, 165, 250, 0.12)',
    onAccent: '#0b1220',
    edge: '#c4c4cc',
    focusRing: 'rgba(96, 165, 250, 0.5)',
    danger: '#f87171',
    dangerSoft: 'rgba(248, 113, 113, 0.12)',
    warning: '#fbbf24',
    success: '#4ade80',
  },
  node: { stroke: '#a1a1aa', fill: DARK_SURFACE, icon: '#ececee' },
  group: { stroke: '#52525b', fills: ['#18181b', '#111113', '#18181b'] },
  external: { stroke: '#52525b', fill: '#111113', text: '#a1a1aa' },
  palette: palette('dark', DARK_SURFACE),
  shadow: {
    shape: { dx: 4, dy: 4, color: 'rgba(0, 0, 0, 0.35)' },
    chrome: '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.25)',
  },
  ...SHARED,
};

export const themes: Record<ColorScheme, Theme> = { light: lightTheme, dark: darkTheme };

/** CSS custom properties for a theme, e.g. `--od-color-canvas`, for hosts that style around the canvas. */
export function themeCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.color)) vars[`--od-color-${kebab(key)}`] = value;
  vars['--od-font-sans'] = theme.font.sans;
  vars['--od-font-mono'] = theme.font.mono;
  for (const [key, value] of Object.entries(theme.radius)) vars[`--od-radius-${key}`] = `${value}px`;
  for (const [key, value] of Object.entries(theme.space)) vars[`--od-space-${key}`] = `${value}px`;
  for (const [key, style] of Object.entries(theme.text)) vars[`--od-text-${key}`] = `${style.weight} ${style.size}px/${style.lineHeight} ${key === 'code' ? theme.font.mono : theme.font.sans}`;
  vars['--od-shadow-chrome'] = theme.shadow.chrome;
  vars['--od-motion-fast'] = `${theme.motion.fast}ms`;
  vars['--od-motion-normal'] = `${theme.motion.normal}ms`;
  vars['--od-ease'] = theme.motion.ease;
  return vars;
}

function mix(color: string, base: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, ${base})`;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
