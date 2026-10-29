import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { listIconNames, resolveIcon } from '../icons/resolve';
import { Icon } from '../react/DiagramSvg';
import type { ItemContext } from './items';
import { FIGURE_TEMPLATES, type CanvasTemplate } from './templates';

export type InsertChoice =
  | { kind: 'template'; id: string }
  | { kind: 'board'; id: string }
  | { kind: 'shape'; shape: 'rectangle' | 'ellipse' | 'diamond' }
  | { kind: 'text' }
  | { kind: 'sticky' }
  | { kind: 'code' }
  | { kind: 'image' }
  | { kind: 'frame'; device: 'phone' | 'tablet' | 'browser' | 'desktop' }
  | { kind: 'icon'; name: string }
  | { kind: 'ai'; prompt: string };

interface Entry {
  key: string;
  section: string;
  label: string;
  hint?: string;
  icon?: string;
  choice: InsertChoice;
}

const SHAPES: Entry[] = [
  { key: 'rectangle', section: 'Shapes', label: 'Rectangle', hint: 'R', choice: { kind: 'shape', shape: 'rectangle' } },
  { key: 'ellipse', section: 'Shapes', label: 'Ellipse', hint: 'O', choice: { kind: 'shape', shape: 'ellipse' } },
  { key: 'diamond', section: 'Shapes', label: 'Diamond', hint: 'D', choice: { kind: 'shape', shape: 'diamond' } },
  { key: 'text', section: 'Shapes', label: 'Text', hint: 'T', choice: { kind: 'text' } },
  { key: 'sticky', section: 'Shapes', label: 'Sticky note', hint: 'S', choice: { kind: 'sticky' } },
];
const MEDIA: Entry[] = [
  { key: 'image', section: 'Media', label: 'Image…', hint: 'Upload a file (or paste / drop one)', choice: { kind: 'image' } },
  { key: 'code', section: 'Media', label: 'Code block', hint: 'Monospaced snippet', choice: { kind: 'code' } },
  { key: 'phone', section: 'Device frames', label: 'Phone', choice: { kind: 'frame', device: 'phone' } },
  { key: 'tablet', section: 'Device frames', label: 'Tablet', choice: { kind: 'frame', device: 'tablet' } },
  { key: 'browser', section: 'Device frames', label: 'Browser window', choice: { kind: 'frame', device: 'browser' } },
  { key: 'desktop', section: 'Device frames', label: 'Desktop', choice: { kind: 'frame', device: 'desktop' } },
];
const SUGGESTED_ICONS = ['user', 'server', 'database', 'globe', 'cloud', 'lock', 'mobile', 'aws-lambda', 'postgres', 'kafka', 'react', 'github'];

/** Searchable "insert anything" list: diagrams, shapes, icons and the AI. */
export function InsertPalette({ ctx, templates, aiEnabled, onChoose, onClose }: { ctx: ItemContext; templates: CanvasTemplate[]; aiEnabled: boolean; onChoose: (choice: InsertChoice) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: Entry) => !q || e.label.toLowerCase().includes(q) || (e.hint ?? '').toLowerCase().includes(q);
    const out: Entry[] = [];
    out.push(...FIGURE_TEMPLATES.map((t): Entry => ({ key: t.id, section: 'Diagram as code', label: t.label, hint: t.hint, choice: { kind: 'template', id: t.id } })).filter(match));
    out.push(...templates.map((t): Entry => ({ key: `board:${t.id}`, section: 'Canvas templates', label: t.label, hint: t.hint, choice: { kind: 'board', id: t.id } })).filter(match));
    out.push(...SHAPES.filter(match));
    out.push(...MEDIA.filter(match));
    // After exact matches, so a short query + Enter inserts the match rather than asking the AI.
    if (aiEnabled && q) out.push({ key: 'ai', section: 'Assistant', label: `Draw “${query.trim()}” with AI`, choice: { kind: 'ai', prompt: query.trim() } });
    const names = q.length >= 2 ? listIconNames().filter((n) => n.includes(q)).sort((a, b) => a.length - b.length).slice(0, 36) : q ? [] : SUGGESTED_ICONS;
    out.push(...names.map((name): Entry => ({ key: `icon:${name}`, section: 'Icons', label: name, icon: name, choice: { kind: 'icon', name } })));
    return out;
  }, [query, aiEnabled, templates]);
  useEffect(() => setActive(0), [query]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(0, Math.min(entries.length - 1, a + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && entries[active]) {
      event.preventDefault();
      onChoose(entries[active]!.choice);
    }
  };

  const sections = [...new Set(entries.map((e) => e.section))];
  return (
    <div className="occ-palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="occ-palette" role="dialog" aria-label="Insert" onKeyDown={onKeyDown}>
        <input ref={input} className="occ-palette-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Insert a diagram, shape or icon…" aria-label="Search" />
        <div className="occ-palette-list">
          {entries.length === 0 && <p className="occ-palette-empty">Nothing matches “{query}”.</p>}
          {sections.map((section) => {
            const items = entries.filter((e) => e.section === section);
            return (
              <div key={section} className="occ-palette-section">
                <div className="occ-palette-label">{section}</div>
                <div className={section === 'Icons' ? 'occ-palette-grid' : undefined}>
                  {items.map((e) => {
                    const index = entries.indexOf(e);
                    return (
                      <button
                        key={e.key}
                        type="button"
                        className={e.icon ? 'occ-palette-icon' : 'occ-palette-row'}
                        aria-selected={index === active}
                        title={e.icon ? e.label : undefined}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => onChoose(e.choice)}
                      >
                        {e.icon ? (
                          <>
                            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                              <Icon name={e.icon} resolved={resolveIcon(e.icon, ctx.icons, ctx.iconSet)} x={2} y={2} size={24} tint={ctx.theme.node.icon} theme={ctx.theme} />
                            </svg>
                            <span>{e.label}</span>
                          </>
                        ) : (
                          <>
                            <span>{e.label}</span>
                            {e.hint && <span className="occ-palette-hint">{e.hint}</span>}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
