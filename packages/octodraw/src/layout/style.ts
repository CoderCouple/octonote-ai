import type { Properties } from '../dsl/types';
import type { ViewEdge } from '../view/view';
import type { ArrowHeadKind, LineStyle, TextFont, Typography } from './layout';

// Per-element style properties (octodraw extensions: textSize, textAlign,
// textColor, iconSize, border, strokeWidth on boxes and groups; line,
// strokeWidth, labelSize, routing, startArrow, endArrow on arrows). Layout and
// renderer both read them through these helpers so measured and drawn text
// always agree. A missing or unreadable value means "as before", which keeps
// diagrams that don't use them pixel-identical.

const TEXT_SIZES: Record<string, number> = { small: 12, medium: 14, large: 18 };
const ICON_SIZES: Record<string, number> = { small: 36, medium: 50, large: 72 };
const LABEL_SIZES: Record<string, number> = { small: 11, medium: 13, large: 16 };
const STROKE_WIDTHS: Record<string, number> = { thin: 1, medium: 1.5, thick: 2.5 };

function sized(value: string | undefined, named: Record<string, number>, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const key = value.trim().toLowerCase();
  if (key in named) return named[key];
  const n = Number(key.replace(/px$/, ''));
  if (!key || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** `textSize`: small 12 · medium 14 · large 18, or 8–48. */
export const textSizeOf = (value: string | undefined) => sized(value, TEXT_SIZES, 8, 48);
/** `iconSize`: small 36 · medium 50 · large 72, or 16–200. */
export const iconSizeOf = (value: string | undefined) => sized(value, ICON_SIZES, 16, 200);
/** Arrow `labelSize`: small 11 · medium 13 · large 16, or 8–48. */
export const labelSizeOf = (value: string | undefined) => sized(value, LABEL_SIZES, 8, 48);
/** `strokeWidth`: thin 1 · medium 1.5 · thick 2.5, or 0.25–12. */
export const strokeWidthOf = (value: string | undefined) => sized(value, STROKE_WIDTHS, 0.25, 12);

export function lineStyleOf(value: string | undefined): LineStyle | undefined {
  const v = value?.trim().toLowerCase();
  return v === 'solid' || v === 'dashed' || v === 'dotted' ? v : undefined;
}

export function textAlignOf(value: string | undefined): 'left' | 'center' | 'right' | undefined {
  const v = value?.trim().toLowerCase();
  return v === 'left' || v === 'center' || v === 'right' ? v : undefined;
}

/** `startArrow` / `endArrow`: none · arrow · open · dot. */
export function arrowHeadOf(value: string | undefined): ArrowHeadKind | 'none' | undefined {
  const v = value?.trim().toLowerCase();
  return v === 'none' || v === 'arrow' || v === 'open' || v === 'dot' ? v : undefined;
}

type LineFont = TextFont & { lineHeight: number };

/**
 * Fonts for a box's label and description. `textSize` sets the label size and
 * scales the description with it; `typeface` is carried so a measurer can use
 * the box's own face. Without either, the diagram's fonts come back unchanged.
 */
export function nodeFonts(type: Pick<Typography, 'node' | 'description'>, properties: Properties): { node: LineFont; description: LineFont } {
  const size = textSizeOf(properties.textSize);
  const typeface = properties.typeface;
  if (size === undefined && !typeface) return { node: type.node, description: type.description };
  const descriptionSize = size === undefined ? type.description.size : Math.max(8, Math.round((size * type.description.size) / type.node.size));
  return {
    node: { ...type.node, size: size ?? type.node.size, ...(typeface ? { typeface } : {}) },
    description: { ...type.description, size: descriptionSize, ...(typeface ? { typeface } : {}) },
  };
}

/** Font for a group's title. */
export function groupFont<F extends TextFont>(type: { group: F }, properties: Properties): F {
  const size = textSizeOf(properties.textSize);
  const typeface = properties.typeface;
  if (size === undefined && !typeface) return type.group;
  return { ...type.group, size: size ?? type.group.size, ...(typeface ? { typeface } : {}) };
}

/** Extra header height a group needs for a title larger than the default sizes. */
export function groupHeaderExtra(properties: Properties): number {
  const size = textSizeOf(properties.textSize);
  return size === undefined ? 0 : Math.max(0, Math.ceil((size - 18) * 1.3));
}

/** One property of a (possibly merged) view edge: the sources' common value, or undefined when they differ. */
export function edgeProperty(edge: Pick<ViewEdge, 'sources'>, key: string): string | undefined {
  const values = new Set(edge.sources.map((s) => s.properties[key]));
  return values.size === 1 ? [...values][0] : undefined;
}

/** Font for an arrow's label. */
export function edgeFont<F extends TextFont>(base: F, edge: Pick<ViewEdge, 'sources'>): F {
  const size = labelSizeOf(edgeProperty(edge, 'labelSize'));
  return size === undefined ? base : { ...base, size };
}

export interface EdgeStyle {
  startArrow: boolean;
  endArrow: boolean;
  dashed: boolean;
  /** Only set when a property asked for something; undefined keeps the defaults. */
  startHead?: ArrowHeadKind;
  endHead?: ArrowHeadKind;
  dotted?: true;
  strokeWidth?: number;
  labelSize?: number;
  routing?: 'straight';
}

/** The drawn style of a view edge: connector defaults overridden by its properties. */
export function edgeStyle(edge: Pick<ViewEdge, 'sources' | 'startArrow' | 'endArrow' | 'dashed'>): EdgeStyle {
  const prop = (key: string) => edgeProperty(edge, key);
  const style: EdgeStyle = { startArrow: edge.startArrow, endArrow: edge.endArrow, dashed: edge.dashed };
  const start = arrowHeadOf(prop('startArrow'));
  const end = arrowHeadOf(prop('endArrow'));
  if (start) {
    style.startArrow = start !== 'none';
    if (start !== 'none') style.startHead = start;
  }
  if (end) {
    style.endArrow = end !== 'none';
    if (end !== 'none') style.endHead = end;
  }
  const line = lineStyleOf(prop('line'));
  if (line) {
    style.dashed = line === 'dashed';
    if (line === 'dotted') style.dotted = true;
  }
  const width = strokeWidthOf(prop('strokeWidth'));
  if (width !== undefined) style.strokeWidth = width;
  const labelSize = labelSizeOf(prop('labelSize'));
  if (labelSize !== undefined) style.labelSize = labelSize;
  if (prop('routing')?.trim().toLowerCase() === 'straight') style.routing = 'straight';
  return style;
}

/** Fields to spread onto a LayoutEdge: only the ones that are set, so default output is unchanged. */
export function edgeStyleFields(style: EdgeStyle) {
  const { startArrow, endArrow, dashed, startHead, endHead, dotted, strokeWidth, labelSize, routing } = style;
  return {
    startArrow,
    endArrow,
    dashed,
    ...(startHead ? { startHead } : {}),
    ...(endHead ? { endHead } : {}),
    ...(dotted ? { dotted } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(labelSize !== undefined ? { labelSize } : {}),
    ...(routing ? { routing } : {}),
  };
}
