import { memo, type CSSProperties } from 'react';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { Icon } from '../react/DiagramSvg';
import { lineColor, swatchFor } from '../react/theme';
import type { Theme } from '../theme/tokens';
import { lineGeometry, safeLink, type LineGeometry, type CanvasDocument, type CanvasItem, type CodeItem, type DeviceKind, type FrameItem, type IconItem, type ImageItem, type LineItem, type PenItem, type ShapeItem, type StickyItem, type TextItem } from './model';

// Renderers for canvas items. Each is an absolutely positioned element in
// canvas units (the world layer applies the camera transform), tagged with
// data-item-id for hit testing. Figures are rendered by OctoCanvas.

export interface ItemContext {
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
}

export const TEXT_LINE_HEIGHT = 1.3;

const placed = (item: CanvasItem, extra?: CSSProperties): CSSProperties => ({ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined, ...extra });

/** Fill, outline, glyph and label colors of a shape (or icon) in a color and fill style. */
export function shapeColors(theme: Theme, color: string | undefined, fill: ShapeItem['fill'] = 'tint') {
  const swatch = swatchFor(theme, color);
  const stroke = swatch?.stroke ?? theme.node.stroke;
  const icon = swatch?.icon ?? theme.node.icon;
  if (fill === 'none') return { fill: 'none', stroke, icon, text: theme.color.text };
  // Solid: the swatch's strong fill with its contrasting text; uncolored shapes use the ink color with canvas-colored text.
  if (fill === 'solid') return swatch ? { fill: swatch.solid, stroke: swatch.solid, icon, text: swatch.onSolid } : { fill: theme.node.stroke, stroke: theme.node.stroke, icon, text: theme.color.canvas };
  return { fill: swatch?.nodeFill ?? theme.node.fill, stroke, icon, text: theme.color.text };
}

/** The dash pattern lines and dashed shapes share. */
export const DASH = '6 5';

/** Inner padding of a shape's label (rectangles hug their edges, round shapes keep their label off the curve). */
export const shapeTextPadding = (item: Pick<ShapeItem, 'shape' | 'w' | 'h'>) => (item.shape === 'rectangle' ? { x: 8, y: 8 } : { x: item.w * 0.15, y: item.h * 0.15 });

/** SVG path of a line: M…L for straight lines, M…Q for bent ones. */
export function linePath(g: LineGeometry): string {
  return g.control ? `M${g.start.x} ${g.start.y}Q${g.control.x} ${g.control.y} ${g.end.x} ${g.end.y}` : `M${g.start.x} ${g.start.y}L${g.end.x} ${g.end.y}`;
}

export const inkColor = (theme: Theme, color: string | undefined) => lineColor(theme, color) ?? theme.color.text;

export function shapePath(shape: ShapeItem['shape'], w: number, h: number): string {
  if (shape === 'ellipse') return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`;
  if (shape === 'diamond') return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
  const r = Math.min(8, w / 4, h / 4);
  return `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
}

export const ShapeView = memo(function ShapeView({ item, ctx, hideText }: { item: ShapeItem; ctx: ItemContext; hideText?: boolean }) {
  const { fill, stroke, text } = shapeColors(ctx.theme, item.color, item.fill);
  const pad = shapeTextPadding(item);
  const align = item.align ?? 'center';
  const valign = item.valign ?? 'middle';
  return (
    <div data-item-id={item.id} className="occ-item" style={placed(item)}>
      <svg width={item.w} height={item.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={shapePath(item.shape, item.w, item.h)} fill={fill} stroke={stroke} strokeWidth={1.25} strokeDasharray={item.dashed ? DASH : undefined} vectorEffect="non-scaling-stroke" />
      </svg>
      {item.text && !hideText && (
        <div
          className="occ-shape-text"
          style={{
            font: `${ctx.theme.text.node.weight} ${ctx.theme.text.node.size}px/${TEXT_LINE_HEIGHT} ${ctx.theme.font.sans}`,
            color: text,
            padding: `${pad.y}px ${pad.x}px`,
            textAlign: align,
            justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            alignItems: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
          }}
        >
          {item.text}
        </div>
      )}
      <LinkBadge item={item} ctx={ctx} />
    </div>
  );
});

/** A small ↗ in the top-right corner of an item with a link; opens it in a new tab. */
export function LinkBadge({ item, ctx }: { item: { link?: string }; ctx: ItemContext }) {
  const href = safeLink(item);
  if (!href) return null;
  return (
    <a
      className="occ-link-badge occ-chrome"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      aria-label={`Open link: ${href}`}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', pointerEvents: 'auto', background: ctx.theme.color.surface, border: `1px solid ${ctx.theme.color.border}`, color: ctx.theme.color.textMuted }}
    >
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17L17 7M8 7h9v9" />
      </svg>
    </a>
  );
}

export const TextView = memo(function TextView({ item, ctx, hidden }: { item: TextItem; ctx: ItemContext; hidden?: boolean }) {
  return (
    <div
      data-item-id={item.id}
      className="occ-item occ-text"
      style={placed(item, { font: textFont(ctx.theme, item), color: inkColor(ctx.theme, item.color), textAlign: item.align ?? 'left', visibility: hidden ? 'hidden' : undefined })}
    >
      {item.text}
    </div>
  );
});

export const textFont = (theme: Theme, item: Pick<TextItem, 'fontSize' | 'bold'>) => `${item.bold ? 700 : theme.text.node.weight} ${item.fontSize}px/${TEXT_LINE_HEIGHT} ${theme.font.sans}`;

export const STICKY_FONT_SIZE = 16;
export const stickyColors = (theme: Theme, color: string | undefined) => {
  const swatch = swatchFor(theme, color ?? 'yellow')!;
  return { fill: swatch.nodeFill, edge: swatch.stroke };
};

export const StickyView = memo(function StickyView({ item, ctx, hideText }: { item: StickyItem; ctx: ItemContext; hideText?: boolean }) {
  const { fill } = stickyColors(ctx.theme, item.color);
  return (
    <div data-item-id={item.id} className="occ-item occ-sticky" style={placed(item, { background: fill, color: ctx.theme.color.text, font: `500 ${STICKY_FONT_SIZE}px/${TEXT_LINE_HEIGHT} ${ctx.theme.font.sans}` })}>
      {!hideText && item.text}
      <LinkBadge item={item} ctx={ctx} />
    </div>
  );
});

export const ImageView = memo(function ImageView({ item }: { item: ImageItem }) {
  return (
    <div data-item-id={item.id} className="occ-item" style={placed(item)}>
      <img src={item.src} alt={item.alt ?? ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
    </div>
  );
});

export const CODE_FONT_SIZE = 13;
export const CodeView = memo(function CodeView({ item, ctx, hideText }: { item: CodeItem; ctx: ItemContext; hideText?: boolean }) {
  return (
    <div data-item-id={item.id} className="occ-item occ-code" style={placed(item, { font: `400 ${CODE_FONT_SIZE}px/1.5 ${ctx.theme.font.mono}` })}>
      {item.language && <span className="occ-code-lang">{item.language}</span>}
      {!hideText && <pre>{item.text}</pre>}
    </div>
  );
});

/** Device outlines; the inside stays transparent so content drawn in it shows through. */
export function DeviceOutline({ device, w, h, title, theme }: { device: DeviceKind; w: number; h: number; title?: string; theme: Theme }) {
  const stroke = theme.color.borderStrong;
  const chrome = theme.color.surface;
  const common = { fill: 'none', stroke, strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' as const };
  if (device === 'phone' || device === 'tablet') {
    const r = Math.min(device === 'phone' ? 36 : 24, w / 6);
    return (
      <>
        <rect x={0} y={0} width={w} height={h} rx={r} {...common} strokeWidth={2} />
        {device === 'phone' ? <rect x={w / 2 - 36} y={10} width={72} height={18} rx={9} fill={stroke} /> : <circle cx={w / 2} cy={12} r={3} fill={stroke} />}
        <rect x={w / 2 - Math.min(60, w / 5)} y={h - 12} width={Math.min(120, w / 2.5)} height={4} rx={2} fill={stroke} opacity={0.6} />
      </>
    );
  }
  if (device === 'browser') {
    const bar = 36;
    return (
      <>
        <path d={`M0 ${bar}V10Q0 0 10 0H${w - 10}Q${w} 0 ${w} 10V${bar}Z`} fill={chrome} />
        <rect x={0} y={0} width={w} height={h} rx={10} {...common} />
        <line x1={0} y1={bar} x2={w} y2={bar} {...common} />
        {[16, 32, 48].map((cx, i) => (
          <circle key={cx} cx={cx} cy={bar / 2} r={5} fill={['#f87171', '#fbbf24', '#4ade80'][i]} />
        ))}
        <rect x={68} y={8} width={Math.max(0, w - 84)} height={bar - 16} rx={(bar - 16) / 2} fill={theme.color.canvas} stroke={theme.color.border} />
        {title && (
          <text x={84} y={bar / 2 + 4} fontSize={12} fill={theme.color.textMuted} fontFamily={theme.font.sans}>
            {title}
          </text>
        )}
      </>
    );
  }
  // Desktop monitor: screen with a stand below.
  const screenH = h * 0.86;
  return (
    <>
      <rect x={0} y={0} width={w} height={screenH} rx={8} {...common} strokeWidth={2} />
      <path d={`M${w / 2 - w * 0.05} ${screenH}L${w / 2 - w * 0.07} ${h - 6}H${w / 2 + w * 0.07}L${w / 2 + w * 0.05} ${screenH}`} {...common} />
      <line x1={w / 2 - w * 0.14} y1={h - 3} x2={w / 2 + w * 0.14} y2={h - 3} {...common} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

export const FrameView = memo(function FrameView({ item, ctx }: { item: FrameItem; ctx: ItemContext }) {
  return (
    <svg data-item-id={item.id} className="occ-item occ-frame" style={placed(item, { overflow: 'visible' })} width={item.w} height={item.h}>
      {/* A wider invisible outline so the thin frame is easy to grab. */}
      <rect width={item.w} height={item.h} rx={12} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }} />
      <DeviceOutline device={item.device} w={item.w} h={item.h} title={item.title} theme={ctx.theme} />
    </svg>
  );
});

/** Smooth path through normalized points scaled to w×h (quadratic curves through midpoints). */
export function penPath(points: [number, number][], w: number, h: number): string {
  const p = points.map(([x, y]) => [x * w, y * h] as const);
  if (p.length === 0) return '';
  if (p.length < 3) return `M${p[0]![0]} ${p[0]![1]}` + p.slice(1).map(([x, y]) => `L${x} ${y}`).join('') + (p.length === 1 ? 'l0.01 0' : '');
  let d = `M${p[0]![0]} ${p[0]![1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i]!;
    const [nx, ny] = p[i + 1]!;
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const last = p.at(-1)!;
  return `${d}L${last[0]} ${last[1]}`;
}

export const PenView = memo(function PenView({ item, ctx }: { item: PenItem; ctx: ItemContext }) {
  const d = penPath(item.points, item.w, item.h);
  return (
    <svg data-item-id={item.id} className="occ-item occ-stroke" style={placed(item, { overflow: 'visible' })} width={item.w} height={item.h}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} strokeLinecap="round" />
      <path d={d} fill="none" stroke={inkColor(ctx.theme, item.color)} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

export function LineView({ item, doc, ctx }: { item: LineItem; doc: CanvasDocument; ctx: ItemContext }) {
  const geometry = lineGeometry(doc, item);
  const d = linePath(geometry);
  const color = lineColor(ctx.theme, item.color) ?? ctx.theme.color.edge;
  const marker = `occ-arrow-${item.id}`;
  const { mid } = geometry;
  return (
    <svg data-item-id={item.id} className="occ-item occ-stroke" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}>
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={color} />
        </marker>
      </defs>
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={item.dashed ? DASH : undefined}
        markerStart={item.startArrow ? `url(#${marker})` : undefined}
        markerEnd={item.endArrow ? `url(#${marker})` : undefined}
      />
      {item.text && (
        <foreignObject x={mid.x - 80} y={mid.y - 12} width={160} height={24} style={{ overflow: 'visible' }}>
          <div className="occ-line-label" style={{ font: `${ctx.theme.text.edge.weight} ${ctx.theme.text.edge.size}px ${ctx.theme.font.sans}`, color: ctx.theme.color.textMuted, background: ctx.theme.color.canvas }}>
            {item.text}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

export const IconView = memo(function IconView({ item, ctx }: { item: IconItem; ctx: ItemContext }) {
  const size = Math.min(item.w, item.h);
  const { icon } = shapeColors(ctx.theme, item.color);
  return (
    <svg data-item-id={item.id} className="occ-item" style={placed(item)} width={item.w} height={item.h}>
      <rect width={item.w} height={item.h} fill="transparent" />
      <Icon name={item.name} resolved={resolveIcon(item.name, ctx.icons, ctx.iconSet)} x={(item.w - size) / 2} y={(item.h - size) / 2} size={size} tint={icon} theme={ctx.theme} strokeWidth={1.6} />
    </svg>
  );
});
