import type { LayoutNode } from '../layout/layout';
import { PALETTE_NAMES, type PaletteName, type Swatch, type Theme } from '../theme/tokens';

// Color resolution, following Eraser's classic renderer: nested groups inherit
// their parent group's color (fills cycle tint / white by depth), while nodes
// only use their own color — an uncolored card is white with a dark outline
// even inside a colored group.

export interface Paint {
  stroke: string;
  fill: string;
  text: string;
  muted: string;
  icon: string;
}

export function swatchFor(theme: Theme, color: string | undefined): Swatch | undefined {
  if (!color) return undefined;
  const name = color.toLowerCase().replace(/^grey$/, 'gray');
  if ((PALETTE_NAMES as readonly string[]).includes(name)) return theme.palette[name as PaletteName];
  // Raw CSS color (e.g. "#0ea5e9"): derive a swatch by mixing with the surface.
  const surface = theme.color.surface;
  const tint = (percent: number) => `color-mix(in srgb, ${color} ${percent}%, ${surface})`;
  const light = theme.scheme === 'light';
  return {
    stroke: tint(light ? 55 : 60),
    groupFills: [tint(light ? 5 : 8), surface, tint(light ? 5 : 8)],
    nodeFill: tint(light ? 14 : 18),
    icon: color,
    solid: color,
    onSolid: '#ffffff',
    ink: color,
  };
}

/** A palette name or raw color as a line color (edges). */
export function lineColor(theme: Theme, color: string | undefined): string | undefined {
  if (!color) return undefined;
  const swatch = swatchFor(theme, color);
  return swatch && (PALETTE_NAMES as readonly string[]).includes(color.toLowerCase()) ? swatch.ink : color;
}

export interface ResolvedPaints {
  paints: Map<string, Paint>;
  /** Fill behind each node's content, used to knock out edge labels. */
  fills: Map<string, string>;
}

/** Paints for every node in a layout. Nodes must be ordered parents-first, as layoutView returns them. */
export function resolvePaints(theme: Theme, nodes: LayoutNode[], defaultColorMode: string): ResolvedPaints {
  const paints = new Map<string, Paint>();
  const fills = new Map<string, string>();
  const inherited = new Map<string, string | undefined>();
  const text = theme.color.text;
  const muted = theme.color.textMuted;

  for (const node of nodes) {
    const parentColor = node.parent ? inherited.get(node.parent) : undefined;
    const parentFill = node.parent ? fills.get(node.parent) : theme.color.canvas;
    const own = node.properties.color;
    const color = node.kind === 'group' ? (own ?? parentColor) : own;
    const colorMode = node.properties.colorMode ?? defaultColorMode;
    const swatch = swatchFor(theme, color);
    inherited.set(node.id, color);

    let paint: Paint;
    if (node.kind === 'group') {
      const fills3 = swatch?.groupFills ?? theme.group.fills;
      paint = {
        stroke: swatch?.stroke ?? theme.group.stroke,
        fill: colorMode === 'outline' ? 'transparent' : fills3[node.depth % 3]!,
        text,
        muted,
        icon: text,
      };
    } else if (node.kind === 'external') {
      paint = { stroke: theme.external.stroke, fill: theme.external.fill, text: theme.external.text, muted: theme.color.textSubtle, icon: theme.external.text };
    } else if (!swatch) {
      paint = { stroke: theme.node.stroke, fill: theme.node.fill, text, muted, icon: theme.node.icon };
    } else if (colorMode === 'bold') {
      paint = { stroke: swatch.solid, fill: swatch.solid, text: swatch.onSolid, muted: swatch.onSolid, icon: swatch.onSolid };
    } else {
      const fill = colorMode === 'outline' ? theme.color.surface : swatch.nodeFill;
      paint = { stroke: swatch.stroke, fill, text, muted, icon: swatch.icon };
    }
    if (node.style && theme.scheme === 'light') {
      paint = { ...paint, fill: node.style.fill ?? paint.fill, stroke: node.style.stroke ?? paint.stroke };
    }
    paints.set(node.id, paint);
    fills.set(node.id, paint.fill === 'transparent' ? (parentFill ?? theme.color.canvas) : paint.fill);
  }
  return { paints, fills };
}
