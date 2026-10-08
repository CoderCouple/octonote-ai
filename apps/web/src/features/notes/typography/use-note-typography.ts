/**
 * Adapter hook — reads the typography store and produces the inline
 * style object a container needs to apply the choice via CSS variables.
 * Consumers spread this onto a wrapper element:
 *
 *   const { style } = useNoteTypography();
 *   return <article style={style}>...</article>;
 *
 * Then descendants pick up the family / size / line-height via `font:
 * var(--font-reader-family) …` etc.
 */
"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  contentWidthRem,
  fontFamilyStack,
  fontSizePx,
  lineHeightRatio,
} from "./fonts";
import { useTypographyStore, type NoteTypography } from "./typography-store";

export interface NoteTypographyResolved extends NoteTypography {
  style: CSSProperties;
  /** Numeric max-width in rem for the article column. */
  widthRem: number;
}

export function useNoteTypography(): NoteTypographyResolved {
  const family = useTypographyStore((s) => s.family);
  const size = useTypographyStore((s) => s.size);
  const lineHeight = useTypographyStore((s) => s.lineHeight);
  const width = useTypographyStore((s) => s.width);

  const widthRem = contentWidthRem(width);

  const style = useMemo<CSSProperties>(
    () => ({
      // These custom properties are consumed by the published/edit layout
      // and by BlockNote-adjacent markup. Declared here so anything nested
      // inside the article inherits automatically.
      ["--font-reader-family" as string]: fontFamilyStack(family),
      ["--font-reader-size" as string]: `${fontSizePx(size)}px`,
      ["--font-reader-line-height" as string]: String(lineHeightRatio(lineHeight)),
      ["--reader-content-width" as string]: `${widthRem}rem`,
      fontFamily: `var(--font-reader-family)`,
      fontSize: `var(--font-reader-size)`,
      lineHeight: `var(--font-reader-line-height)`,
      maxWidth: `var(--reader-content-width)`,
    }),
    [family, size, lineHeight, widthRem],
  );

  return { family, size, lineHeight, width, widthRem, style };
}
