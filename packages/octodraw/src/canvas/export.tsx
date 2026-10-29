import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { Icon } from '../react/DiagramSvg';
import { lineColor } from '../react/theme';
import type { Theme } from '../theme/tokens';
import { CODE_FONT_SIZE, DASH, DeviceOutline, inkColor, linePath, penPath, shapeColors, shapePath, shapeTextPadding, STICKY_FONT_SIZE, stickyColors, TEXT_LINE_HEIGHT } from './items';
import { boundsOf, lineGeometry, type CanvasDocument, type CanvasItem } from './model';
import { FIGURE_TITLE, figureLabel } from './templates';

// The whole canvas as one standalone SVG. Figures are passed in already
// exported (each figure's OctoDiagram renders itself) and nested at their box.

export interface CanvasSvgOptions {
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Exported SVG per figure id. */
  figureSvgs?: Map<string, string>;
  fontCss?: string;
  padding?: number;
  background?: string;
  /** Only these items (e.g. the selection); defaults to everything. */
  ids?: Iterable<string>;
}

function TextLines({ text, x, y, size, lineHeight, anchor, font, weight, fill }: { text: string; x: number; y: number; size: number; lineHeight: number; anchor: 'start' | 'middle' | 'end'; font: string; weight: number; fill: string }) {
  const lines = text.split('\n');
  return (
    <text x={x} y={y} fontSize={size} fontFamily={font} fontWeight={weight} fill={fill} textAnchor={anchor} style={{ whiteSpace: 'pre' }}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? size * 0.8 : size * lineHeight}>
          {line || ' '}
        </tspan>
      ))}
    </text>
  );
}

function itemSvg(item: CanvasItem, doc: CanvasDocument, o: CanvasSvgOptions): ReactNode {
  const { theme } = o;
  const font = theme.font.sans;
  switch (item.type) {
    case 'shape': {
      const { fill, stroke, text } = shapeColors(theme, item.color, item.fill);
      const size = theme.text.node.size;
      const textHeight = (item.text ?? '').split('\n').length * size * TEXT_LINE_HEIGHT;
      const pad = shapeTextPadding(item);
      const align = item.align ?? 'center';
      const valign = item.valign ?? 'middle';
      const x = align === 'left' ? pad.x : align === 'right' ? item.w - pad.x : item.w / 2;
      const y = valign === 'top' ? pad.y : valign === 'bottom' ? item.h - pad.y - textHeight : item.h / 2 - textHeight / 2;
      return (
        <g transform={`translate(${item.x} ${item.y})`}>
          <path d={shapePath(item.shape, item.w, item.h)} fill={fill} stroke={stroke} strokeWidth={1.25} strokeDasharray={item.dashed ? DASH : undefined} />
          {item.text && <TextLines text={item.text} x={x} y={y} size={size} lineHeight={TEXT_LINE_HEIGHT} anchor={align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'} font={font} weight={theme.text.node.weight} fill={text} />}
        </g>
      );
    }
    case 'text': {
      const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start';
      const x = item.align === 'center' ? item.w / 2 : item.align === 'right' ? item.w : 0;
      return (
        <g transform={`translate(${item.x} ${item.y})`}>
          <TextLines text={item.text} x={x} y={(item.fontSize * (TEXT_LINE_HEIGHT - 1)) / 2} size={item.fontSize} lineHeight={TEXT_LINE_HEIGHT} anchor={anchor} font={font} weight={item.bold ? 700 : theme.text.node.weight} fill={inkColor(theme, item.color)} />
        </g>
      );
    }
    case 'sticky': {
      const { fill } = stickyColors(theme, item.color);
      const lines = item.text.split('\n').length;
      return (
        <g transform={`translate(${item.x} ${item.y})`}>
          <rect width={item.w} height={item.h} rx={3} fill={fill} />
          <TextLines text={item.text} x={item.w / 2} y={item.h / 2 - (lines * STICKY_FONT_SIZE * TEXT_LINE_HEIGHT) / 2} size={STICKY_FONT_SIZE} lineHeight={TEXT_LINE_HEIGHT} anchor="middle" font={font} weight={500} fill={theme.color.text} />
        </g>
      );
    }
    case 'pen':
      return <path transform={`translate(${item.x} ${item.y})`} d={penPath(item.points, item.w, item.h)} fill="none" stroke={inkColor(theme, item.color)} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />;
    case 'line': {
      const geometry = lineGeometry(doc, item);
      const color = lineColor(theme, item.color) ?? theme.color.edge;
      const marker = `occ-export-arrow-${item.id}`;
      return (
        <g>
          <defs>
            <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={color} />
            </marker>
          </defs>
          <path d={linePath(geometry)} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={item.dashed ? DASH : undefined} markerStart={item.startArrow ? `url(#${marker})` : undefined} markerEnd={item.endArrow ? `url(#${marker})` : undefined} />
          {item.text && (
            <text x={geometry.mid.x} y={geometry.mid.y + 4} fontSize={theme.text.edge.size} fontFamily={font} fill={theme.color.textMuted} textAnchor="middle" stroke={theme.color.canvas} strokeWidth={4} paintOrder="stroke">
              {item.text}
            </text>
          )}
        </g>
      );
    }
    case 'icon': {
      const size = Math.min(item.w, item.h);
      return <Icon name={item.name} resolved={resolveIcon(item.name, o.icons, o.iconSet)} x={item.x + (item.w - size) / 2} y={item.y + (item.h - size) / 2} size={size} tint={shapeColors(theme, item.color).icon} theme={theme} />;
    }
    case 'image':
      return <image href={item.src} x={item.x} y={item.y} width={item.w} height={item.h} preserveAspectRatio="xMidYMid meet" />;
    case 'frame':
      return (
        <g transform={`translate(${item.x} ${item.y})`}>
          <DeviceOutline device={item.device} w={item.w} h={item.h} title={item.title} theme={theme} />
        </g>
      );
    case 'code':
      return (
        <g transform={`translate(${item.x} ${item.y})`}>
          <rect width={item.w} height={item.h} rx={8} fill={theme.color.surface} stroke={theme.color.border} />
          <TextLines text={item.text} x={14} y={12} size={CODE_FONT_SIZE} lineHeight={1.5} anchor="start" font={theme.font.mono} weight={400} fill={theme.color.text} />
        </g>
      );
    case 'figure': {
      const svg = o.figureSvgs?.get(item.id);
      // Nest the figure's own SVG at the figure box (its viewBox scales it to fit).
      const nested = svg?.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}"`);
      return (
        <g>
          <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={8} fill={theme.color.canvas} stroke={theme.color.border} />
          {nested && <g dangerouslySetInnerHTML={{ __html: nested }} />}
          {/* The title above the border, as on the canvas. */}
          <text x={item.x + 2} y={item.y - FIGURE_TITLE.gap - 3} fontSize={FIGURE_TITLE.size} fontFamily={theme.font.sans} fontWeight={600} fill={theme.color.text}>
            {figureLabel(item.source)}
          </text>
        </g>
      );
    }
  }
}

/** Renders canvas items to a standalone SVG string. */
export function renderCanvasSvg(doc: CanvasDocument, options: CanvasSvgOptions): { svg: string; width: number; height: number } {
  const padding = options.padding ?? 32;
  const wanted = options.ids ? new Set(options.ids) : undefined;
  const items = wanted ? doc.items.filter((i) => wanted.has(i.id)) : doc.items;
  // Figures' titles sit above their boxes; make room for them.
  const box = boundsOf(items.map((i) => (i.type === 'figure' ? { ...i, y: i.y - FIGURE_TITLE.space, h: i.h + FIGURE_TITLE.space } : i))) ?? { x: 0, y: 0, w: 1, h: 1 };
  const width = Math.ceil(box.w + padding * 2);
  const height = Math.ceil(box.h + padding * 2);
  const body = renderToStaticMarkup(createElement('g', { transform: `translate(${padding - box.x} ${padding - box.y})` }, ...items.map((item) => createElement('g', { key: item.id, transform: item.rotation ? `rotate(${item.rotation} ${item.x + item.w / 2} ${item.y + item.h / 2})` : undefined }, itemSvg(item, doc, options)))));
  const fill = options.background ?? options.theme.color.canvas;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    options.fontCss ? `<style>${options.fontCss}</style>` : '',
    fill !== 'transparent' ? `<rect width="100%" height="100%" fill="${fill.replace(/"/g, '&quot;')}"/>` : '',
    body,
    '</svg>',
  ].join('');
  return { svg, width, height };
}
