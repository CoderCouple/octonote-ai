import { useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasTool } from './OctoCanvas';

interface RailButton {
  id: string;
  label: string;
  key: string;
  d: string;
  /** The drawing tool it picks (none: an action). */
  tool?: CanvasTool;
}

/** Glyphs drawn on a 24-unit grid with a 1.6 stroke. */
const TOOLS: RailButton[] = [
  { id: 'select', tool: 'select', label: 'Select', key: 'V', d: 'M6 3l12 7.5-5.5 1.5L10 18z' },
  { id: 'rectangle', tool: 'rectangle', label: 'Rectangle', key: 'R', d: 'M5 5h14v14H5z' },
  { id: 'ellipse', tool: 'ellipse', label: 'Ellipse', key: 'O', d: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z' },
  { id: 'arrow', tool: 'arrow', label: 'Arrow', key: 'A', d: 'M6 18L18 6M10 6h8v8' },
  { id: 'line', tool: 'line', label: 'Line', key: 'L', d: 'M6 18L18 6' },
  { id: 'pen', tool: 'pen', label: 'Pen', key: 'D', d: 'M15 5l4 4L9 19H5v-4z' },
  { id: 'text', tool: 'text', label: 'Text', key: 'T', d: 'M4 10V8h7v2M7.5 8v9M12 7V5h9v2M16.5 5v12' },
  { id: 'icon', label: 'Icon', key: 'I', d: 'M8 3l1.4 3.1L12.5 7 9.4 8.4 8 11.5 6.6 8.4 3.5 7l3.1-.9zM15.5 12a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM18 18l3 3' },
];
const EXTRAS: RailButton[] = [
  { id: 'figure', tool: 'figure', label: 'Figure', key: 'F', d: 'M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4' },
  { id: 'comment', tool: 'comment', label: 'Comment', key: 'C', d: 'M4 5h16v11H10l-4 4v-4H4z' },
];
const AI: RailButton = { id: 'ai', label: 'AI Chat', key: '⌘J', d: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' };

function RailGlyph({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The tool rail down the left edge (Eraser's): Insert, the AI (when the host wires
 * one up), the drawing tools, then Figure and Comment — separate cards on a thin
 * line, each button with its shortcut in the corner and a tooltip on hover.
 */
export function ToolRail({
  tool,
  insert,
  onTool,
  onInsert,
  onIcon,
  onAi,
}: {
  tool: CanvasTool;
  /** Which Insert page is open, if any (the Icon button opens the 'icon' page). */
  insert: 'home' | 'icon' | null;
  onTool: (tool: CanvasTool) => void;
  onInsert: () => void;
  onIcon: () => void;
  onAi?: () => void;
}) {
  const [tip, setTip] = useState<{ label: string; key: string; top: number; left: number } | null>(null);
  const show = (b: RailButton) => (event: ReactPointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    if ('pointerType' in event && event.pointerType === 'touch') return;
    const el = event.currentTarget;
    const root = el.closest('.occ-root')?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (root) setTip({ label: b.label, key: b.key, top: r.top - root.top + r.height / 2, left: r.right - root.left + 8 });
  };
  const hide = () => setTip(null);

  const button = (b: RailButton, pressed: boolean, onClick: () => void, extraClass = '') => (
    <button
      key={b.id}
      type="button"
      className={`occ-rail-btn ${extraClass}`}
      aria-pressed={pressed}
      aria-label={b.label}
      aria-keyshortcuts={b.key.length === 1 ? b.key : undefined}
      onClick={() => (hide(), onClick())}
      onPointerEnter={show(b)}
      onPointerLeave={hide}
      onFocus={show(b)}
      onBlur={hide}
    >
      <RailGlyph d={b.d} />
      <span className="occ-rail-key">{b.key}</span>
    </button>
  );
  const pick = (b: RailButton) => button(b, !insert && tool === b.tool, () => onTool(b.tool!));

  return (
    <>
      <div className="occ-rail-line" aria-hidden="true" />
      <div className="occ-rail occ-chrome" role="toolbar" aria-label="Tools" aria-orientation="vertical">
        <div className="occ-rail-group">
          {button({ id: 'insert', label: insert === 'home' ? 'Close' : 'Insert', key: '/', d: insert === 'home' ? 'M6 6l12 12M18 6L6 18' : 'M12 5v14M5 12h14' }, insert === 'home', onInsert, 'occ-rail-insert')}
        </div>
        {onAi && <div className="occ-rail-group">{button(AI, false, onAi)}</div>}
        <div className="occ-rail-group">{TOOLS.map((b) => (b.tool ? pick(b) : button(b, insert === 'icon', onIcon, 'occ-rail-icon')))}</div>
        <div className="occ-rail-group">{EXTRAS.map(pick)}</div>
      </div>
      {tip && (
        <div className="occ-rail-tip occ-chrome" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
          <kbd>{tip.key}</kbd>
        </div>
      )}
    </>
  );
}

export const TOOL_RAIL_CSS = `
.occ-rail { position: absolute; left: var(--od-space-4); top: 0; bottom: 0; display: flex; flex-direction: column; gap: 10px; padding: var(--od-space-4) 0; overflow-y: auto; scrollbar-width: none; pointer-events: none; }
.occ-rail::-webkit-scrollbar { display: none; }
/* The thin line the groups sit on. */
.occ-rail-line { position: absolute; left: calc(var(--od-space-4) + 22px); top: 0; bottom: 0; width: 1px; background: var(--od-color-border); pointer-events: none; }
.occ-rail-group { display: flex; flex-direction: column; gap: 2px; flex: none; padding: 3px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: 0 1px 2px rgba(15, 15, 15, 0.06); pointer-events: auto; }
.occ-rail-btn { position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); cursor: pointer; }
.occ-rail-btn:hover { background: var(--od-color-hover); }
.occ-rail-btn[aria-pressed="true"] { background: var(--od-color-hover); box-shadow: inset 0 0 0 1px var(--od-color-border); }
.occ-rail-btn:focus-visible { outline: 2px solid var(--od-color-focus-ring, var(--od-color-accent)); outline-offset: 1px; }
.occ-rail-key { position: absolute; right: 3px; bottom: 1px; font-size: 8.5px; font-weight: 600; line-height: 1.2; color: var(--od-color-text-subtle); pointer-events: none; }
.occ-rail-tip { position: absolute; z-index: 7; transform: translateY(-50%); display: flex; align-items: center; gap: 8px; padding: 5px 9px; border-radius: var(--od-radius-md); background: var(--od-color-text); color: var(--od-color-canvas); font-size: 12.5px; font-weight: 500; white-space: nowrap; pointer-events: none; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); }
.occ-rail-tip kbd { font: inherit; font-size: 11.5px; opacity: 0.65; color: inherit; }
/* Small containers (phones, narrow host panes): the groups run along the bottom. */
@container occ (max-width: 640px) {
  /* Above the undo / zoom corners, which sit at the bottom edge. */
  .occ-rail { top: auto; left: 0; right: 0; bottom: 60px; flex-direction: row; gap: 8px; padding: 0 12px; overflow-x: auto; overflow-y: hidden; }
  .occ-rail-group { flex-direction: row; }
  .occ-rail-line { left: 0; right: 0; top: auto; bottom: calc(60px + 24px); width: auto; height: 1px; }
  .occ-rail-btn { width: 42px; height: 42px; }
  .occ-rail-key { display: none; }
  .occ-rail-tip { display: none; }
}
`;
