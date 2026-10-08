/**
 * Renders the tokens as CSS for the web app: theme variables for :root and
 * .dark, plus the Tailwind v4 @theme mapping that turns them into utilities.
 */
import { colorTokenNames, dark, light, type ThemeColors } from "./themes";
import { font, fontSize, letterSpacing, motion, radius, shadow } from "./foundations";

const rem = (px: number) => `${px / 16}rem`;

function vars(colors: ThemeColors, indent = "  "): string {
  return colorTokenNames.map((name) => `${indent}--${name}: ${colors[name]};`).join("\n");
}

export function renderCss(): string {
  const header =
    "/* GENERATED from packages/design-tokens/src — do not edit by hand.\n" +
    " * Regenerate: pnpm --filter @octonote/design-tokens build */";

  const root = [
    ":root {",
    vars(light),
    `  --radius: ${radius.base};`,
    `  --font-family-sans: ${font.sans};`,
    `  --font-family-serif: ${font.serif};`,
    `  --font-family-mono: ${font.mono};`,
    `  --duration-fast: ${motion.durationFast};`,
    `  --duration-base: ${motion.durationBase};`,
    `  --duration-slow: ${motion.durationSlow};`,
    "  color-scheme: light;",
    "}",
  ].join("\n");

  const darkBlock = [".dark {", vars(dark), "  color-scheme: dark;", "}"].join("\n");

  const lineHeight: Record<keyof typeof fontSize, number> = {
    xs: 1.5,
    sm: 1.5,
    base: 1.6,
    lg: 1.55,
    xl: 1.5,
    lead: 1.5,
    "2xl": 1.3,
    "3xl": 1.2,
    "4xl": 1.1,
    display: 1.05,
    "display-lg": 1.02,
    "display-xl": 1,
    "display-2xl": 0.98,
  };
  const tracking: Partial<Record<keyof typeof fontSize, string>> = {
    "3xl": letterSpacing.heading,
    "4xl": letterSpacing.heading,
    display: letterSpacing.display,
    "display-lg": letterSpacing.display,
    "display-xl": letterSpacing.display,
    "display-2xl": "-0.04em",
  };

  const theme = [
    "@theme inline {",
    ...colorTokenNames.map((name) => `  --color-${name}: var(--${name});`),
    "  --font-sans: var(--font-family-sans);",
    "  --font-serif: var(--font-family-serif);",
    "  --font-mono: var(--font-family-mono);",
    ...Object.entries(fontSize).flatMap(([name, px]) => {
      const key = name as keyof typeof fontSize;
      return [
        `  --text-${name}: ${rem(px)};`,
        `  --text-${name}--line-height: ${lineHeight[key]};`,
        ...(tracking[key] ? [`  --text-${name}--letter-spacing: ${tracking[key]};`] : []),
      ];
    }),
    `  --tracking-display: ${letterSpacing.display};`,
    `  --tracking-heading: ${letterSpacing.heading};`,
    `  --tracking-caps: ${letterSpacing.caps};`,
    "  --radius-sm: calc(var(--radius) - 4px);",
    "  --radius-md: calc(var(--radius) - 2px);",
    "  --radius-lg: var(--radius);",
    "  --radius-xl: calc(var(--radius) + 4px);",
    "  --radius-2xl: calc(var(--radius) + 8px);",
    ...Object.entries(shadow).map(([name, value]) => `  --shadow-${name}: ${value};`),
    `  --ease-standard: ${motion.easeStandard};`,
    `  --ease-emphasized: ${motion.easeEmphasized};`,
    "}",
  ].join("\n");

  return `${header}\n\n${root}\n\n${darkBlock}\n\n${theme}\n`;
}
