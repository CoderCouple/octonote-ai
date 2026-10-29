import { createElement, memo, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { GlobalSettings } from '../dsl/types';
import { resolveIcon } from '../icons/resolve';
import type { IconSet } from '../icons/resolve';
import type { IconResolver, ResolvedIcon } from '../icons/types';
import { GROUP_METRICS, LEGEND_METRICS, NODE_METRICS, type DiagramLayout, type LayoutEdge, type LayoutLegend, type LayoutNode, type Point } from '../layout/layout';
import type { Emphasis } from '../maps/maps';
import type { Theme } from '../theme/tokens';
import { lineColor, resolvePaints, swatchFor, type Paint } from './theme';

/**
 * - `none`: no motion.
 * - `smooth`: boxes glide to new positions on re-layout; new boxes fade in; arrows draw on.
 * - `draw`: like smooth, but new elements appear one after another, so a diagram
 *   streamed in (e.g. from an AI) looks like it is being drawn.
 */
export type DiagramAnimation = 'none' | 'smooth' | 'draw';

export interface DiagramSvgProps {
  layout: DiagramLayout;
  settings: GlobalSettings;
  theme: Theme;
  /** Ids of groups that can be drilled into. */
  drillable: Set<string>;
  onDrill?: (id: string) => void;
  /** Collapse a group into one box, or show a collapsed group's contents again. */
  onToggleCollapse?: (id: string) => void;
  /** A node's link badge was clicked. */
  onLink?: (href: string, nodeId: string) => void;
  /** A node was clicked (for a details panel). */
  onSelect?: (nodeId: string) => void;
  selected?: string | null;
  /** Filter / flow emphasis: everything outside it is dimmed, `current` is accented. */
  emphasis?: Emphasis;
  /** Host icon pack, consulted before the built-in catalog. */
  icons?: IconResolver;
  /** Drillable box under the pointer; its Expand pill is shown. */
  hovered?: string | null;
  animation?: DiagramAnimation;
  /** Current zoom, so hover actions keep a constant on-screen size. */
  zoom?: number;
  /**
   * Draw-in progress: how many elements are shown, counting groups and nodes
   * first (parents before children, in declaration order) and then edges.
   * Undefined shows everything.
   */
  revealCount?: number;
  /**
   * During a draw-in: how long each new line takes to draw (ms), and the last
   * line of the diagram, which draws slowly to finish the reveal.
   */
  drawPace?: { edgeMs: number; lastMs: number };
  /** Bumped when more icons become available, so memoized output re-renders. */
  iconEpoch?: number;
  /** Prefer Eraser's artwork ('eraser', default) or the open-source catalog ('open'). */
  iconSet?: IconSet;
}

const DRAW_STAGGER_MS = 240;
const EDGE_DRAW_MS = 700;
const EDGE_AFTER_NODES_MS = 180;

interface EdgeAnimation {
  key: string;
  kind: 'draw' | 'fade' | 'none';
  delay: number;
  /** How long a 'draw' takes (ms). */
  duration?: number;
}

/** Renders a laid-out view as SVG content (no outer <svg>, so callers control pan and zoom). */
export const DiagramSvg = memo(function DiagramSvg({ layout: fullLayout, settings, theme, drillable, onDrill, onToggleCollapse, onLink, onSelect, selected, emphasis, icons, hovered, animation = 'smooth', revealCount, drawPace, iconSet = 'eraser', zoom = 1 }: DiagramSvgProps) {
  // Paints come from the full layout so colors don't change as elements reveal.
  const { paints, fills } = useMemo(() => resolvePaints(theme, fullLayout.nodes, settings.colorMode), [theme, fullLayout.nodes, settings.colorMode]);
  const layout = useMemo(() => revealed(fullLayout, revealCount), [fullLayout, revealCount]);
  const groups = layout.nodes.filter((n) => n.kind === 'group');
  const ctx: RenderContext = { theme, icons, iconSet, onDrill, onLink, onSelect, shadow: settings.styleMode === 'shadow', watercolor: settings.styleMode === 'watercolor' };
  const nodeState = (id: string) => (emphasis && !emphasis.nodes.has(id) ? 'od-dim' : undefined);
  const edgeState = (id: string): EdgeState => (emphasis?.current?.edges.has(id) ? 'current' : emphasis && !emphasis.edges.has(id) ? 'dim' : 'normal');
  const rings = layout.nodes.filter((n) => n.kind !== 'group' && (n.id === selected || emphasis?.current?.nodes.has(n.id)));

  // What has been on screen before, so only genuinely new elements animate in.
  const seenNodes = useRef(new Set<string>());
  const edgeGeometry = useRef(new Map<string, { signature: string; key: string }>());
  const animated = animation !== 'none';

  const nodeDelay = new Map<string, number>();
  if (animated) {
    let order = 0;
    for (const node of layout.nodes) {
      if (!seenNodes.current.has(node.id)) nodeDelay.set(node.id, animation === 'draw' ? order++ * DRAW_STAGGER_MS : 0);
    }
  }

  const edgeAnimations = new Map<LayoutEdge, EdgeAnimation>();
  const usedKeys = new Set<string>();
  for (const edge of layout.edges) {
    let base = `${edge.from}->${edge.to}`;
    for (let i = 2; usedKeys.has(base); i++) base = `${edge.from}->${edge.to}#${i}`;
    usedKeys.add(base);
    const signature = edge.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    const previous = edgeGeometry.current.get(base);
    if (!animated) {
      edgeAnimations.set(edge, { key: base, kind: 'none', delay: 0 });
    } else if (!previous) {
      const delay = Math.max(nodeDelay.get(edge.from) ?? 0, nodeDelay.get(edge.to) ?? 0) + (drawPace ? 0 : EDGE_AFTER_NODES_MS);
      const duration = drawPace ? (edge === fullLayout.edges.at(-1) ? drawPace.lastMs : drawPace.edgeMs) : EDGE_DRAW_MS;
      edgeAnimations.set(edge, { key: `${base}@${signature}`, kind: 'draw', delay, duration });
    } else if (previous.signature !== signature) {
      // Re-routed: remount and fade in once the boxes have finished moving.
      edgeAnimations.set(edge, { key: `${base}@${signature}`, kind: 'fade', delay: theme.motion.normal });
    } else {
      edgeAnimations.set(edge, { key: previous.key, kind: 'none', delay: 0 });
    }
  }

  useEffect(() => {
    for (const node of layout.nodes) seenNodes.current.add(node.id);
    const next = new Map<string, { signature: string; key: string }>();
    for (const [edge, anim] of edgeAnimations) {
      next.set(anim.key.split('@')[0]!, { signature: edge.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '), key: anim.key });
    }
    edgeGeometry.current = next;
    // Only the layout determines what counts as seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Edge labels knock out the line using the fill of the innermost group under them.
  const labelBackground = (edge: LayoutEdge) => {
    const label = edge.label!;
    const cx = label.x + label.width / 2;
    const cy = label.y + label.height / 2;
    let fill = theme.color.canvas;
    for (const g of groups) if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height) fill = fills.get(g.id) ?? fill;
    return fill;
  };

  const positioned = (node: LayoutNode, render: (local: LayoutNode) => ReactNode) => (
    <Positioned key={node.id} node={node} animated={animated} enterDelay={nodeDelay.get(node.id)} className={node.kind === 'group' ? undefined : nodeState(node.id)}>
      {render(toLocal(node))}
    </Positioned>
  );

  return (
    <g fontFamily={fontFamilyFor(theme, settings.typeface)}>
      {ctx.watercolor && <WatercolorDefs />}
      {groups.map((node) => positioned(node, (local) => <GroupShape node={local} paint={paints.get(node.id)!} ctx={ctx} drillable={drillable.has(node.id)} />))}
      {layout.edges.map((edge) => {
        const anim = edgeAnimations.get(edge)!;
        return <EdgePath key={anim.key} edge={edge} theme={theme} anim={anim} state={edgeState(edge.id)} />;
      })}
      {layout.nodes
        .filter((n) => n.kind !== 'group')
        .map((node) =>
          positioned(node, (local) =>
            node.variant === 'icon' ? (
              <IconNodeShape node={local} paint={paints.get(node.id)!} ctx={ctx} />
            ) : (
              <NodeShape node={local} paint={paints.get(node.id)!} ctx={ctx} drillable={drillable.has(node.id)} />
            ),
          ),
        )}
      {layout.edges.map((edge) => {
        if (!edge.label) return null;
        const anim = edgeAnimations.get(edge)!;
        return <EdgeLabel key={anim.key} edge={edge} theme={theme} background={labelBackground(edge)} anim={anim} dimmed={edgeState(edge.id) === 'dim'} />;
      })}
      {rings.map((node) => (
        <FocusRing key={`ring-${node.id}`} node={node} theme={theme} current={!!emphasis?.current?.nodes.has(node.id)} />
      ))}
      {fullLayout.legend && (revealCount === undefined || revealCount >= fullLayout.nodes.length) && <LegendBox legend={fullLayout.legend} theme={theme} ctx={ctx} />}
      {/* Group actions sit above everything so overlapping shapes can't hide them. */}
      {layout.nodes.filter((n) => n.id === hovered && drillable.has(n.id)).map((node) => (
        <GroupActions key={node.id} node={node} theme={theme} onDrill={onDrill} onToggle={onToggleCollapse} zoom={zoom} />
      ))}
    </g>
  );
});

/** A node shifted to local (0,0) coordinates, label box included. */
function toLocal(node: LayoutNode): LayoutNode {
  const labelBox = node.labelBox && { ...node.labelBox, x: node.labelBox.x - node.x, y: node.labelBox.y - node.y };
  return { ...node, x: 0, y: 0, labelBox };
}

/** The first `count` elements of a layout: nodes (already parents-first) and then edges. */
function revealed(layout: DiagramLayout, count: number | undefined): DiagramLayout {
  if (count === undefined || count >= layout.nodes.length + layout.edges.length) return layout;
  const nodes = layout.nodes.slice(0, count);
  return { ...layout, nodes, edges: layout.edges.slice(0, Math.max(0, count - layout.nodes.length)) };
}

/** Places a shape drawn at local (0,0) coordinates; CSS transitions animate moves between layouts. */
function Positioned({ node, animated, enterDelay, className, children }: { node: LayoutNode; animated: boolean; enterDelay: number | undefined; className?: string; children: ReactNode }) {
  return (
    <g className={[animated ? 'od-item' : '', className ?? ''].join(' ').trim() || undefined} style={{ transform: `translate(${node.x}px, ${node.y}px)` }}>
      <g className={enterDelay !== undefined ? 'od-enter' : undefined} style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}>
        {children}
      </g>
    </g>
  );
}

function animationStyle(delay: number): CSSProperties | undefined {
  return delay ? { animationDelay: `${delay}ms` } : undefined;
}

interface RenderContext {
  theme: Theme;
  icons?: IconResolver;
  iconSet: IconSet;
  onDrill?: (id: string) => void;
  onLink?: (href: string, nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
  shadow: boolean;
  /** styleMode watercolor: soft painted washes instead of flat fills. */
  watercolor?: boolean;
}

function drillHandlers(id: string, drillable: boolean, onDrill?: (id: string) => void) {
  if (!drillable) return {};
  return {
    className: 'od-drillable',
    'data-drill-id': id,
    onDoubleClick: (e: MouseEvent) => {
      e.stopPropagation();
      onDrill?.(id);
    },
  };
}

/** Clicking a node selects it (details panel); its link badge, if any, opens the link. */
function selectHandlers(id: string, onSelect?: (nodeId: string) => void) {
  if (!onSelect) return {};
  return {
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      onSelect(id);
    },
  };
}

/** The filters behind styleMode watercolor: two differently wobbled, soft, grainy washes. */
export function WatercolorDefs() {
  const wash = (id: string, seed: number, scale: number, blur: number) => (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed={seed} result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale} xChannelSelector="R" yChannelSelector="G" result="wobble" />
      <feGaussianBlur in="wobble" stdDeviation={blur} result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed={seed + 11} result="grain" />
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.8 1.25" result="grainAlpha" />
      <feComposite in="soft" in2="grainAlpha" operator="in" />
    </filter>
  );
  return (
    <defs>
      {wash('od-watercolor-a', 7, 14, 2.2)}
      {wash('od-watercolor-b', 23, 9, 1)}
    </defs>
  );
}

/** Painted washes under a shape, in its colour (uncolored shapes get grey), layered like wet paint. */
export function Wash({ color, theme, children, strength = 1 }: { color: string; theme: Theme; children: ReactNode; strength?: number }) {
  const plain = color === theme.node.stroke || color === theme.node.icon;
  const paint = plain ? theme.palette.gray.stroke : color;
  const k = strength * (plain ? 0.5 : 1);
  return (
    <g fill={paint} stroke="none" aria-hidden="true">
      <g filter="url(#od-watercolor-a)" opacity={0.2 * k} transform="translate(-2 1)">
        {children}
      </g>
      <g filter="url(#od-watercolor-b)" opacity={0.26 * k} transform="translate(2 2)">
        {children}
      </g>
    </g>
  );
}

/** Flat offset shadow drawn behind a shape (Eraser's default styleMode). */
function OffsetShadow({ theme, children }: { theme: Theme; children: ReactNode }) {
  const { dx, dy, color } = theme.shadow.shape;
  return (
    <g transform={`translate(${dx}, ${dy})`} fill={color} stroke="none" aria-hidden="true">
      {children}
    </g>
  );
}

function GroupShape({ node, paint, ctx, drillable }: { node: LayoutNode; paint: Paint; ctx: RenderContext; drillable: boolean }) {
  const { theme } = ctx;
  const G = GROUP_METRICS;
  const icon = node.properties.icon ? resolveIcon(node.properties.icon, ctx.icons, ctx.iconSet) : undefined;
  const font = theme.text.group;
  const rect = <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={theme.radius.md} />;
  return (
    <g data-node-id={node.id} {...drillHandlers(node.id, drillable, ctx.onDrill)} {...selectHandlers(node.id, ctx.onSelect)}>
      {ctx.shadow && <OffsetShadow theme={theme}>{rect}</OffsetShadow>}
      {ctx.watercolor && (
        <Wash color={paint.stroke} theme={theme} strength={0.55}>
          {rect}
        </Wash>
      )}
      <g fill={ctx.watercolor ? 'none' : paint.fill} stroke={paint.stroke} strokeWidth={theme.stroke.hairline} strokeOpacity={ctx.watercolor ? 0.35 : undefined}>
        {rect}
      </g>
      {node.properties.icon && <Icon name={node.properties.icon} resolved={icon} x={node.x + 14} y={node.y + G.headerTop - 1} size={18} tint={icon?.tint ?? paint.icon} theme={theme} />}
      <text x={node.x + (node.properties.icon ? 40 : 16)} y={node.y + G.headerTop + font.size * 0.8} fontSize={font.size} fontWeight={font.weight} fill={paint.text}>
        {node.lines[0]}
      </text>
    </g>
  );
}

function NodeShape({ node, paint, ctx, drillable }: { node: LayoutNode; paint: Paint; ctx: RenderContext; drillable: boolean }) {
  const { theme } = ctx;
  const N = NODE_METRICS;
  const external = node.kind === 'external';
  const collapsed = node.kind === 'collapsed';
  const iconName = node.properties.icon ?? (collapsed ? 'group' : undefined);
  const icon = iconName ? resolveIcon(iconName, ctx.icons, ctx.iconSet) : undefined;

  const label = theme.text.node;
  const desc = theme.text.description;
  const labelLine = label.size * label.lineHeight;
  const descLine = desc.size * desc.lineHeight;
  const blockHeight = node.lines.length * labelLine + node.description.length * descLine;
  const top = node.y + (node.height - blockHeight) / 2;
  // Text is centered in the space to the right of the icon.
  const textLeft = node.x + N.paddingX + (iconName ? N.iconSize + N.iconGap : 0);
  const cx = (textLeft + node.x + node.width - N.paddingX) / 2;
  const shape = nodeOutline(node.properties.shape, node, theme);

  const link = node.properties.link;
  return (
    <g
      data-node-id={node.id}
      {...drillHandlers(node.id, drillable, ctx.onDrill)}
      {...selectHandlers(node.id, ctx.onSelect)}
      fontFamily={node.properties.typeface ? fontFamilyFor(theme, node.properties.typeface) : undefined}
    >
      {collapsed && (
        // A second card peeking out behind signals "there is more inside".
        <rect x={node.x + 6} y={node.y + 6} width={node.width} height={node.height} rx={theme.radius.lg} fill={paint.fill} stroke={paint.stroke} strokeWidth={theme.stroke.hairline} />
      )}
      {ctx.shadow && !external && !collapsed && <OffsetShadow theme={theme}>{shape.body}</OffsetShadow>}
      {ctx.watercolor && !external && (
        <Wash color={paint.stroke} theme={theme}>
          {shape.body}
        </Wash>
      )}
      <g fill={ctx.watercolor && !external ? 'none' : paint.fill} stroke={paint.stroke} strokeWidth={theme.stroke.hairline} strokeOpacity={ctx.watercolor && !external ? 0.4 : undefined} strokeDasharray={external ? '5 4' : undefined}>
        {shape.body}
      </g>
      {shape.detail && (
        <g fill="none" stroke={paint.stroke} strokeWidth={theme.stroke.hairline}>
          {shape.detail}
        </g>
      )}
      {iconName && <Icon name={iconName} resolved={icon} x={node.x + N.paddingX} y={shape.contentCenterY - N.iconSize / 2} size={N.iconSize} tint={icon?.tint ?? paint.icon} theme={theme} />}
      <text textAnchor="middle" fontSize={label.size} fontWeight={label.weight} fill={paint.text}>
        {node.lines.map((line, i) => (
          <tspan key={i} x={cx} y={top + shape.contentOffsetY + labelLine * i + label.size * 0.95}>
            {line}
          </tspan>
        ))}
      </text>
      {node.description.length > 0 && (
        <text textAnchor="middle" fontSize={desc.size} fontWeight={desc.weight} fill={paint.muted}>
          {node.description.map((line, i) => (
            <tspan key={i} x={cx} y={top + shape.contentOffsetY + node.lines.length * labelLine + descLine * i + desc.size * 1.05}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {link && <LinkBadge x={node.x + node.width - 10} y={node.y - 6} theme={theme} href={link} onOpen={() => ctx.onLink?.(link, node.id)} />}
    </g>
  );
}

/** Eraser's default for nodes with an icon: a bare glyph with the label centered underneath. */
function IconNodeShape({ node, paint, ctx }: { node: LayoutNode; paint: Paint; ctx: RenderContext }) {
  const { theme } = ctx;
  const iconName = node.properties.icon!;
  const icon = resolveIcon(iconName, ctx.icons, ctx.iconSet);
  const label = theme.text.node;
  const desc = theme.text.description;
  const box = node.labelBox ?? { x: node.x - 40, y: node.y + node.height + 8, width: node.width + 80, height: label.size * label.lineHeight };
  const cx = node.x + node.width / 2;
  const labelLine = label.size * label.lineHeight;
  const descLine = desc.size * desc.lineHeight;
  const link = node.properties.link;
  return (
    <g data-node-id={node.id} {...selectHandlers(node.id, ctx.onSelect)} fontFamily={node.properties.typeface ? fontFamilyFor(theme, node.properties.typeface) : undefined}>
      {/* Invisible hit area so the whole icon + label hovers and selects as one. */}
      <rect x={Math.min(node.x, box.x)} y={node.y} width={Math.max(node.width, box.width)} height={box.y + box.height - node.y} fill="transparent" />
      {ctx.watercolor && (
        <Wash color={paint.icon} theme={theme} strength={0.8}>
          <circle cx={cx} cy={node.y + node.height / 2} r={node.width * 0.68} />
        </Wash>
      )}
      <Icon name={iconName} resolved={icon} x={node.x} y={node.y} size={node.width} tint={icon?.tint ?? paint.icon} theme={theme} strokeWidth={0.85} />
      {link && <LinkBadge x={node.x + node.width - 6} y={node.y - 8} theme={theme} href={link} onOpen={() => ctx.onLink?.(link, node.id)} />}
      <text textAnchor="middle" fontSize={label.size} fontWeight={label.weight} fill={paint.text}>
        {node.lines.map((line, i) => (
          <tspan key={i} x={cx} y={box.y + labelLine * i + label.size * 0.95}>
            {line}
          </tspan>
        ))}
      </text>
      {node.description.length > 0 && (
        <text textAnchor="middle" fontSize={desc.size} fontWeight={desc.weight} fill={paint.muted}>
          {node.description.map((line, i) => (
            <tspan key={i} x={cx} y={box.y + node.lines.length * labelLine + descLine * i + desc.size * 1.05}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

interface Outline {
  body: ReactNode;
  /** Extra strokes drawn over the body (e.g. a cylinder's rim). */
  detail?: ReactNode;
  /** Shift of the text block, for shapes whose visual center isn't the box center. */
  contentOffsetY: number;
  contentCenterY: number;
}

/** Outline for every shape in Eraser's flow chart syntax, drawn inside the node's box. */
function nodeOutline(shape: string | undefined, n: LayoutNode, theme: Theme): Outline {
  const { x, y, width: w, height: h } = n;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const plain = (body: ReactNode, contentOffsetY = 0): Outline => ({ body, contentOffsetY, contentCenterY: cy + contentOffsetY });
  const polygon = (points: [number, number][], contentOffsetY = 0) => plain(<polygon points={points.map((p) => p.join(',')).join(' ')} strokeLinejoin="round" />, contentOffsetY);
  const inset = Math.min(w * 0.15, 24);
  switch (shape) {
    case 'oval':
      return plain(<rect x={x} y={y} width={w} height={h} rx={h / 2} />);
    case 'ellipse':
      return plain(<ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />);
    case 'circle': {
      const r = Math.max(w, h) / 2;
      return plain(<ellipse cx={cx} cy={cy} rx={r} ry={r} />);
    }
    case 'diamond':
      return polygon([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
    case 'hexagon':
      return polygon([[x + inset, y], [x + w - inset, y], [x + w, cy], [x + w - inset, y + h], [x + inset, y + h], [x, cy]]);
    case 'parallelogram':
      return polygon([[x + inset, y], [x + w, y], [x + w - inset, y + h], [x, y + h]]);
    case 'trapezoid':
      return polygon([[x + inset, y], [x + w - inset, y], [x + w, y + h], [x, y + h]]);
    case 'triangle':
      // Text sits in the wide lower part.
      return polygon([[cx, y], [x + w, y + h], [x, y + h]], h * 0.16);
    case 'star': {
      const points: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.48;
        points.push([cx + (w / 2) * r * Math.cos(angle), cy + 4 + (h / 2) * r * Math.sin(angle)]);
      }
      return polygon(points, 6);
    }
    case 'document': {
      // Wavy bottom edge.
      const wave = Math.min(10, h * 0.14);
      return plain(<path d={`M${x},${y} H${x + w} V${y + h - wave} C${x + w * 0.75},${y + h - wave * 2.6} ${x + w * 0.5},${y + h + wave * 0.6} ${x},${y + h - wave * 0.4} Z`} strokeLinejoin="round" />, -wave / 3);
    }
    case 'cylinder': {
      const ry = Math.min(14, h * 0.18);
      return {
        body: <path d={`M${x},${y + ry} a${w / 2},${ry} 0 0,1 ${w},0 v${h - ry * 2} a${w / 2},${ry} 0 0,1 ${-w},0 z`} />,
        detail: <path d={`M${x},${y + ry} a${w / 2},${ry} 0 0,0 ${w},0`} />,
        contentOffsetY: ry / 2,
        contentCenterY: cy + ry / 2,
      };
    }
    default:
      return plain(<rect x={x} y={y} width={w} height={h} rx={theme.radius.lg} />);
  }
}

/** Font family for a typeface setting: clean (default), mono, or the hand-drawn rough face. */
export function fontFamilyFor(theme: Theme, typeface: string | undefined): string {
  return typeface === 'mono' ? theme.font.mono : typeface === 'rough' ? theme.font.rough : theme.font.sans;
}

/** The legend: a card of swatches (line style, color, icon, shape) and labels. */
function LegendBox({ legend, theme, ctx }: { legend: LayoutLegend; theme: Theme; ctx: RenderContext }) {
  const L = LEGEND_METRICS;
  const font = theme.text.description;
  return (
    <g className="od-legend" transform={`translate(${legend.x}, ${legend.y})`}>
      <rect width={legend.width} height={legend.height} rx={theme.radius.lg} fill={theme.color.surface} stroke={theme.color.border} />
      <text x={L.padding} y={L.padding + 11} fontSize={font.size} fontWeight={600} fill={theme.color.textMuted}>
        Legend
      </text>
      {legend.items.map((item, i) => {
        const top = L.padding + L.titleHeight + i * L.rowHeight;
        const mid = top + 8;
        const color = lineColor(theme, item.color) ?? theme.color.edge;
        const swatchX = L.padding;
        let swatch: ReactNode;
        if (item.connection) {
          const dashed = item.connection.startsWith('--');
          const end = item.connection.includes('>');
          const start = item.connection.startsWith('<');
          swatch = (
            <g>
              <line x1={swatchX + 2} y1={mid} x2={swatchX + L.swatchWidth - 2} y2={mid} stroke={color} strokeWidth={1.25} strokeDasharray={dashed ? '4 3' : undefined} />
              {end && <ArrowHead tip={{ x: swatchX + L.swatchWidth, y: mid }} from={{ x: swatchX, y: mid }} color={color} />}
              {start && <ArrowHead tip={{ x: swatchX, y: mid }} from={{ x: swatchX + L.swatchWidth, y: mid }} color={color} open={end} />}
            </g>
          );
        } else if (item.icon) {
          const icon = resolveIcon(item.icon, ctx.icons, ctx.iconSet);
          swatch = <Icon name={item.icon} resolved={icon} x={swatchX + L.swatchWidth / 2 - 9} y={mid - 9} size={18} tint={icon?.tint ?? theme.node.icon} theme={theme} />;
        } else if (item.shape) {
          const paint = item.color ? { fill: swatchFor(theme, item.color)?.nodeFill ?? theme.node.fill, stroke: swatchFor(theme, item.color)?.stroke ?? theme.node.stroke } : { fill: theme.node.fill, stroke: theme.node.stroke };
          const mini = nodeOutline(item.shape, { x: swatchX + 2, y: mid - 8, width: L.swatchWidth - 4, height: 16 } as LayoutNode, theme);
          swatch = (
            <g fill={paint.fill} stroke={paint.stroke} strokeWidth={1}>
              {mini.body}
            </g>
          );
        } else {
          const s = swatchFor(theme, item.color);
          swatch = <rect x={swatchX + 6} y={mid - 7} width={L.swatchWidth - 12} height={14} rx={3} fill={s?.nodeFill ?? theme.node.fill} stroke={s?.stroke ?? theme.node.stroke} />;
        }
        return (
          <g key={i}>
            {swatch}
            <text x={swatchX + L.swatchWidth + L.gap} y={mid + font.size * 0.36} fontSize={font.size} fill={theme.color.text}>
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Accent ring around the selected node and the current flow step's nodes. */
function FocusRing({ node, theme, current }: { node: LayoutNode; theme: Theme; current: boolean }) {
  const label = node.labelBox;
  const x = Math.min(node.x, label?.x ?? node.x) - 6;
  const y = node.y - 6;
  const right = Math.max(node.x + node.width, label ? label.x + label.width : 0) + 6;
  const bottom = (label ? label.y + label.height : node.y + node.height) + 6;
  return (
    <rect
      className={current ? 'od-pulse' : undefined}
      x={x}
      y={y}
      width={right - x}
      height={bottom - y}
      rx={theme.radius.lg + 4}
      fill="none"
      stroke={theme.color.accent}
      strokeWidth={2}
      pointerEvents="none"
    />
  );
}

/** Small link badge on nodes that carry `link:`. */
function LinkBadge({ x, y, theme, href, onOpen }: { x: number; y: number; theme: Theme; href: string; onOpen: () => void }) {
  return (
    <g
      className="od-link"
      transform={`translate(${x}, ${y})`}
      role="link"
      aria-label={`Open ${href}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <title>{href}</title>
      <circle cx={7} cy={7} r={8} fill={theme.color.surface} stroke={theme.color.border} />
      <g transform="translate(2.5, 2.5) scale(0.375)" fill="none" stroke={theme.color.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </g>
    </g>
  );
}

type EdgeState = 'normal' | 'dim' | 'current';

function EdgePath({ edge, theme, anim, state = 'normal' }: { edge: LayoutEdge; theme: Theme; anim: EdgeAnimation; state?: EdgeState }) {
  const color = state === 'current' ? theme.color.accent : (lineColor(theme, edge.color) ?? theme.color.edge);
  const { points } = edge;
  if (points.length < 2) return null;
  const width = state === 'current' ? theme.stroke.strong + 0.5 : edge.count > 1 ? theme.stroke.strong : theme.stroke.edge;
  // Stop the line at the arrowhead's base so the tip stays crisp.
  const trimmed = points.map((p) => ({ ...p }));
  if (edge.endArrow) trimmed[trimmed.length - 1] = toward(points.at(-1)!, points.at(-2)!, ARROW_LENGTH - 1);
  if (edge.startArrow) trimmed[0] = toward(points[0]!, points[1]!, ARROW_LENGTH - 1);
  // Solid lines draw on from source to target; dashed ones (whose dash pattern
  // would clash with the draw trick) fade in instead.
  const draws = anim.kind === 'draw' && !edge.dashed;
  const lineClass = draws ? 'od-draw' : anim.kind !== 'none' ? 'od-fade' : undefined;
  const drawMs = anim.duration ?? EDGE_DRAW_MS;
  const headDelay = anim.delay + (draws ? drawMs - Math.min(80, drawMs / 3) : 0);
  const headClass = anim.kind !== 'none' ? 'od-fade' : undefined;
  return (
    <g className={state === 'dim' ? 'od-dim' : undefined}>
      {state === 'current' && <path className="od-march" d={roundedPath(trimmed, 6)} fill="none" stroke={theme.color.accent} strokeWidth={width} strokeDasharray="8 7" strokeLinecap="round" />}
      <path
        className={lineClass}
        style={draws && drawMs !== EDGE_DRAW_MS ? { ...animationStyle(anim.delay), animationDuration: `${drawMs}ms` } : animationStyle(anim.delay)}
        pathLength={draws ? 1 : undefined}
        d={roundedPath(trimmed, 6)}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={edge.dashed ? '6 5' : undefined}
        strokeOpacity={state === 'current' ? 0.25 : undefined}
      />
      {edge.endArrow && <ArrowHead tip={points.at(-1)!} from={points.at(-2)!} color={color} className={headClass} delay={headDelay} />}
      {edge.startArrow && <ArrowHead tip={points[0]!} from={points[1]!} color={color} className={headClass} delay={draws ? anim.delay : headDelay} open={edge.endArrow} />}
    </g>
  );
}

const ARROW_LENGTH = 8;

/**
 * Small filled triangle, as in Eraser's diagrams. The start of a two-way arrow
 * gets an open chevron instead (`open`), which is how Eraser draws `<>`.
 */
function ArrowHead({ tip, from, color, className, delay = 0, open = false }: { tip: Point; from: Point; color: string; className?: string; delay?: number; open?: boolean }) {
  const length = dist(from, tip) || 1;
  const ux = (tip.x - from.x) / length;
  const uy = (tip.y - from.y) / length;
  const bx = tip.x - ux * ARROW_LENGTH;
  const by = tip.y - uy * ARROW_LENGTH;
  const half = ARROW_LENGTH * 0.45;
  const points = `${bx - uy * half},${by + ux * half} ${tip.x},${tip.y} ${bx + uy * half},${by - ux * half}`;
  if (open) {
    return <polyline className={className} style={animationStyle(delay)} points={points} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return <polygon className={className} style={animationStyle(delay)} points={points} fill={color} />;
}

function EdgeLabel({ edge, theme, background, anim, dimmed }: { edge: LayoutEdge; theme: Theme; background: string; anim: EdgeAnimation; dimmed?: boolean }) {
  const label = edge.label!;
  const font = theme.text.edge;
  const color = lineColor(theme, edge.color) ?? theme.color.text;
  const delay = anim.delay + (anim.kind === 'draw' ? (anim.duration ?? EDGE_DRAW_MS) / 2 : 0);
  return (
    <g className={[anim.kind !== 'none' ? 'od-fade' : '', dimmed ? 'od-dim' : ''].join(' ').trim() || undefined} style={animationStyle(delay)}>
      <rect x={label.x} y={label.y} width={label.width} height={label.height} fill={background} />
      <text x={label.x + label.width / 2} y={label.y + label.height / 2 + font.size * 0.36} fontSize={font.size} fontWeight={font.weight} textAnchor="middle" fill={color}>
        {label.text}
      </text>
    </g>
  );
}

/**
 * Actions shown above a group (or collapsed group) on hover: collapse it into a
 * single box / show its contents again in place, and open it in its own view
 * (drill down, Eraser's "Expand").
 */
function GroupActions({ node, theme, onDrill, onToggle, zoom }: { node: LayoutNode; theme: Theme; onDrill?: (id: string) => void; onToggle?: (id: string) => void; zoom: number }) {
  // Counter the canvas zoom (never shrinking below natural size) so the pill stays clickable.
  const scale = 1 / Math.min(1, Math.max(zoom, 0.25));
  const collapsed = node.kind === 'collapsed';
  const height = 24;
  const toggleWidth = collapsed ? 66 : 82;
  const openWidth = 64;
  const button = (x: number, width: number, label: string, icon: string[], onClick: () => void, title: string) => (
    <g
      className="od-action"
      transform={`translate(${x}, 0)`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      role="button"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width={width} height={height} fill="transparent" />
      <g transform="translate(8, 5) scale(0.58)" fill="none" stroke={theme.color.onAccent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {icon.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <text x={28} y={16} fontSize={12.5} fontWeight={600} fill={theme.color.onAccent}>
        {label}
      </text>
    </g>
  );
  return (
    <g className="od-expand" data-expand-for={node.id} transform={`translate(${node.x + 8}, ${node.y - (height * scale) / 2}) scale(${scale})`}>
      <rect width={toggleWidth + openWidth} height={height} rx={theme.radius.md} fill={theme.color.accent} />
      <line x1={toggleWidth} y1={5} x2={toggleWidth} y2={height - 5} stroke={theme.color.onAccent} strokeOpacity={0.35} />
      {button(0, toggleWidth, collapsed ? 'Show' : 'Collapse', collapsed ? ICON_MAXIMIZE : ICON_MINIMIZE, () => onToggle?.(node.id), collapsed ? `Show the contents of ${node.id}` : `Collapse ${node.id}`)}
      {button(toggleWidth, openWidth, 'Open', ICON_LAYERS, () => onDrill?.(node.id), `Open ${node.id} in its own view`)}
    </g>
  );
}

// Lucide paths (ISC) for the hover actions.
const ICON_MINIMIZE = ['m14 10 7-7', 'M20 10h-6V4', 'm3 21 7-7', 'M4 14h6v6'];
const ICON_MAXIMIZE = ['M15 3h6v6', 'm21 3-7 7', 'm3 21 7-7', 'M9 21H3v-6'];
const ICON_LAYERS = [
  'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
  'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
  'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
];

/** Icons are monochrome like Eraser's; only provider-tinted cloud glyphs keep a color. */
export function Icon({ name, resolved, x, y, size, tint, theme, strokeWidth = 1.6 }: { name: string; resolved: ResolvedIcon | undefined; x: number; y: number; size: number; tint: string; theme: Theme; strokeWidth?: number }) {
  if (!resolved) return <IconPlaceholder name={name} x={x} y={y} size={size} color={tint} theme={theme} />;
  const { icon } = resolved;
  if (icon.kind === 'image') {
    return <image href={icon.href} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid meet" aria-label={icon.title} />;
  }
  if (icon.kind === 'inline') {
    // Root presentation attributes (kebab-case in the source SVG) become React props.
    const attrs = Object.fromEntries(Object.entries(icon.attrs).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v === 'currentColor' ? tint : v]));
    return (
      <svg
        x={x}
        y={y}
        width={size}
        height={size}
        viewBox={icon.viewBox}
        color={tint}
        fill={tint}
        {...attrs}
        aria-label={icon.title}
        // Markup is sanitized at build time (scripts, handlers and external refs stripped).
        dangerouslySetInnerHTML={{ __html: icon.body }}
      />
    );
  }
  const viewBox = icon.viewBox ?? '0 0 24 24';
  if (icon.kind === 'brand') {
    return (
      <svg x={x} y={y} width={size} height={size} viewBox={viewBox} aria-label={icon.title}>
        <path d={icon.path} fill={tint} />
      </svg>
    );
  }
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={viewBox} fill="none" stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-label={icon.title}>
      {icon.elements.map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
    </svg>
  );
}

/** Unknown icon names render as a tile with an abbreviation (aws-foo → FOO). */
function IconPlaceholder({ name, x, y, size, color, theme }: { name: string; x: number; y: number; size: number; color: string; theme: Theme }) {
  const abbreviation = (name.split('-').at(-1) ?? name).slice(0, 3).toUpperCase();
  return (
    <g transform={`translate(${x}, ${y})`}>
      <title>{`Unknown icon: ${name}`}</title>
      <rect width={size} height={size} rx={size * 0.25} fill={theme.color.hover} stroke={theme.color.borderStrong} strokeWidth={1} />
      <text x={size / 2} y={size / 2 + size * 0.14} fontSize={size * (abbreviation.length > 2 ? 0.32 : 0.4)} fontWeight={700} textAnchor="middle" fill={color}>
        {abbreviation}
      </text>
    </g>
  );
}

/** Polyline with rounded corners. */
function roundedPath(points: Point[], radius: number): string {
  if (points.length === 0) return '';
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = toward(cur, prev, r);
    const b = toward(cur, next, r);
    d += ` L${a.x},${a.y} Q${cur.x},${cur.y} ${b.x},${b.y}`;
  }
  const last = points.at(-1)!;
  return `${d} L${last.x},${last.y}`;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function toward(from: Point, to: Point, distance: number): Point {
  const length = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
}
