/**
 * Reader typography — Google Fonts loaded via next/font so we get
 * self-hosted, subsetted, hash-stable delivery. Georgia is a system
 * serif with no download cost. `system` is the OS UI stack (SF Pro on
 * Mac, Segoe UI on Windows) — matches Notion's default. iA Writer
 * Mono S is self-hosted from public/fonts/ia-writer-mono/ — the same
 * font Notion licenses for its Mono style, released free on iA's
 * GitHub.
 */
import localFont from "next/font/local";
import {
  Fraunces,
  Geist,
  Instrument_Serif,
  Inter,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";
import type {
  NotesFontFamily,
  NotesFontSize,
  NotesLineHeight,
} from "@octonote/shared";

/** The default reading face: Adobe's Source Serif (sturdy, made for long reads on screen). */
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

export const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

/**
 * iA Writer Mono S — self-hosted from public/fonts/ia-writer-mono. The
 * TTFs were downloaded from https://github.com/iaolo/iA-Fonts (SIL-ish
 * license). This is the exact font Notion uses for its Mono style.
 */
export const iaWriterMono = localFont({
  variable: "--font-ia-writer-mono",
  display: "swap",
  src: [
    {
      path: "../../../../public/fonts/ia-writer-mono/iAWriterMonoS-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../../public/fonts/ia-writer-mono/iAWriterMonoS-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../../public/fonts/ia-writer-mono/iAWriterMonoS-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../../public/fonts/ia-writer-mono/iAWriterMonoS-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
});

/**
 * Content-column width presets. Local-only for now (not persisted
 * server-side yet — the store still round-trips to localStorage so the
 * choice sticks between visits).
 */
export type NotesContentWidth = "narrow" | "medium" | "wide";

/** All variables to hoist onto <html> in the root layout. */
export const READER_FONT_VARIABLES = [
  sourceSerif.variable,
  fraunces.variable,
  instrumentSerif.variable,
  newsreader.variable,
  inter.variable,
  geist.variable,
  iaWriterMono.variable,
].join(" ");

/**
 * Resolve a preset name to the CSS stack the reader assigns to
 * `--font-reader-family`. Falls back to the sans stack for unknown
 * values so a stale/bad preference never renders blank.
 */
export function fontFamilyStack(family: NotesFontFamily): string {
  switch (family) {
    case "source-serif":
      return `var(--font-source-serif), "Source Serif 4", Charter, "Bitstream Charter", ui-serif, Georgia, serif`;
    case "fraunces":
      return `var(--font-fraunces), Fraunces, ui-serif, Georgia, serif`;
    case "instrument-serif":
      return `var(--font-instrument-serif), "Instrument Serif", ui-serif, Georgia, serif`;
    case "newsreader":
      return `var(--font-newsreader), Newsreader, ui-serif, Georgia, serif`;
    case "georgia":
      return `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`;
    case "geist":
      return `var(--font-geist), Geist, ui-sans-serif, system-ui, sans-serif`;
    case "system":
      return `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji"`;
    case "ia-writer-mono":
      return `var(--font-ia-writer-mono), "iA Writer Mono S", Menlo, Monaco, Consolas, monospace`;
    case "inter":
    default:
      return `var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif`;
  }
}

const SERIF_FAMILIES = new Set<NotesFontFamily>(["source-serif", "newsreader", "georgia", "fraunces", "instrument-serif"]);

/** True for the book faces; they read best a little larger than sans text. */
export const isSerif = (family: NotesFontFamily) => SERIF_FAMILIES.has(family);

/**
 * Base font size in px per preset. Body copy uses this; headings scale from
 * it. Serifs run small, so they get ~3px more (Medium/Substack set long
 * reads at 20–21px; Notion's sans at 16px).
 */
export function fontSizePx(size: NotesFontSize, family: NotesFontFamily = "source-serif"): number {
  const sans = { sm: 15, md: 17, lg: 19, xl: 21 }[size] ?? 17;
  return isSerif(family) ? sans + 3 : sans;
}

export function lineHeightRatio(lh: NotesLineHeight): number {
  switch (lh) {
    case "compact":
      return 1.5;
    case "relaxed":
      return 1.85;
    case "normal":
    default:
      return 1.65;
  }
}

/** rem widths keyed by preset. Used as the article's `max-width`. */
export function contentWidthRem(width: NotesContentWidth): number {
  switch (width) {
    // ~65–75 characters a line at the default size: the comfortable measure.
    case "narrow":
      return 36;
    case "wide":
      return 52;
    case "medium":
    default:
      return 42;
  }
}

/** Human labels for the picker UI. */
export const FONT_FAMILY_LABELS: Record<NotesFontFamily, string> = {
  "source-serif": "Source Serif",
  fraunces: "Fraunces",
  "instrument-serif": "Instrument Serif",
  georgia: "Georgia",
  newsreader: "Newsreader",
  inter: "Inter",
  geist: "Geist",
  system: "System (SF / Segoe)",
  "ia-writer-mono": "iA Writer Mono",
};

export const FONT_SIZE_LABELS: Record<NotesFontSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra large",
};

export const LINE_HEIGHT_LABELS: Record<NotesLineHeight, string> = {
  compact: "Compact",
  normal: "Normal",
  relaxed: "Relaxed",
};

export const CONTENT_WIDTH_LABELS: Record<NotesContentWidth, string> = {
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
};
