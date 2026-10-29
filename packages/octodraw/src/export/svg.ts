import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GlobalSettings } from '../dsl/types';
import type { IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import type { DiagramLayout } from '../layout/layout';
import { DiagramSvg, fontFamilyFor } from '../react/DiagramSvg';
import type { Theme } from '../theme/tokens';

// Standalone SVG for a laid-out diagram: no hover actions or animation, the
// theme's canvas as background, and an optional title. Pure (no DOM), so it
// also runs on a server (e.g. for octonote's published pages).

export interface RenderSvgOptions {
  layout: DiagramLayout;
  settings: GlobalSettings;
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Title drawn above the diagram; omit for none. */
  title?: string;
  /** Background fill; defaults to the theme canvas. Pass 'transparent' for none. */
  background?: string;
  /** Extra CSS, e.g. @font-face rules so the file renders with the right fonts elsewhere. */
  fontCss?: string;
  padding?: number;
  /** Render this instead of the architecture diagram (ERD / sequence views); `layout` then only provides the size. */
  body?: ReactElement;
}

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

export function renderDiagramSvg({ layout, settings, theme, icons, iconSet = 'eraser', title, background, fontCss, padding = 24, body: customBody }: RenderSvgOptions): RenderedSvg {
  const titleHeight = title ? theme.text.title.size * theme.text.title.lineHeight + 16 : 0;
  const width = Math.ceil(layout.width + padding * 2);
  const height = Math.ceil(layout.height + padding * 2 + titleHeight);
  const family = fontFamilyFor(theme, settings.typeface);
  const body = renderToStaticMarkup(
    customBody ??
    createElement(DiagramSvg, {
      layout,
      settings,
      theme,
      drillable: new Set<string>(),
      icons,
      iconSet,
      animation: 'none',
      hovered: null,
    }),
  );
  const fill = background ?? theme.color.canvas;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    fontCss ? `<style>${fontCss}</style>` : '',
    fill !== 'transparent' ? `<rect width="100%" height="100%" fill="${escapeAttr(fill)}"/>` : '',
    title
      ? `<text x="${padding}" y="${padding + theme.text.title.size}" font-family="${escapeAttr(family)}" font-size="${theme.text.title.size}" font-weight="${theme.text.title.weight}" fill="${escapeAttr(theme.color.text)}">${escapeText(title)}</text>`
      : '',
    `<g transform="translate(${padding}, ${padding + titleHeight})">${body}</g>`,
    '</svg>',
  ].join('');
  return { svg, width, height };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
