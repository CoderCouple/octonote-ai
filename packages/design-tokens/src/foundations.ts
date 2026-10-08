/** Non-color foundations. Same in both themes. */

export const font = {
  /** Inter — the open typeface Notion's own UI font is built on. `--font-inter` is set by next/font. */
  sans: 'var(--font-inter), Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
} as const;

/** Type scale (px). Display sizes are for marketing; the app mostly lives in body/sm. */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  /** Marketing intro paragraphs. */
  lead: 22,
  "2xl": 24,
  "3xl": 30,
  "4xl": 40,
  display: 56,
  "display-lg": 72,
  "display-xl": 96,
  /** Hero headline only. */
  "display-2xl": 120,
} as const;

export const letterSpacing = {
  display: "-0.035em",
  heading: "-0.02em",
  normal: "0",
  caps: "0.08em",
} as const;

export const radius = {
  base: "0.5rem",
} as const;

export const shadow = {
  /** Notion-style: barely-there elevation built from layered low-opacity shadows. */
  sm: "0 1px 2px rgba(15, 15, 15, 0.06)",
  md: "0 0 0 1px rgba(15, 15, 15, 0.04), 0 3px 6px rgba(15, 15, 15, 0.08)",
  lg: "0 0 0 1px rgba(15, 15, 15, 0.04), 0 8px 24px rgba(15, 15, 15, 0.10), 0 24px 64px rgba(15, 15, 15, 0.08)",
} as const;

/** Motion. Calm and short; animations explain features rather than decorate. */
export const motion = {
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
  easeEmphasized: "cubic-bezier(0.3, 0, 0, 1)",
  durationFast: "120ms",
  durationBase: "200ms",
  durationSlow: "420ms",
  /** Feature demos: time per step and the pause on the final frame (ms, used by JS). */
  demoStepMs: 900,
  demoHoldMs: 2600,
} as const;
