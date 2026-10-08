/**
 * Mobile palette, read from the shared design system so the native shell
 * matches the web app (and the web editors it hosts). Edit colors in
 * packages/design-tokens, not here.
 */
import { themes } from "@octonote/design-tokens";
import { useColorScheme } from "react-native";

function palette(scheme: "light" | "dark") {
  const t = themes[scheme];
  return {
    background: t.background,
    /** Grouped-list backdrop (settings). Pure white in light, like Notion. */
    grouped: scheme === "light" ? t["surface-subtle"] : t.background,
    card: t.card,
    text: t.foreground,
    textSecondary: t["muted-foreground"],
    separator: t.border,
    tint: t.primary,
    pressed: t.accent,
    danger: t.destructive,
  };
}

export type Palette = ReturnType<typeof palette>;

const light = palette("light");
const dark = palette("dark");

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
