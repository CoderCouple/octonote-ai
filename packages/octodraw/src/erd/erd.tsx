import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { ErdConnector, ErdDiagram, ErdEntity } from '../dsl/erd';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import type { ViewPlacements } from '../layout/arrange';
import { estimateTextWidth, type Point, type TextMeasurer } from '../layout/layout';
import { swatchFor } from '../react/theme';
import type { Theme } from '../theme/tokens';
import { Icon, Wash, WatercolorDefs } from '../react/DiagramSvg';

// Layout and rendering for entity relationship diagrams: tables as cards with
// one row per column, relationships leaving from the column rows with
// crow's-foot or Chen cardinality markers.

const HEADER = 38;
const ROW = 26;
const PAD_X = 14;
/** Table header height and side padding (for overlays such as the inline name editor). */
export const ERD_METRICS = { header: HEADER, paddingX: PAD_X, iconWidth: 26, nameSize: 14, labelSize: 12, row: ROW, rowOffset: 4, cellSize: 12.5 } as const;
const MIN_WIDTH = 190;
const GAP = 28;
/** Relationship lines for tables at their current positions (after layout or hand placement). */
function routeErd(diagram: ErdDiagram, all: ErdTableLayout[], min: { width: number; height: number } = { width: 0, height: 0 }): ErdLayout {
  const tables = new Map(all.map((t) => [t.entity.name, t]));
  const anchorY = (table: ErdTableLayout, attribute: string | undefined) => {
    // A hidden column's line meets the header.
    const row = attribute ? table.attributes.findIndex((a) => a.name === attribute) : -1;
    return row < 0 ? table.y + HEADER / 2 : table.y + HEADER + row * ROW + ROW / 2;
  };

  // Lines crossing the same gap get their own vertical lane so they don't merge into one trunk.
  const laneCount = new Map<string, number>();
  const laneOf = (key: string) => {
    const n = laneCount.get(key) ?? 0;
    laneCount.set(key, n + 1);
    return n;
  };
  const links: ErdLinkLayout[] = diagram.relationships.map((r) => {
    const a = tables.get(r.from.entity)!;
    const b = tables.get(r.to.entity)!;
    const ay = anchorY(a, r.from.attribute);
    const by = anchorY(b, r.to.attribute);
    let points: Point[];
    if (a === b) {
      // Self relationship: loop out of the right side.
      const x = a.x + a.width;
      points = [{ x, y: ay }, { x: x + STUB * 1.6, y: ay }, { x: x + STUB * 1.6, y: by }, { x, y: by }];
    } else if (a.x + a.width + STUB < b.x || b.x + b.width + STUB < a.x) {
      // Side by side: leave and enter on the facing sides.
      const right = a.x < b.x;
      const sx = right ? a.x + a.width : a.x;
      const tx = right ? b.x : b.x + b.width;
      const lane = laneOf(`${Math.round(Math.min(sx, tx))}:${Math.round(Math.max(sx, tx))}`);
      const mid = (sx + tx) / 2 + (lane % 2 === 0 ? 1 : -1) * Math.ceil(lane / 2) * 12;
      points = ay === by ? [{ x: sx, y: ay }, { x: tx, y: by }] : [{ x: sx, y: ay }, { x: mid, y: ay }, { x: mid, y: by }, { x: tx, y: by }];
    } else {
      // Stacked: both on the right, around the wider table.
      const x = Math.max(a.x + a.width, b.x + b.width) + STUB;
      points = [{ x: a.x + a.width, y: ay }, { x, y: ay }, { x, y: by }, { x: b.x + b.width, y: by }];
    }
    return { id: r.id, from: r.from.entity, to: r.to.entity, points, ...cardinality(r.connector), label: r.label, color: r.properties.color };
  });

  const width = Math.max(min.width, ...links.flatMap((l) => l.points.map((p) => p.x + 24)), ...all.map((t) => t.x + t.width + 24));
  const height = Math.max(min.height, ...all.map((t) => t.y + t.height + 24));
  return { width, height, tables: all, links };
}

/**
 * Applies hand placements (top-left per table name) to an ERD layout and re-routes
 * the relationships; synchronous, so dragging a table doesn't wait for ELK.
 */
export function arrangeErd(diagram: ErdDiagram, layout: ErdLayout, placements: Record<string, { x: number; y: number }> | undefined): ErdLayout {
  if (!placements || !layout.tables.some((t) => placements[t.entity.name])) return layout;
  // Tables stay right/below the top-left padding, so layout and placement coordinates stay the same.
  const moved = layout.tables.map((t) => (placements[t.entity.name] ? { ...t, x: Math.max(24, placements[t.entity.name]!.x), y: Math.max(24, placements[t.entity.name]!.y) } : t));
  return routeErd(diagram, moved);
}

const STUB = 22;

/**
 * The hand-placements level that remembers which tables show only their key
 * columns (`{ [table]: { x: 0, y: 0 } }`), so "Key columns only" is saved with
 * the figure like dragged tables (level ''). ERD diagrams have no drill levels,
 * so the key can't clash with one; renames move it with `renamePlacements`.
 */
export const ERD_COLLAPSED_KEY = '#erd-collapsed';

/** The tables saved as collapsed in a figure's placements. */
export function erdCollapsedFrom(placements: ViewPlacements | undefined): Set<string> {
  return new Set(Object.keys(placements?.[ERD_COLLAPSED_KEY] ?? {}));
}

/** Placements with the collapsed tables written in (the level is dropped when none are). */
export function withErdCollapsed(placements: ViewPlacements, collapsed: ReadonlySet<string>): ViewPlacements {
  const next = { ...placements };
  if (collapsed.size) next[ERD_COLLAPSED_KEY] = Object.fromEntries([...collapsed].sort().map((name) => [name, { x: 0, y: 0 }]));
  else delete next[ERD_COLLAPSED_KEY];
  return next;
}

export interface ErdTableLayout {
  entity: ErdEntity;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rows shown: every column, or only key columns when the table is collapsed. */
  attributes: ErdEntity['attributes'];
  /** Columns hidden by collapsing. */
  hidden: number;
}

const isKey = (a: ErdEntity['attributes'][number]) => a.meta.some((m) => /^(pk|fk)$/i.test(m));
/** Rows of a table: all, or the key columns when collapsed. */
const visibleRows = (entity: ErdEntity, collapsed: boolean) => (collapsed ? entity.attributes.filter(isKey) : entity.attributes);

export interface ErdLinkLayout {
  id: string;
  from: string;
  to: string;
  points: Point[];
  /** Cardinality at the start and end of the line. */
  startMany: boolean;
  endMany: boolean;
  label?: string;
  color?: string;
}

export interface ErdLayout {
  width: number;
  height: number;
  tables: ErdTableLayout[];
  links: ErdLinkLayout[];
}

const elk = new ELK();

const fontOf = (theme: Theme) => ({ name: { size: 14, weight: 600 }, cell: { size: 12.5, weight: 400 }, type: { size: 12, weight: 400 }, family: theme.font.sans });

/** `<` one-to-many, `>` many-to-one, `-` one-to-one, `<>` many-to-many. */
function cardinality(connector: ErdConnector): { startMany: boolean; endMany: boolean } {
  return { startMany: connector === '>' || connector === '<>', endMany: connector === '<' || connector === '<>' };
}

export async function layoutErd(diagram: ErdDiagram, options: { measureText?: TextMeasurer; theme: Theme; collapsed?: ReadonlySet<string> }): Promise<ErdLayout> {
  const collapsed = options.collapsed ?? new Set<string>();
  const measure = options.measureText ?? estimateTextWidth;
  const f = fontOf(options.theme);
  const sizes = new Map<string, { width: number; height: number }>();
  for (const entity of diagram.entities.values()) {
    const nameW = measure(entity.label, f.name) + (entity.properties.icon ? 26 : 0);
    const colW = Math.max(0, ...entity.attributes.map((a) => measure(a.name, f.cell) + (a.meta.some((m) => /^(pk|fk)$/i.test(m)) ? 30 : 0)));
    const typeW = Math.max(0, ...entity.attributes.map((a) => (a.type ? measure(a.type, f.type) : 0)));
    const rows = visibleRows(entity, collapsed.has(entity.name));
    const more = entity.attributes.length - rows.length;
    sizes.set(entity.name, {
      width: Math.ceil(Math.max(MIN_WIDTH, nameW + PAD_X * 2 + 20, colW + typeW + GAP + PAD_X * 2)),
      // A collapsed table keeps its key columns plus a "N more" row.
      height: HEADER + Math.max(1, rows.length + (more ? 1 : 0)) * ROW + 6,
    });
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'false',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: [...diagram.entities.keys()].map((id) => ({ id, ...sizes.get(id)! })),
    edges: diagram.relationships.filter((r) => r.from.entity !== r.to.entity).map((r) => ({ id: r.id, sources: [r.from.entity], targets: [r.to.entity] })),
  };
  const result = await elk.layout(graph);
  const tables = new Map<string, ErdTableLayout>();
  for (const child of result.children ?? []) {
    const entity = diagram.entities.get(child.id)!;
    const attributes = visibleRows(entity, collapsed.has(child.id));
    tables.set(child.id, { entity, x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0, attributes, hidden: entity.attributes.length - attributes.length });
  }

  return routeErd(diagram, [...tables.values()], { width: result.width ?? 0, height: result.height ?? 0 });
}

export interface ErdSvgProps {
  layout: ErdLayout;
  diagram: ErdDiagram;
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Draw-in: how many tables (then relationships) are shown; undefined shows all. */
  reveal?: number;
  /** The selected table: it and what it's related to stay bright, the rest dims. */
  focus?: string | null;
  onSelect?: (table: string) => void;
  /** Collapse or expand a table (its header gets a toggle). */
  onToggle?: (table: string) => void;
  /** Relationships drawn selected (accent colour), by id. */
  selectedLinks?: ReadonlySet<string>;
  /** Makes relationships clickable (a wide invisible hit line, `data-edge-id`). */
  onSelectLink?: (id: string) => void;
  /** Column rows drawn selected (accent row), by `table.column`. */
  selectedColumns?: ReadonlySet<string>;
  /** Makes column rows clickable (`data-column-id="table.column"`); the table header still selects the table. */
  onSelectColumn?: (id: string) => void;
}

export function ErdSvg({ layout, diagram, theme, icons, iconSet, reveal, focus, onSelect, onToggle, selectedLinks, onSelectLink, selectedColumns, onSelectColumn }: ErdSvgProps) {
  const f = fontOf(theme);
  const crows = diagram.settings.notation === 'crows-feet';
  const tables = reveal === undefined ? layout.tables : layout.tables.slice(0, reveal);
  const shownTables = new Set(tables.map((t) => t.entity.name));
  const links = reveal === undefined ? layout.links : layout.links.slice(0, Math.max(0, reveal - layout.tables.length)).filter((l) => shownTables.has(l.from) && shownTables.has(l.to));
  const related = focus ? new Set([focus, ...layout.links.flatMap((l) => (l.from === focus ? [l.to] : l.to === focus ? [l.from] : []))]) : null;
  const dimTable = (name: string) => (related && !related.has(name) ? 'od-dim' : undefined);
  const dimLink = (l: ErdLinkLayout) => (focus && l.from !== focus && l.to !== focus ? 'od-dim' : undefined);
  const watercolor = diagram.settings.styleMode === 'watercolor';
  const shadow = diagram.settings.styleMode !== 'plain' && !watercolor;
  return (
    <g fontFamily={f.family}>
      {watercolor && <WatercolorDefs />}
      {links.map((link) => {
        const picked = selectedLinks?.has(link.id) ?? false;
        const color = picked ? theme.color.accent : link.color ? (swatchFor(theme, link.color)?.ink ?? link.color) : theme.color.edge;
        const pts = link.points;
        const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={link.id} className={dimLink(link)} stroke={color} fill="none" strokeWidth={theme.stroke.edge * ((focus && !dimLink(link)) || picked ? 2 : 1.2)}>
            <polyline points={polyline} strokeLinejoin="round" />
            {onSelectLink && (
              <polyline
                data-edge-id={link.id}
                points={polyline}
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink(link.id);
                }}
              />
            )}
            <Cardinality at={pts[0]!} toward={pts[1]!} many={link.startMany} crows={crows} color={color} theme={theme} />
            <Cardinality at={pts.at(-1)!} toward={pts.at(-2)!} many={link.endMany} crows={crows} color={color} theme={theme} />
            {link.label && (
              <text x={(pts[0]!.x + pts.at(-1)!.x) / 2} y={Math.min(...pts.map((p) => p.y)) - 6} fontSize={12} textAnchor="middle" fill={theme.color.textMuted} stroke="none">
                {link.label}
              </text>
            )}
          </g>
        );
      })}
      {tables.map(({ entity, x, y, width, height, attributes, hidden }) => {
        const swatch = swatchFor(theme, entity.properties.color);
        const stroke = swatch?.stroke ?? theme.node.stroke;
        const icon = entity.properties.icon ? resolveIcon(entity.properties.icon, icons, iconSet) : undefined;
        return (
          <g
            key={entity.name}
            data-node-id={entity.name}
            className={dimTable(entity.name)}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation();
                    onSelect(entity.name);
                  }
                : undefined
            }
          >
            {shadow && <rect x={x + 4} y={y + 4} width={width} height={height} rx={theme.radius.lg} fill={theme.shadow.shape.color} />}
            {watercolor && (
              <Wash color={stroke} theme={theme} strength={0.8}>
                <rect x={x} y={y} width={width} height={height} rx={theme.radius.lg} />
              </Wash>
            )}
            <rect x={x} y={y} width={width} height={height} rx={theme.radius.lg} fill={theme.color.surface} fillOpacity={watercolor ? 0.55 : 1} stroke={focus === entity.name ? theme.color.accent : stroke} strokeOpacity={watercolor && focus !== entity.name ? 0.45 : 1} strokeWidth={focus === entity.name ? 2 : 1} />
            <path d={`M${x},${y + HEADER} V${y + theme.radius.lg} a${theme.radius.lg},${theme.radius.lg} 0 0 1 ${theme.radius.lg},${-theme.radius.lg} H${x + width - theme.radius.lg} a${theme.radius.lg},${theme.radius.lg} 0 0 1 ${theme.radius.lg},${theme.radius.lg} V${y + HEADER} Z`} fill={watercolor ? 'none' : (swatch?.nodeFill ?? theme.color.hover)} stroke={stroke} strokeOpacity={watercolor ? 0.45 : 1} />
            {icon && <Icon name={entity.properties.icon!} resolved={icon} x={x + PAD_X} y={y + HEADER / 2 - 9} size={18} tint={icon.tint ?? swatch?.icon ?? theme.node.icon} theme={theme} />}
            <text x={x + PAD_X + (icon ? 26 : 0)} y={y + HEADER / 2 + f.name.size * 0.36} fontSize={f.name.size} fontWeight={f.name.weight} fill={theme.color.text}>
              {entity.label}
            </text>
            {onToggle && (entity.attributes.some((a) => !isKey(a)) || hidden > 0) && (
              <g
                className="od-action"
                role="button"
                aria-label={hidden ? `Show all columns of ${entity.label}` : `Collapse ${entity.label}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(entity.name);
                }}
              >
                <title>{hidden ? 'Show all columns' : 'Show only key columns'}</title>
                <rect x={x + width - 26} y={y + HEADER / 2 - 10} width={20} height={20} rx={4} fill="transparent" />
                <path d={hidden ? `M${x + width - 20},${y + HEADER / 2 - 2} l4,4 l4,-4` : `M${x + width - 20},${y + HEADER / 2 + 2} l4,-4 l4,4`} fill="none" stroke={theme.color.textMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {hidden > 0 && (
              <text x={x + PAD_X} y={y + HEADER + attributes.length * ROW + ROW / 2 + 4 + f.cell.size * 0.36} fontSize={f.cell.size - 0.5} fill={theme.color.textMuted}>
                {hidden} more column{hidden > 1 ? 's' : ''}
              </text>
            )}
            {attributes.map((a, i) => {
              const rowY = y + HEADER + i * ROW + ROW / 2 + 4;
              const key = a.meta.find((m) => /^(pk|fk)$/i.test(m))?.toUpperCase();
              const columnId = `${entity.name}.${a.name}`;
              const picked = selectedColumns?.has(columnId) ?? false;
              const rowTop = rowY - ROW / 2;
              const pick = onSelectColumn
                ? {
                    'data-column-id': columnId,
                    style: { cursor: 'pointer' },
                    onClick: (e: { stopPropagation: () => void }) => {
                      e.stopPropagation();
                      onSelectColumn(columnId);
                    },
                  }
                : {};
              return (
                <g key={a.name} {...pick}>
                  {onSelectColumn && <rect x={x + 1} y={rowTop} width={width - 2} height={ROW} fill="transparent" />}
                  {picked && <rect x={x + 3} y={rowTop + 2} width={width - 6} height={ROW - 4} rx={4} fill={theme.color.accentSoft} stroke={theme.color.accent} strokeWidth={1.5} />}
                  {i > 0 && <line x1={x + 1} x2={x + width - 1} y1={rowY - ROW / 2} y2={rowY - ROW / 2} stroke={theme.color.border} />}
                  {key && (
                    <g>
                      <rect x={x + PAD_X} y={rowY - 8} width={24} height={16} rx={4} fill={key === 'PK' ? theme.color.accentSoft : theme.color.hover} />
                      <text x={x + PAD_X + 12} y={rowY + 3.5} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={key === 'PK' ? theme.color.accent : theme.color.textMuted}>
                        {key}
                      </text>
                    </g>
                  )}
                  <text x={x + PAD_X + (key ? 30 : 0)} y={rowY + f.cell.size * 0.36} fontSize={f.cell.size} fontWeight={key === 'PK' ? 600 : f.cell.weight} fill={theme.color.text}>
                    {a.name}
                  </text>
                  {a.type && (
                    <text x={x + width - PAD_X} y={rowY + f.type.size * 0.36} fontSize={f.type.size} textAnchor="end" fill={theme.color.textMuted} fontFamily={theme.font.mono}>
                      {a.type}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** One or many at a line end: crow's-foot glyphs, or Chen's "1" / "N" labels. */
function Cardinality({ at, toward, many, crows, color, theme }: { at: Point; toward: Point; many: boolean; crows: boolean; color: string; theme: Theme }) {
  const len = Math.hypot(toward.x - at.x, toward.y - at.y) || 1;
  const ux = (toward.x - at.x) / len;
  const uy = (toward.y - at.y) / len;
  const px = -uy;
  const py = ux;
  if (!crows) {
    return (
      <text x={at.x + ux * 12 + px * 9} y={at.y + uy * 12 + py * 9 + 4} fontSize={11.5} fontWeight={600} textAnchor="middle" fill={color} stroke="none">
        {many ? 'N' : '1'}
      </text>
    );
  }
  const bar = (d: number) => `M${at.x + ux * d + px * 7},${at.y + uy * d + py * 7} L${at.x + ux * d - px * 7},${at.y + uy * d - py * 7}`;
  if (!many) return <path d={`${bar(8)} ${bar(13)}`} stroke={color} strokeWidth={theme.stroke.edge * 1.2} />;
  const base = { x: at.x + ux * 14, y: at.y + uy * 14 };
  return <path d={`M${base.x},${base.y} L${at.x + px * 8},${at.y + py * 8} M${base.x},${base.y} L${at.x},${at.y} M${base.x},${base.y} L${at.x - px * 8},${at.y - py * 8} ${bar(18)}`} stroke={color} strokeWidth={theme.stroke.edge * 1.2} />;
}
