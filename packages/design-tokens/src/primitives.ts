/**
 * Raw palette. Components never use these directly — they use the semantic
 * tokens in ./themes.ts. Monochrome by design: a warm-gray ramp (Notion's
 * neutrals) and a cool near-black ramp (Endel's night). The only hue is red,
 * reserved for destructive actions.
 */
export const warm = {
  0: "#FFFFFF",
  25: "#FBFBFA",
  50: "#F7F6F3",
  100: "#F1F1EF",
  150: "#E9E9E7",
  200: "#E3E2E0",
  300: "#D3D1CB",
  400: "#9B9A97",
  500: "#787774",
  /** #787774 is 4.48:1 on white — just under WCAG AA; this is the readable muted text. */
  550: "#73726E",
  600: "#5F5E5B",
  700: "#37352F",
  900: "#191919",
} as const;

export const night = {
  0: "#F5F5F4",
  100: "#EDEDEC",
  300: "#B4B4B2",
  400: "#8E8E8C",
  500: "#5E5E5C",
  700: "#2A2A2C",
  750: "#232325",
  800: "#1C1C1E",
  850: "#141415",
  900: "#0E0E0F",
  950: "#0A0A0B",
  1000: "#000000",
} as const;

export const red = {
  light: "#D44C47",
  dark: "#E5534B",
} as const;
