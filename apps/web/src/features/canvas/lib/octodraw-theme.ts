"use client";

/**
 * octodraw themes built from our design tokens (Notion light, Endel dark),
 * so the canvas, its chrome (`--od-*` variables) and exported images share
 * the app's palette and fonts. Exports (thumbnails, figure images) always
 * use the light theme so an embed looks the same in every note.
 */
import { shadow, themes as tokens, type ThemeColors } from "@octonote/design-tokens";
import {
  darkTheme,
  lightTheme,
  type ColorScheme,
  type Theme,
} from "@octonote/octodraw";
import { JetBrains_Mono, Patrick_Hand } from "next/font/google";
import { useTheme } from "next-themes";
import { inter } from "@/features/notes/typography/fonts";

// Only downloaded when a canvas (or a figure using them) renders text in them.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

// next/font hashes family names; the resolved names work in canvas text
// measurement and are matched by octodraw's font embedding for exports.
const FONT: Theme["font"] = {
  sans: `${inter.style.fontFamily}, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  mono: `${jetbrainsMono.style.fontFamily}, ui-monospace, SFMono-Regular, Menlo, monospace`,
  rough: `${patrickHand.style.fontFamily}, "Comic Sans MS", cursive`,
};

function build(base: Theme, c: ThemeColors, chrome: string): Theme {
  return {
    ...base,
    color: {
      ...base.color,
      canvas: c["canvas-paper"],
      grid: c.border,
      surface: c.card,
      raised: c.popover,
      hover: c.accent,
      border: c["canvas-border"],
      borderStrong: c.input,
      text: c.foreground,
      textMuted: c["muted-foreground"],
      textSubtle: c["foreground-subtle"],
      // Monochrome: selection and focus use the ink color, not a hue.
      accent: c.primary,
      accentSoft: c.accent,
      onAccent: c["primary-foreground"],
      edge: c.foreground,
      focusRing: c.ring,
      danger: c.destructive,
      dangerSoft: `color-mix(in srgb, ${c.destructive} 12%, ${c.background})`,
    },
    node: { stroke: c.foreground, fill: c.card, icon: c.foreground },
    group: {
      stroke: c["foreground-subtle"],
      fills: [c.muted, c.card, c.muted],
    },
    font: FONT,
    shadow: { ...base.shadow, chrome },
  };
}

export const CANVAS_THEMES: Record<ColorScheme, Theme> = {
  light: build(lightTheme, tokens.light, shadow.md),
  dark: build(darkTheme, tokens.dark, darkTheme.shadow.chrome),
};

/** The theme exported images use (always light). */
export const EXPORT_THEME = CANVAS_THEMES.light;

/** The site's light/dark choice (system or the user's), for OctoCanvas `colorScheme`. */
export function useCanvasColorScheme(): ColorScheme {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}
