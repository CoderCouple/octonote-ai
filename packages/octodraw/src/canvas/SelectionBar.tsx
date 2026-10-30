import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { CopyFormat, ExportFormat } from '../react/OctoDiagram';
import { swatchFor } from '../react/theme';
import { PALETTE_NAMES, type Theme } from '../theme/tokens';
import { fontFamily, STICKY_FONT_SIZE } from './items';
import {
  colorPartPatch,
  isColorValue,
  lineHeads,
  lineRoute,
  routePatch,
  strokeStyleOf,
  STROKE_WIDTHS,
  STYLE_KEYS,
  wholeColorPatch,
  type ArrowHead,
  type Box,
  type CanvasItem,
  type ColorPart,
  type FontFamily,
  type ItemPatch,
  type LayerMove,
  type LineRoute,
  type ShapeKind,
  type StrokeStyle,
  type StyleKey,
} from './model';

// The floating bar above a selection on the free-form canvas: grouped buttons
// that open small sub-menus (colour, stroke, text, line ends…), then Arrange,
// Comment and More. It shows only what the selection can use; a mixed
// selection gets the controls its items share, and values that differ read
// "Mixed". Every choice is one `onStyle` call, which the canvas commits as a
// single undo step.

export type BarMenu = 'shape' | 'color' | 'stroke' | 'text' | 'line' | 'start' | 'end' | 'arrange' | 'more' | 'link' | 'export';

export interface SelectionBarProps {
  box: Box;
  cam: { x: number; y: number; k: number };
  items: CanvasItem[];
  theme: Theme;
  /** The open sub-menu (owned by the canvas, so a click on the canvas closes it). */
  menu: BarMenu | null;
  onMenu: (menu: BarMenu | null) => void;
  /** Leave room above the selection for the rotate handle. */
  clearance?: number;
  /** Patch every selected item (undefined skips one); one call = one undo step. */
  onStyle: (patchFor: (item: CanvasItem) => ItemPatch | undefined) => void;
  onArrange: (move: LayerMove) => void;
  onRotate?: (degrees: number | 'reset') => void;
  onExportFigure?: (action: { download: ExportFormat } | { copy: CopyFormat }) => void;
  onOpenFigure?: () => void;
  onAskAi?: () => void;
  onEnter?: () => void;
  onToFigure?: () => void;
  onComment?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLock: () => void;
  onLink: (link: string | undefined) => void;
  onCopyStyle: () => void;
  /** Present when a style has been copied. */
  onPasteStyle?: () => void;
}

const MIXED = Symbol('mixed');
type Maybe<T> = T | typeof MIXED | undefined;
/** The shared value of a list, MIXED when they differ, undefined when empty. */
function common<T>(values: T[]): Maybe<T> {
  if (!values.length) return undefined;
  return values.every((v) => v === values[0]) ? values[0] : MIXED;
}

export const FONT_SIZES = [
  ['S', 14],
  ['M', 20],
  ['L', 32],
  ['XL', 48],
] as const;
const FONTS: [FontFamily, string][] = [
  ['sans', 'Sans'],
  ['serif', 'Serif'],
  ['mono', 'Mono'],
  ['hand', 'Hand'],
];
const WIDTH_NAMES: Record<(typeof STROKE_WIDTHS)[number], string> = { 1: 'Thin', 1.5: 'Normal', 2.5: 'Bold', 4: 'Extra bold' };
const HEADS: [ArrowHead, string][] = [
  ['none', 'None'],
  ['arrow', 'Arrow'],
  ['open', 'Open arrow'],
  ['dot', 'Dot'],
  ['diamond', 'Diamond'],
];
const ROUTES: [LineRoute, string][] = [
  ['straight', 'Straight'],
  ['curved', 'Curved'],
  ['elbow', 'Elbow'],
];
const SHAPES: [ShapeKind, string, string][] = [
  ['rectangle', 'Rectangle', 'M4 6h16v12H4z'],
  ['ellipse', 'Ellipse', 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z'],
  ['diamond', 'Diamond', 'M12 3l9 9-9 9-9-9z'],
];
const ALIGN_ICONS = { left: 'M4 6h16M4 12h10M4 18h13', center: 'M4 6h16M7 12h10M5.5 18h13', right: 'M4 6h16M10 12h10M7 18h13' } as const;
const VALIGN_ICONS = { top: 'M4 4h16M12 8v12M8 12l4-4 4 4', middle: 'M4 12h16M12 3v5M12 16v5', bottom: 'M4 20h16M12 4v12M8 12l4 4 4-4' } as const;

const has = (item: CanvasItem, key: StyleKey) => STYLE_KEYS[item.type].includes(key);
const clampSize = (v: number) => Math.max(6, Math.min(400, Math.round(v)));

/** The label size an item draws with. */
export function fontSizeOf(item: CanvasItem, theme: Theme): number | undefined {
  if (item.type === 'text') return item.fontSize;
  if (item.type === 'shape') return item.fontSize ?? theme.text.node.size;
  if (item.type === 'sticky') return item.fontSize ?? STICKY_FONT_SIZE;
  return undefined;
}

type Placement = { at: 'bottom' } | { at: 'lifted'; bottom: number } | { at: 'top' };
/** Space between the docked bar and the canvas edge (px). */
const DOCK_GAP = 16;
/** Room the bar needs above a selection before it moves to the top instead (px). */
const TOP_ROOM = 52;

export function SelectionBar(props: SelectionBarProps) {
  const { box, cam, items, theme, menu, onMenu, onStyle } = props;
  const barRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>({ at: 'bottom' });
  // Docked at the bottom centre, always in the same place; lifted just above the
  // selection when it would cover it, and at the top when there's no room for that.
  useLayoutEffect(() => {
    const el = barRef.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const H = root.clientHeight;
    const W = root.clientWidth;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const sel = { x: cam.x + box.x * cam.k, y: cam.y + box.y * cam.k, w: box.w * cam.k, h: box.h * cam.k };
    const docked = { x: (W - w) / 2, y: H - DOCK_GAP - h, w, h };
    let next: Placement = { at: 'bottom' };
    // Narrow canvases keep the bar at the top (CSS): the tools run along the bottom there.
    const compact = W <= 640;
    const covers = !compact && docked.x - 8 < sel.x + sel.w && sel.x < docked.x + w + 8 && docked.y - 8 < sel.y + sel.h && sel.y < docked.y + h + 8;
    if (compact) next = { at: 'top' };
    else if (covers) {
      const above = sel.y - 12 - (props.clearance ?? 0);
      next = above - h >= TOP_ROOM ? { at: 'lifted', bottom: Math.round(H - above) } : { at: 'top' };
    }
    setPlacement((p) => (p.at === next.at && (p.at !== 'lifted' || (next.at === 'lifted' && Math.abs(p.bottom - next.bottom) < 1)) ? p : next));
  });
  const below = placement.at === 'top';
  const styled = items.filter((i) => i.type !== 'figure');
  const all = (pred: (i: CanvasItem) => boolean) => styled.length > 0 && styled.every(pred);
  const onlyShapes = all((i) => i.type === 'shape');
  const onlyLines = all((i) => i.type === 'line');
  const onlyStickies = all((i) => i.type === 'sticky');
  const colorable = all((i) => has(i, 'color'));
  const strokeStyleable = all((i) => has(i, 'strokeStyle'));
  const widthable = all((i) => has(i, 'strokeWidth'));
  const textable = all((i) => has(i, 'fontSize'));
  const toggle = (name: BarMenu) => onMenu(menu === name ? null : name);
  const anchor = (name: BarMenu, button: ReactNode, pop: ReactNode, role: 'menu' | 'dialog' = 'menu', label?: string) => (
    <span className="occ-menu-anchor">
      {button}
      {menu === name && (
        <Popover role={role} label={label ?? name} below={below} onClose={() => onMenu(null)}>
          {pop}
        </Popover>
      )}
    </span>
  );
  const barButton = (name: BarMenu, title: string, content: ReactNode) => (
    <button type="button" className="occ-bar-btn" data-bar="" data-menu={name} aria-haspopup="true" aria-expanded={menu === name} aria-label={title} title={title} onClick={() => toggle(name)}>
      {content}
      <Caret />
    </button>
  );

  // Current values ("Mixed" when they differ).
  const mainColor = common(styled.map((i) => (i.type === 'shape' ? (i.fillColor ?? i.strokeColor ?? i.color) : i.color)));
  const sizes = common(styled.map((i) => fontSizeOf(i, theme)));
  const locked = items.length > 0 && items.every((i) => i.locked);
  const link = items.length === 1 ? items[0]!.link : undefined;

  const onBarKey = (e: ReactKeyboardEvent) => {
    if ((e.target as Element).closest('.occ-pop, .occ-menu')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return;
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-bar')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      const name = target.getAttribute('data-menu') as BarMenu | null;
      if (name && menu !== name) onMenu(name);
      return;
    }
    const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-bar]')];
    const i = buttons.indexOf(target);
    buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={barRef}
      className={`occ-selbar occ-chrome${below ? ' occ-selbar-below' : ''}`}
      role="toolbar"
      aria-label="Selection"
      style={placement.at === 'top' ? { left: '50%', top: DOCK_GAP, transform: 'translateX(-50%)' } : { left: '50%', bottom: placement.at === 'lifted' ? placement.bottom : DOCK_GAP, transform: 'translateX(-50%)' }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={onBarKey}
    >
      {props.onOpenFigure && (
        <button type="button" className="occ-bar-btn" data-bar="" onClick={props.onOpenFigure} title="Edit this figure's code" aria-label="Edit code">
          <Glyph d="M16 18l6-6-6-6M8 6l-6 6 6 6" /> Code
        </button>
      )}
      {props.onEnter && (
        <button type="button" className="occ-bar-btn" data-bar="" onClick={props.onEnter} title="Work inside the figure: drill down, collapse, flows (Enter)" aria-label="Open figure">
          Open
        </button>
      )}
      {props.onAskAi && (
        <button type="button" className="occ-bar-btn" data-bar="" onClick={props.onAskAi} title="Ask the assistant to change this figure" aria-label="Ask AI">
          <Glyph d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /> Ask AI
        </button>
      )}
      {props.onExportFigure && (
        <span className="occ-menu-anchor">
          <button type="button" className="occ-bar-btn" data-bar="" data-menu="export" onClick={() => toggle('export')} aria-expanded={menu === 'export'} title="Export this figure" aria-label="Export this figure">
            <Glyph d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </button>
          {menu === 'export' && (
            <Popover role="menu" label="Export this figure" below={below} onClose={() => onMenu(null)} className="occ-menu">
              <div className="occ-menu-label">Download</div>
              {(
                [
                  ['png', 'PNG image'],
                  ['svg', 'SVG vector'],
                  ['pdf', 'PDF document'],
                  ['json', 'Eraser JSON'],
                  ['xml', 'Eraser XML'],
                ] as [ExportFormat, string][]
              ).map(([format, label]) => (
                <button key={format} type="button" role="menuitem" onClick={() => props.onExportFigure!({ download: format })}>
                  {label}
                </button>
              ))}
              <div className="occ-menu-sep" />
              <div className="occ-menu-label">Copy</div>
              {(
                [
                  ['png', 'PNG image'],
                  ['svg', 'SVG vector'],
                  ['json', 'Eraser JSON'],
                ] as [CopyFormat, string][]
              ).map(([format, label]) => (
                <button key={format} type="button" role="menuitem" onClick={() => props.onExportFigure!({ copy: format })}>
                  {label}
                </button>
              ))}
            </Popover>
          )}
        </span>
      )}
      {props.onToFigure && (
        <button type="button" className="occ-bar-btn" data-bar="" onClick={props.onToFigure} title="Turn these boxes and arrows into a diagram figure (with code)" aria-label="Turn into a diagram">
          <Glyph d="M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4a2 2 0 0 1 2 2V14" /> To diagram
        </button>
      )}

      {onlyShapes &&
        anchor(
          'shape',
          barButton('shape', 'Shape', <Glyph d={SHAPES.find(([s]) => s === common(styled.map((i) => (i.type === 'shape' ? i.shape : undefined))))?.[2] ?? SHAPES[0]![2]} />),
          SHAPES.map(([shape, label, d]) => {
            const current = common(styled.map((i) => (i.type === 'shape' ? i.shape : undefined)));
            return (
              <button key={shape} type="button" role="menuitemradio" aria-checked={current === shape} onClick={() => onStyle((i) => (i.type === 'shape' ? { shape } : undefined))}>
                <span className="occ-pop-row">
                  <Glyph d={d} /> {label}
                </span>
                {current === shape && <Check />}
              </button>
            );
          }),
          'menu',
          'Shape',
        )}

      {colorable &&
        anchor(
          'color',
          barButton(
            'color',
            'Colour',
            <span className="occ-color-dot" style={{ background: mainColor === MIXED ? 'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)' : (swatchFor(theme, mainColor)?.stroke ?? theme.node.stroke) }} />,
          ),
          <ColorPopover items={styled} theme={theme} onStyle={onStyle} tabs={onlyShapes ? ['stroke', 'fill', 'text'] : onlyStickies ? ['fill', 'text'] : null} />,
          'dialog',
          'Colour',
        )}

      {styled.length > 0 &&
        anchor(
          'stroke',
          barButton(
            'stroke',
            widthable || strokeStyleable ? 'Stroke and opacity' : 'Opacity',
            widthable || strokeStyleable ? <Glyph d="M4 7h16M4 12h16M4 17h3M10 17h4M17 17h3" /> : <Glyph d="M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18" />,
          ),
          <StrokePopover items={styled} onStyle={onStyle} style={strokeStyleable} width={widthable} />,
          'dialog',
          'Stroke',
        )}

      {textable &&
        anchor(
          'text',
          barButton(
            'text',
            'Text',
            <span className="occ-bar-label">
              Aa <small>{sizes === MIXED ? '–' : sizes}</small>
            </span>,
          ),
          <TextPopover items={styled} theme={theme} onStyle={onStyle} />,
          'dialog',
          'Text',
        )}

      {onlyLines && (
        <>
          {anchor(
            'line',
            barButton('line', 'Line route', <RoutePreview route={common(styled.map((i) => (i.type === 'line' ? lineRoute(i) : undefined))) as LineRoute} />),
            ROUTES.map(([route, label]) => {
              const current = common(styled.map((i) => (i.type === 'line' ? lineRoute(i) : undefined)));
              return (
                <button key={route} type="button" role="menuitemradio" aria-checked={current === route} onClick={() => onStyle((i) => (i.type === 'line' ? routePatch(i, route) : undefined))}>
                  <span className="occ-pop-row">
                    <RoutePreview route={route} /> {label}
                  </span>
                  {current === route && <Check />}
                </button>
              );
            }),
            'menu',
            'Line route',
          )}
          {(['start', 'end'] as const).map((which) => {
            const current = common(styled.map((i) => (i.type === 'line' ? lineHeads(i)[which] : undefined)));
            const label = which === 'start' ? 'Start' : 'End';
            return (
              <span key={which} style={{ display: 'contents' }}>
                {anchor(
                  which,
                  barButton(which, `${label} arrowhead`, <HeadPreview head={current === MIXED || !current ? 'none' : current} which={which} />),
                  HEADS.map(([head, name]) => (
                    <button key={head} type="button" role="menuitemradio" aria-checked={current === head} onClick={() => onStyle((i) => (i.type === 'line' ? (which === 'start' ? { startHead: head } : { endHead: head }) : undefined))}>
                      <span className="occ-pop-row">
                        <HeadPreview head={head} which={which} /> {name}
                      </span>
                      {current === head && <Check />}
                    </button>
                  )),
                  'menu',
                  `${label} arrowhead`,
                )}
              </span>
            );
          })}
        </>
      )}

      <span className="occ-bar-sep" />
      {anchor(
        'arrange',
        barButton('arrange', 'Arrange: layer order and rotation', <Glyph d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />),
        <>
          {(
            [
              ['front', 'Bring to front', '⇧⌘]'],
              ['forward', 'Bring forward', '⌘]'],
              ['backward', 'Send backward', '⌘['],
              ['back', 'Send to back', '⇧⌘['],
            ] as [LayerMove, string, string][]
          ).map(([move, label, keys]) => (
            <button key={move} type="button" role="menuitem" onClick={() => props.onArrange(move)}>
              {label} <kbd>{keys}</kbd>
            </button>
          ))}
          {props.onRotate && (
            <>
              <div className="occ-menu-sep" />
              <button type="button" role="menuitem" onClick={() => props.onRotate!(90)}>
                Rotate 90° <kbd>⇧R</kbd>
              </button>
              {items.some((i) => i.rotation) && (
                <button type="button" role="menuitem" onClick={() => props.onRotate!('reset')}>
                  Reset rotation
                </button>
              )}
            </>
          )}
        </>,
        'menu',
        'Arrange',
      )}
      {props.onComment && (
        <button type="button" className="occ-bar-btn" data-bar="" onClick={props.onComment} title="Comment" aria-label="Comment">
          <Glyph d="M4 5h16v11H9l-5 4z" />
        </button>
      )}
      <span className="occ-menu-anchor">
        <button type="button" className="occ-bar-btn" data-bar="" data-menu="more" aria-haspopup="true" aria-expanded={menu === 'more' || menu === 'link'} title="More" aria-label="More" onClick={() => toggle(menu === 'link' ? 'link' : 'more')}>
          <Glyph d="M5 12h.01M12 12h.01M19 12h.01" />
        </button>
        {menu === 'more' && (
          <Popover role="menu" label="More" below={below} onClose={() => onMenu(null)}>
            <button type="button" role="menuitem" onClick={props.onDuplicate}>
              Duplicate <kbd>⌘D</kbd>
            </button>
            <button type="button" role="menuitem" onClick={props.onLock}>
              {locked ? 'Unlock' : 'Lock'} <kbd>⇧⌘L</kbd>
            </button>
            {items.length === 1 && (
              <button type="button" role="menuitem" onClick={() => onMenu('link')}>
                {link ? 'Edit link…' : 'Add link…'}
              </button>
            )}
            <div className="occ-menu-sep" />
            <button type="button" role="menuitem" onClick={props.onCopyStyle}>
              Copy style <kbd>⌥⌘C</kbd>
            </button>
            <button type="button" role="menuitem" disabled={!props.onPasteStyle} onClick={props.onPasteStyle}>
              Paste style <kbd>⌥⌘V</kbd>
            </button>
            <div className="occ-menu-sep" />
            <button type="button" role="menuitem" className="occ-danger" onClick={props.onDelete}>
              Delete <kbd>⌫</kbd>
            </button>
          </Popover>
        )}
        {menu === 'link' && (
          <Popover role="dialog" label="Link" below={below} onClose={() => onMenu(null)}>
            <LinkEditor value={link} onDone={(next) => (props.onLink(next), onMenu(null))} />
          </Popover>
        )}
      </span>
    </div>
  );
}

/** A sub-menu: arrow keys move between its controls, Escape closes it and returns focus to its button. */
function Popover({ children, role, label, below, onClose, className }: { children: ReactNode; role: 'menu' | 'dialog'; label: string; below: boolean; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ side: 'above' | 'below'; dx: number; maxHeight?: number }>({ side: below ? 'below' : 'above', dx: 0 });
  // Keep the sub-menu inside the canvas: open on the side with room, shift it sideways, scroll when nothing fits.
  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.closest('.occ-root');
    const anchor = el?.parentElement;
    if (!el || !root || !anchor) return;
    const r = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const roomAbove = a.top - b.top - 14;
    const roomBelow = b.bottom - a.bottom - 14;
    // Narrow canvases pin the bar to the top and always open below (CSS).
    const compact = root.clientWidth <= 640;
    let side: 'above' | 'below' = compact || r.top >= a.top ? 'below' : 'above';
    if (!compact && side === 'above' && r.height > roomAbove && roomBelow > roomAbove) side = 'below';
    else if (!compact && side === 'below' && r.height > roomBelow && roomAbove > roomBelow) side = 'above';
    const room = side === 'above' ? roomAbove : roomBelow;
    const dx = compact ? 0 : r.left < b.left + 8 ? b.left + 8 - r.left : r.right > b.right - 8 ? b.right - 8 - r.right : 0;
    setPlace({ side, dx, maxHeight: r.height > room ? Math.max(120, room) : undefined });
  }, []);
  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], button:not([disabled]), input');
    first?.focus({ preventScroll: true });
  }, []);
  const opener = () => ref.current?.closest('.occ-menu-anchor')?.querySelector<HTMLElement>('[data-menu]');
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const button = opener();
      onClose();
      button?.focus();
      return;
    }
    const step = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    // Keep the canvas from moving the selection; inputs (sliders, text) use the keys themselves.
    e.stopPropagation();
    if (target.tagName === 'INPUT') return;
    e.preventDefault();
    const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input') ?? [])];
    if (!controls.length) return;
    const i = controls.indexOf(target);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? controls.length - 1 : (i + step! + controls.length) % controls.length;
    controls[next]?.focus();
  };
  return (
    <div
      ref={ref}
      className={`${className ?? 'occ-pop'} occ-pop-${place.side}`}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ marginLeft: place.dx || undefined, maxHeight: place.maxHeight, overflowY: place.maxHeight ? 'auto' : undefined }}
    >
      {children}
    </div>
  );
}

function ColorPopover({ items, theme, onStyle, tabs }: { items: CanvasItem[]; theme: Theme; onStyle: SelectionBarProps['onStyle']; tabs: ColorPart[] | null }) {
  const [tab, setTab] = useState<ColorPart>(tabs?.[0] ?? 'stroke');
  const valueOf = (item: CanvasItem): string | undefined => {
    if (!tabs) return item.color;
    if (item.type === 'shape') return tab === 'stroke' ? (item.strokeColor ?? item.color) : tab === 'fill' ? (item.fillColor ?? item.color) : item.textColor;
    if (item.type === 'sticky') return tab === 'text' ? item.textColor : item.color;
    return item.color;
  };
  const value = common(items.map(valueOf));
  const pick = (color: string | undefined) => onStyle((item) => (tabs ? colorPartPatch(item, tab, color) : wholeColorPatch(item, color)));
  const fill = common(items.map((i) => (i.type === 'shape' ? (i.fill ?? 'tint') : undefined)));
  const TAB_NAMES: Record<ColorPart, string> = { stroke: 'Border', fill: items[0]?.type === 'sticky' ? 'Paper' : 'Fill', text: 'Text' };
  return (
    <>
      {tabs && (
        <div className="occ-tabs" role="tablist" aria-label="Which colour">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {TAB_NAMES[t]}
            </button>
          ))}
        </div>
      )}
      <ColorGrid theme={theme} value={value} onPick={pick} defaultColor={tabs && items[0]?.type === 'sticky' && tab === 'fill' ? 'yellow' : undefined} />
      {tabs && tab === 'fill' && items[0]?.type === 'shape' && (
        <div className="occ-pop-section">
          <div className="occ-pop-label">Fill</div>
          <div className="occ-seg" role="group" aria-label="Fill style">
            {(
              [
                ['tint', 'Tint'],
                ['solid', 'Solid'],
                ['none', 'None'],
              ] as const
            ).map(([style, label]) => (
              <button key={style} type="button" aria-pressed={fill === style} title={`${label} fill`} onClick={() => onStyle((i) => (i.type === 'shape' ? { fill: style === 'tint' ? undefined : style } : undefined))}>
                <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x={4} y={4} width={16} height={16} rx={3} fill={style === 'none' ? 'none' : 'currentColor'} fillOpacity={style === 'solid' ? 1 : 0.25} stroke="currentColor" strokeWidth={2} />
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Default tile, the palette and a custom colour. */
function ColorGrid({ theme, value, onPick, defaultColor }: { theme: Theme; value: Maybe<string>; onPick: (color: string | undefined) => void; defaultColor?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  // Commit once the picker closes (`change`), not on every drag step (`input`).
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onChange = () => isColorValue(el.value) && pickRef.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  const custom = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
  const isPalette = typeof value === 'string' && (PALETTE_NAMES as readonly string[]).includes(value.toLowerCase());
  const defaultSwatch = swatchFor(theme, defaultColor);
  return (
    <div className="occ-color-grid" role="group" aria-label="Colours">
      <button type="button" className="occ-swatch occ-swatch-default" aria-pressed={value === undefined || value === defaultColor} title="Default" aria-label="Default colour" onClick={() => onPick(undefined)} style={{ background: defaultSwatch?.stroke ?? theme.node.stroke }} />
      {PALETTE_NAMES.filter((name) => name !== defaultColor).map((name) => (
        <button key={name} type="button" className="occ-swatch" aria-pressed={value === name} title={name} aria-label={name} onClick={() => onPick(name)} style={{ background: swatchFor(theme, name)!.stroke }} />
      ))}
      <label className="occ-swatch occ-swatch-custom" title="Custom colour" aria-pressed={!!value && value !== MIXED && !isPalette && value !== defaultColor} style={custom ? { background: custom } : undefined}>
        <input ref={input} type="color" aria-label="Custom colour" defaultValue={custom ?? '#3b82f6'} />
      </label>
      {value === MIXED && <span className="occ-pop-note">Mixed</span>}
    </div>
  );
}

function StrokePopover({ items, onStyle, style, width }: { items: CanvasItem[]; onStyle: SelectionBarProps['onStyle']; style: boolean; width: boolean }) {
  const styles = common(items.map((i) => strokeStyleOf(i as { strokeStyle?: StrokeStyle; dashed?: boolean })));
  const widths = common(items.map((i) => ('strokeWidth' in i ? i.strokeWidth : undefined) ?? 1.5));
  const opacity = common(items.map((i) => i.opacity ?? 1));
  const [shown, setShown] = useState(opacity === MIXED || opacity === undefined ? 1 : opacity);
  const range = useRef<HTMLInputElement>(null);
  const styleRef = useRef(onStyle);
  styleRef.current = onStyle;
  // One undo step per drag: commit on release (`change`).
  useEffect(() => {
    const el = range.current;
    if (!el) return;
    const onChange = () => {
      const v = Math.round(Number(el.value)) / 100;
      styleRef.current(() => ({ opacity: v >= 1 ? undefined : v }));
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return (
    <>
      {style && (
        <div className="occ-pop-section">
          <div className="occ-pop-label">Style</div>
          <div className="occ-seg" role="group" aria-label="Line style">
            {(['solid', 'dashed', 'dotted'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={styles === s} title={s[0]!.toUpperCase() + s.slice(1)} aria-label={s} onClick={() => onStyle((i) => (has(i, 'strokeStyle') ? { strokeStyle: s === 'solid' ? undefined : s } : undefined))}>
                <svg width={36} height={12} viewBox="0 0 36 12" aria-hidden="true">
                  <line x1={3} y1={6} x2={33} y2={6} stroke="currentColor" strokeWidth={2} strokeLinecap={s === 'dotted' ? 'round' : 'butt'} strokeDasharray={s === 'dashed' ? '6 4' : s === 'dotted' ? '0.5 5' : undefined} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
      {width && (
        <div className="occ-pop-section">
          <div className="occ-pop-label">Width</div>
          <div className="occ-seg" role="group" aria-label="Line width">
            {STROKE_WIDTHS.map((w) => (
              <button key={w} type="button" aria-pressed={widths === w} title={WIDTH_NAMES[w]} aria-label={WIDTH_NAMES[w]} onClick={() => onStyle((i) => (has(i, 'strokeWidth') ? { strokeWidth: w === 1.5 ? undefined : w } : undefined))}>
                <svg width={28} height={12} viewBox="0 0 28 12" aria-hidden="true">
                  <line x1={3} y1={6} x2={25} y2={6} stroke="currentColor" strokeWidth={w * 1.2} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="occ-pop-section">
        <div className="occ-pop-label">
          Opacity <span>{opacity === MIXED && shown === 1 ? 'Mixed' : `${Math.round(shown * 100)}%`}</span>
        </div>
        <input ref={range} className="occ-range" type="range" min={10} max={100} step={5} defaultValue={Math.round(shown * 100)} aria-label="Opacity" onInput={(e) => setShown(Number((e.target as HTMLInputElement).value) / 100)} />
      </div>
    </>
  );
}

function TextPopover({ items, theme, onStyle }: { items: CanvasItem[]; theme: Theme; onStyle: SelectionBarProps['onStyle'] }) {
  const size = common(items.map((i) => fontSizeOf(i, theme)));
  const bold = common(items.map((i) => ('bold' in i ? !!i.bold : false)));
  const italic = common(items.map((i) => ('italic' in i ? !!i.italic : false)));
  const font = common(items.map((i) => ('font' in i ? (i.font ?? 'sans') : 'sans')));
  const alignable = items.every((i) => has(i, 'align'));
  const valignable = items.every((i) => has(i, 'valign'));
  const align = common(items.map((i) => (i.type === 'shape' ? (i.align ?? 'center') : i.type === 'text' ? (i.align ?? 'left') : undefined)));
  const valign = common(items.map((i) => (i.type === 'shape' ? (i.valign ?? 'middle') : undefined)));
  const resize = (to: (current: number) => number) => onStyle((i) => {
    const current = fontSizeOf(i, theme);
    return current === undefined ? undefined : { fontSize: clampSize(to(current)) };
  });
  return (
    <>
      <div className="occ-pop-section">
        <div className="occ-pop-label">Size</div>
        <div className="occ-stepper">
          <button type="button" aria-label="Smaller text" title="Smaller" onClick={() => resize((v) => v - 2)}>
            <Glyph d="M5 12h14" />
          </button>
          <span className="occ-stepper-value" aria-live="polite">
            {size === MIXED ? 'Mixed' : `${size}px`}
          </span>
          <button type="button" aria-label="Larger text" title="Larger" onClick={() => resize((v) => v + 2)}>
            <Glyph d="M12 5v14M5 12h14" />
          </button>
        </div>
        <div className="occ-seg" role="group" aria-label="Size presets">
          {FONT_SIZES.map(([label, px]) => (
            <button key={label} type="button" aria-pressed={size === px} title={`${px}px`} aria-label={`Size ${label} (${px}px)`} onClick={() => resize(() => px)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="occ-pop-section">
        <div className="occ-seg" role="group" aria-label="Emphasis">
          <button type="button" aria-pressed={bold === true} title="Bold" aria-label="Bold" style={{ fontWeight: 700 }} onClick={() => onStyle(() => ({ bold: bold === true ? undefined : true }))}>
            B
          </button>
          <button type="button" aria-pressed={italic === true} title="Italic" aria-label="Italic" style={{ fontStyle: 'italic', fontFamily: 'serif' }} onClick={() => onStyle(() => ({ italic: italic === true ? undefined : true }))}>
            I
          </button>
        </div>
      </div>
      <div className="occ-pop-section">
        <div className="occ-pop-label">Font</div>
        <div className="occ-pop-list" role="group" aria-label="Font">
          {FONTS.map(([f, label]) => (
            <button key={f} type="button" role="menuitemradio" aria-checked={font === f} onClick={() => onStyle(() => ({ font: f === 'sans' ? undefined : f }))}>
              <span style={{ fontFamily: fontFamily(theme, f) }}>{label}</span>
              {font === f && <Check />}
            </button>
          ))}
        </div>
      </div>
      {alignable && (
        <div className="occ-pop-section">
          <div className="occ-pop-label">Align</div>
          <div className="occ-seg" role="group" aria-label="Horizontal alignment">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={align === a} title={`Align ${a}`} aria-label={`Align ${a}`} onClick={() => onStyle((i) => (i.type === 'shape' ? { align: a === 'center' ? undefined : a } : i.type === 'text' ? { align: a === 'left' ? undefined : a } : undefined))}>
                <Glyph d={ALIGN_ICONS[a]} />
              </button>
            ))}
          </div>
          {valignable && (
            <div className="occ-seg" role="group" aria-label="Vertical position">
              {(['top', 'middle', 'bottom'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={valign === v} title={`Text ${v}`} aria-label={`Text ${v}`} onClick={() => onStyle((i) => (i.type === 'shape' ? { valign: v === 'middle' ? undefined : v } : undefined))}>
                  <Glyph d={VALIGN_ICONS[v]} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The link field of "Add link…": Enter saves, an empty field removes the link. */
function LinkEditor({ value, onDone }: { value: string | undefined; onDone: (link: string | undefined) => void }) {
  const [text, setText] = useState(value ?? '');
  const save = () => {
    const v = text.trim();
    onDone(!v ? undefined : /^https?:\/\//i.test(v) ? v : `https://${v}`);
  };
  return (
    <form
      className="occ-link-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input type="url" value={text} placeholder="https://…" aria-label="Link" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()} />
      <div className="occ-link-actions">
        {value && (
          <button type="button" className="occ-button" onClick={() => onDone(undefined)}>
            Remove
          </button>
        )}
        <button type="submit" className="occ-button occ-button-primary">
          Save
        </button>
      </div>
    </form>
  );
}

function RoutePreview({ route }: { route: LineRoute | undefined }) {
  const d = route === 'curved' ? 'M3 17Q12 -1 21 13' : route === 'elbow' ? 'M3 17H12V7H21' : 'M3 17L21 7';
  return <Glyph d={d} />;
}

/** A short line with the arrowhead drawn at its start (pointing left) or end (pointing right). */
function HeadPreview({ head, which }: { head: ArrowHead; which: 'start' | 'end' }) {
  const flip = which === 'start' ? 'scale(-1 1) translate(-24 0)' : undefined;
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <g transform={flip} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={head === 'none' ? 'M3 12h18' : 'M3 12h13'} />
        {head === 'arrow' && <path d="M14 7l7 5-7 5z" fill="currentColor" />}
        {head === 'open' && <path d="M15 7l6 5-6 5M15 12h5" />}
        {head === 'dot' && <circle cx={18} cy={12} r={3.2} fill="currentColor" />}
        {head === 'diamond' && <path d="M14 12l3.5-4 3.5 4-3.5 4z" fill="currentColor" />}
      </g>
    </svg>
  );
}

function Caret() {
  return (
    <svg className="occ-caret" width={8} height={8} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return <Glyph d="M5 12.5l4.5 4.5L19 7.5" />;
}

export function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Styles of the bar's sub-menus and the right-click menu (appended to the canvas stylesheet). */
export const SELECTION_BAR_CSS = `
.occ-bar-sep { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--od-color-border); }
.occ-bar-label { display: inline-flex; align-items: baseline; gap: 3px; font-weight: 600; }
.occ-bar-label small { font-size: 10.5px; font-weight: 500; color: var(--od-color-text-muted); font-variant-numeric: tabular-nums; }
.occ-caret { margin-left: -2px; color: var(--od-color-text-subtle); }
.occ-color-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 1px var(--od-color-border); }
.occ-pop { position: absolute; left: 50%; transform: translateX(-50%); z-index: 3; display: flex; flex-direction: column; gap: 8px; min-width: 200px; padding: 8px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); white-space: normal; }
.occ-pop-above { bottom: calc(100% + 8px); }
.occ-pop-below { top: calc(100% + 8px); }
.occ-menu.occ-pop-above { top: auto; bottom: calc(100% + 8px); }
.occ-pop[role="menu"] { gap: 0; padding: 4px; min-width: 170px; }
.occ-pop[role="menu"] > button, .occ-pop-list > button { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 12px; border: 0; background: none; color: var(--od-color-text); padding: 6px 8px; border-radius: var(--od-radius-sm); cursor: pointer; text-align: left; font: inherit; }
.occ-pop[role="menu"] > button:hover, .occ-pop-list > button:hover, .occ-pop[role="menu"] > button:focus-visible, .occ-pop-list > button:focus-visible { background: var(--od-color-hover); outline: none; }
.occ-pop[role="menu"] > button:disabled { color: var(--od-color-text-subtle); cursor: default; background: none; }
.occ-pop[role="menu"] > button.occ-danger { color: var(--od-color-danger); }
.occ-pop-row { display: inline-flex; align-items: center; gap: 8px; }
.occ-pop-section { display: flex; flex-direction: column; gap: 5px; }
.occ-pop-label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--od-color-text-subtle); text-transform: uppercase; letter-spacing: 0.04em; }
.occ-pop-label span { text-transform: none; letter-spacing: 0; color: var(--od-color-text-muted); font-variant-numeric: tabular-nums; }
.occ-pop-note { grid-column: 1 / -1; font-size: 11px; color: var(--od-color-text-muted); }
.occ-pop-list { display: flex; flex-direction: column; }
.occ-seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--od-radius-md); background: var(--od-color-hover); }
.occ-seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 28px; height: 26px; padding: 0 6px; border: 0; border-radius: var(--od-radius-sm); background: none; color: var(--od-color-text-muted); font-size: 12px !important; cursor: pointer; }
.occ-seg button:hover { color: var(--od-color-text); }
.occ-seg button[aria-pressed="true"] { background: var(--od-color-raised); color: var(--od-color-text); box-shadow: 0 0 0 1px var(--od-color-border); }
.occ-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--od-color-border); }
.occ-tabs button { flex: 1; height: 26px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--od-color-text-muted); font-size: 12px !important; font-weight: 600; cursor: pointer; }
.occ-tabs button[aria-selected="true"] { color: var(--od-color-text); border-bottom-color: var(--od-color-accent); }
.occ-color-grid { display: grid; grid-template-columns: repeat(6, 22px); gap: 6px; justify-content: start; }
.occ-color-grid .occ-swatch { width: 22px; height: 22px; }
.occ-swatch-default { position: relative; overflow: hidden; }
.occ-swatch-default::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; background: var(--od-color-raised); transform: rotate(45deg); }
.occ-swatch-custom { position: relative; display: inline-block; box-sizing: border-box; background: conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444); }
.occ-swatch-custom[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--od-color-accent); }
.occ-swatch-custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.occ-swatch:focus-visible, .occ-swatch-custom:focus-within { outline: 2px solid var(--od-color-accent); outline-offset: 1px; }
.occ-stepper { display: flex; align-items: center; gap: 4px; }
.occ-stepper button { display: grid; place-items: center; width: 28px; height: 26px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-sm); background: var(--od-color-surface); color: var(--od-color-text); cursor: pointer; }
.occ-stepper button:hover { background: var(--od-color-hover); }
.occ-stepper-value { flex: 1; text-align: center; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.occ-range { width: 100%; accent-color: var(--od-color-accent); }
.occ-link-form { display: flex; flex-direction: column; gap: 8px; min-width: 240px; }
.occ-link-form input { box-sizing: border-box; width: 100%; height: 30px; padding: 0 8px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); background: var(--od-color-surface); color: var(--od-color-text); font: inherit; outline: none; }
.occ-link-form input:focus { border-color: var(--od-color-accent); }
.occ-link-actions { display: flex; justify-content: flex-end; gap: 6px; }
.occ-bar-btn:focus-visible, .occ-seg button:focus-visible, .occ-tabs button:focus-visible, .occ-stepper button:focus-visible { outline: 2px solid var(--od-color-accent); outline-offset: -2px; }
.occ-ctx { position: absolute; z-index: 6; min-width: 220px; padding: 4px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome), 0 16px 32px -12px rgba(0,0,0,0.25); }
.occ-ctx button { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 16px; border: 0; background: none; color: var(--od-color-text); padding: 6px 8px; border-radius: var(--od-radius-sm); cursor: pointer; text-align: left; font: inherit; }
.occ-ctx button:hover, .occ-ctx button:focus-visible, .occ-ctx button[aria-expanded="true"] { background: var(--od-color-hover); outline: none; }
.occ-ctx button:disabled { color: var(--od-color-text-subtle); background: none; cursor: default; }
.occ-ctx .occ-danger { color: var(--od-color-danger); }
.occ-ctx-sub { position: relative; }
.occ-ctx-sub > .occ-ctx { top: -5px; left: calc(100% + 4px); }
.occ-ctx-sub > .occ-ctx-left { left: auto; right: calc(100% + 4px); }
@container occ (max-width: 640px) {
  .occ-selbar .occ-pop { top: calc(100% + 6px); bottom: auto; left: 0; right: 0; transform: none; max-width: none; }
  .occ-selbar .occ-menu.occ-pop-above { top: calc(100% + 6px); bottom: auto; }
  .occ-selbar .occ-bar-label small { display: none; }
}
`;
