import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { listIconNames, resolveIcon } from '../icons/resolve';
import { Icon } from '../react/DiagramSvg';
import type { ItemContext } from './items';
import { FIGURE_TEMPLATES, type CanvasTemplate } from './templates';

export type InsertChoice =
  | { kind: 'template'; id: string }
  | { kind: 'board'; id: string }
  | { kind: 'figure' }
  | { kind: 'shape'; shape: 'rectangle' | 'ellipse' | 'diamond' }
  | { kind: 'text' }
  | { kind: 'sticky' }
  | { kind: 'code' }
  | { kind: 'image' }
  | { kind: 'frame'; device: 'phone' | 'tablet' | 'browser' | 'desktop' }
  | { kind: 'icon'; name: string }
  | { kind: 'ai'; prompt: string };

/** The panel's pages: the category list, or one category. */
export type InsertPage = 'home' | 'code' | 'catalog' | 'shape' | 'icon' | 'device';

interface Entry {
  key: string;
  section: string;
  label: string;
  hint?: string;
  /** An icon's name: drawn in the icon grid. */
  icon?: string;
  /** Opens a category instead of inserting. */
  page?: InsertPage;
  choice?: InsertChoice;
  /** Drawn as a square tile (Figure, Code Block, Image). */
  tile?: boolean;
  glyph?: string;
}

const G = {
  ai: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  code: 'M4 4h5v4H4zM15 4h5v4h-5zM4 16h5v4H4zM15 16h5v4h-5zM6.5 8v8M17.5 8v8M9 6h6M9 18h6',
  catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  shape: 'M7 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM17 3l4 7h-8zM7 13.5l3.5 3.5L7 20.5 3.5 17z',
  icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  device: 'M3 5h18v14H3zM3 9h18M6 7h.01M8.5 7h.01',
  figure: 'M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4',
  codeBlock: 'M4 4h16v16H4zM10 9l-3 3 3 3M14 9l3 3-3 3',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 8.5a1.5 1.5 0 1 1 0 .01',
};

const CATEGORIES: Entry[] = [
  { key: 'code', section: 'home', label: 'Diagram as Code', hint: 'Create diagrams using code', page: 'code', glyph: G.code },
  { key: 'catalog', section: 'home', label: 'Diagram Catalog', hint: 'Ready-made boards to start from', page: 'catalog', glyph: G.catalog },
  { key: 'shape', section: 'home', label: 'Shape', hint: 'Rectangles, ellipses, diamonds, notes', page: 'shape', glyph: G.shape },
  { key: 'icon', section: 'home', label: 'Icon', hint: 'Thousands of icons', page: 'icon', glyph: G.icon },
  { key: 'device', section: 'home', label: 'Device Frame', hint: 'Phone, tablet, browser frames', page: 'device', glyph: G.device },
];
const TILES: Entry[] = [
  { key: 'figure', section: 'home', label: 'Figure', hint: 'An empty diagram', choice: { kind: 'figure' }, tile: true, glyph: G.figure },
  { key: 'code-block', section: 'home', label: 'Code Block', hint: 'Monospaced snippet', choice: { kind: 'code' }, tile: true, glyph: G.codeBlock },
  { key: 'image', section: 'home', label: 'Image', hint: 'Upload a file (or paste / drop one)', choice: { kind: 'image' }, tile: true, glyph: G.image },
];
const SHAPES: Entry[] = [
  { key: 'rectangle', section: 'Shape', label: 'Rectangle', hint: 'R', choice: { kind: 'shape', shape: 'rectangle' } },
  { key: 'ellipse', section: 'Shape', label: 'Ellipse', hint: 'O', choice: { kind: 'shape', shape: 'ellipse' } },
  { key: 'diamond', section: 'Shape', label: 'Diamond', choice: { kind: 'shape', shape: 'diamond' } },
  { key: 'text', section: 'Shape', label: 'Text', hint: 'T', choice: { kind: 'text' } },
  { key: 'sticky', section: 'Shape', label: 'Sticky note', hint: 'S', choice: { kind: 'sticky' } },
];
const DEVICES: Entry[] = [
  { key: 'phone', section: 'Device Frame', label: 'Phone', choice: { kind: 'frame', device: 'phone' } },
  { key: 'tablet', section: 'Device Frame', label: 'Tablet', choice: { kind: 'frame', device: 'tablet' } },
  { key: 'browser', section: 'Device Frame', label: 'Browser window', choice: { kind: 'frame', device: 'browser' } },
  { key: 'desktop', section: 'Device Frame', label: 'Desktop', choice: { kind: 'frame', device: 'desktop' } },
];
const SUGGESTED_ICONS = ['user', 'server', 'database', 'globe', 'cloud', 'lock', 'mobile', 'aws-lambda', 'postgres', 'kafka', 'react', 'github', 'docker', 'kubernetes', 'mail', 'settings'];
const PAGE_TITLES: Record<InsertPage, string> = { home: 'All Categories', code: 'Diagram as Code', catalog: 'Diagram Catalog', shape: 'Shape', icon: 'Icon', device: 'Device Frame' };
/** Columns of the icon grid on the Icon page (arrow keys move by rows). */
const ICON_COLUMNS = 4;

function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The "Insert item" panel beside the tool rail (opened by +, / or ⌘K): categories
 * that open their own page, quick tiles, and a search over everything.
 */
export function InsertPalette({
  ctx,
  templates,
  aiEnabled,
  page: initialPage = 'home',
  onChoose,
  onAskAi,
  onClose,
}: {
  ctx: ItemContext;
  templates: CanvasTemplate[];
  aiEnabled: boolean;
  page?: InsertPage;
  onChoose: (choice: InsertChoice) => void;
  /** Opens the assistant (only when the host wires one up). */
  onAskAi?: () => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState<InsertPage>(initialPage);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setPage(initialPage), [initialPage]);
  useEffect(() => input.current?.focus({ preventScroll: true }), [page]);

  // A press anywhere else closes it (the rail's + toggles it itself).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || panel.current?.contains(target) || target.closest?.('.occ-rail-insert, .occ-rail-icon')) return;
      closeRef.current();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);

  const searching = query.trim().length > 0;
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: Entry) => !q || e.label.toLowerCase().includes(q) || (e.hint ?? '').toLowerCase().includes(q);
    const code = FIGURE_TEMPLATES.map((t): Entry => ({ key: t.id, section: 'Diagram as Code', label: t.label, hint: t.hint, choice: { kind: 'template', id: t.id } }));
    const catalog = templates.map((t): Entry => ({ key: `board:${t.id}`, section: 'Diagram Catalog', label: t.label, hint: t.hint, choice: { kind: 'board', id: t.id } }));
    const icons = (limit: number): Entry[] => {
      const names = q.length >= 2 ? listIconNames().filter((n) => n.includes(q)).sort((a, b) => a.length - b.length).slice(0, limit) : q ? [] : SUGGESTED_ICONS;
      return names.map((name) => ({ key: `icon:${name}`, section: 'Icon', label: name, icon: name, choice: { kind: 'icon', name } }));
    };

    if (page === 'code') return code.filter(match);
    if (page === 'catalog') return catalog.filter(match);
    if (page === 'shape') return SHAPES.filter(match);
    if (page === 'device') return DEVICES.filter(match);
    if (page === 'icon') return icons(120);
    if (!q) {
      const ai: Entry[] = aiEnabled ? [{ key: 'ai', section: 'home', label: 'AI Chat', hint: 'Open the assistant', glyph: G.ai }] : [];
      return [...ai, ...CATEGORIES.filter((c) => c.page !== 'catalog' || catalog.length), ...TILES];
    }
    // Searching from the top page looks through everything.
    const out = [...code, ...catalog, ...SHAPES, ...TILES.map((t) => ({ ...t, section: 'Media', tile: false, glyph: undefined })), ...DEVICES].filter(match);
    // After exact matches, so a short query + Enter inserts the match rather than asking the AI.
    if (aiEnabled) out.push({ key: 'ai-prompt', section: 'Assistant', label: `Draw “${query.trim()}” with AI`, choice: { kind: 'ai', prompt: query.trim() } });
    out.push(...icons(36));
    return out;
  }, [query, page, aiEnabled, templates]);
  useEffect(() => setActive(0), [query, page]);
  useEffect(() => {
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (next: InsertPage) => {
    setPage(next);
    setQuery('');
  };
  const pick = (e: Entry) => {
    if (e.page) open(e.page);
    else if (e.key === 'ai') {
      onClose();
      onAskAi?.();
    } else if (e.choice) onChoose(e.choice);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const current = entries[active];
    const move = (by: number) => setActive((a) => Math.max(0, Math.min(entries.length - 1, a + by)));
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = page === 'icon' ? ICON_COLUMNS : 1;
      move(event.key === 'ArrowDown' ? step : -step);
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && (current?.icon || current?.tile)) {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'ArrowRight' && current?.page) {
      event.preventDefault();
      open(current.page);
    } else if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && page !== 'home' && !query) {
      event.preventDefault();
      open('home');
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      pick(current);
    }
  };

  const row = (e: Entry): ReactNode => {
    const index = entries.indexOf(e);
    const common = {
      type: 'button' as const,
      role: 'option' as const,
      'aria-selected': index === active,
      onMouseEnter: () => setActive(index),
      onClick: () => pick(e),
    };
    if (e.icon)
      return (
        <button key={e.key} {...common} className="occ-palette-icon" title={e.label}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <Icon name={e.icon} resolved={resolveIcon(e.icon, ctx.icons, ctx.iconSet)} x={2} y={2} size={24} tint={ctx.theme.node.icon} theme={ctx.theme} />
          </svg>
          <span>{e.label}</span>
        </button>
      );
    if (e.tile)
      return (
        <button key={e.key} {...common} className="occ-palette-tile">
          <span className="occ-palette-tile-box">{e.glyph && <Glyph d={e.glyph} size={24} />}</span>
          <span>{e.label}</span>
        </button>
      );
    if (e.glyph)
      return (
        <button key={e.key} {...common} className="occ-palette-card">
          <span className="occ-palette-card-glyph">
            <Glyph d={e.glyph} size={24} />
          </span>
          <span className="occ-palette-card-text">
            <strong>{e.label}</strong>
            {e.hint && <span>{e.hint}</span>}
          </span>
          {e.page && <Glyph d="M9 6l6 6-6 6" size={16} />}
        </button>
      );
    return (
      <button key={e.key} {...common} className="occ-palette-row">
        <span>{e.label}</span>
        {e.hint && <span className="occ-palette-hint">{e.hint}</span>}
      </button>
    );
  };

  const home = page === 'home' && !searching;
  const sections = [...new Set(entries.filter((e) => !e.tile).map((e) => e.section))];
  const tiles = entries.filter((e) => e.tile);
  const current = entries[active];
  return (
    <div ref={panel} className="occ-palette occ-chrome" role="dialog" aria-label="Insert" onKeyDown={onKeyDown}>
      <div className="occ-palette-search">
        {page === 'home' ? (
          <Glyph d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4" size={18} />
        ) : (
          <button type="button" className="occ-palette-back" aria-label="Back" onClick={() => open('home')}>
            <Glyph d="M15 6l-6 6 6 6" size={18} />
          </button>
        )}
        <input
          ref={input}
          className="occ-palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={page === 'home' ? 'Insert item' : `Search ${PAGE_TITLES[page].toLowerCase()}`}
          aria-label="Search"
        />
      </div>
      <div className="occ-palette-list" role="listbox" aria-label={PAGE_TITLES[page]}>
        {entries.length === 0 && <p className="occ-palette-empty">Nothing matches “{query}”.</p>}
        {sections.map((section) => {
          const items = entries.filter((e) => e.section === section && !e.tile);
          return (
            <div key={section} className="occ-palette-section">
              <div className="occ-palette-label">{section === 'home' ? PAGE_TITLES.home : section}</div>
              <div className={items[0]?.icon ? 'occ-palette-grid' : home ? 'occ-palette-cards' : undefined}>{items.map(row)}</div>
            </div>
          );
        })}
        {tiles.length > 0 && <div className="occ-palette-tiles">{tiles.map(row)}</div>}
      </div>
      <div className="occ-palette-foot">
        <span>{current?.label ?? PAGE_TITLES[page]}</span>
        <span>
          <kbd>↑↓</kbd> to navigate <kbd>enter</kbd> to {current?.page ? 'open' : 'insert'}
        </span>
      </div>
    </div>
  );
}

export const INSERT_PALETTE_CSS = `
.occ-palette { position: absolute; left: calc(var(--od-space-4) + 56px); top: var(--od-space-4); z-index: 6; width: 360px; max-height: calc(100% - 2 * var(--od-space-4)); display: flex; flex-direction: column; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-xl); box-shadow: var(--od-shadow-chrome), 0 24px 48px -16px rgba(0,0,0,0.22); overflow: hidden; }
.occ-palette-search { display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px; color: var(--od-color-text); }
.occ-palette-back { display: grid; place-items: center; width: 26px; height: 26px; margin: -3px -4px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); cursor: pointer; }
.occ-palette-back:hover { background: var(--od-color-hover); }
.occ-palette-input { flex: 1; min-width: 0; border: 0; outline: none; padding: 4px 0; font: inherit; font-size: 15px; background: none; color: var(--od-color-text); }
.occ-palette-input::placeholder { color: var(--od-color-text-subtle); }
.occ-palette-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 14px 12px; scrollbar-width: thin; }
.occ-palette-empty { margin: 12px 0; color: var(--od-color-text-muted); }
.occ-palette-section + .occ-palette-section { margin-top: 8px; }
.occ-palette-label { padding: 6px 0; font-size: 12.5px; font-weight: 600; color: var(--od-color-text); }
.occ-palette-cards { display: flex; flex-direction: column; gap: 6px; }
.occ-palette-card { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); background: var(--od-color-raised); color: var(--od-color-text); font: inherit; text-align: left; cursor: pointer; }
.occ-palette-card-glyph { display: grid; place-items: center; width: 28px; flex: none; }
.occ-palette-card-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.occ-palette-card-text strong { font-size: 14px; font-weight: 600; }
.occ-palette-card-text span { font-size: 12.5px; color: var(--od-color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.occ-palette-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.occ-palette-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--od-color-text-muted); font: inherit; font-size: 12.5px; cursor: pointer; }
.occ-palette-tile-box { display: grid; place-items: center; width: 100%; height: 60px; box-sizing: border-box; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); color: var(--od-color-text); }
.occ-palette-row { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 10px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); font: inherit; text-align: left; cursor: pointer; }
.occ-palette-hint { color: var(--od-color-text-muted); font-size: 12px; }
.occ-palette-grid { display: grid; grid-template-columns: repeat(${ICON_COLUMNS}, minmax(0, 1fr)); gap: 2px; }
.occ-palette-icon { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; padding: 8px 4px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text-muted); font: inherit; font-size: 10.5px; cursor: pointer; overflow: hidden; }
.occ-palette-icon span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.occ-palette-row[aria-selected="true"], .occ-palette-icon[aria-selected="true"], .occ-palette-card[aria-selected="true"] { background: var(--od-color-hover); color: var(--od-color-text); }
.occ-palette-tile[aria-selected="true"] { color: var(--od-color-text); }
.occ-palette-tile[aria-selected="true"] .occ-palette-tile-box { background: var(--od-color-hover); }
.occ-palette-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--od-color-border); font-size: 12px; color: var(--od-color-text); }
.occ-palette-foot > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.occ-palette-foot > span:last-child { flex: none; color: var(--od-color-text-muted); }
.occ-palette-foot kbd { font: inherit; font-weight: 600; color: var(--od-color-text); }
@container occ (max-width: 640px) {
  .occ-palette { left: 12px; right: 12px; top: auto; bottom: 120px; width: auto; max-height: calc(100% - 136px); }
  .occ-palette-foot { display: none; }
}
`;
