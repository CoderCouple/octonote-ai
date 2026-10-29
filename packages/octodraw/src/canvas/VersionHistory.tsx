import { useMemo, useState, type CSSProperties } from 'react';
import { useResolvedScheme } from '../react/OctoDiagram';
import { themeCssVariables, themes as builtInThemes, type ColorScheme, type Theme } from '../theme/tokens';
import type { CanvasDocument } from './model';
import { diffDocuments, type CanvasVersion } from './versions';

// Version history panel: the current state, then saved versions newest first,
// grouped by day, each with what changed since the version before it.

export interface VersionHistoryProps {
  versions: CanvasVersion[];
  /** The live document, shown as "Current" and compared with the newest version. */
  current: CanvasDocument;
  /** The version being previewed (null = the current canvas). */
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRestore: (id: string) => void;
  onSave: (name: string) => void;
  onRename?: (id: string, name: string | undefined) => void;
  onRemove?: (id: string) => void;
  onClose?: () => void;
  colorScheme?: ColorScheme | 'system';
  themes?: Partial<Record<ColorScheme, Theme>>;
  className?: string;
  style?: CSSProperties;
}

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function day(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Summary({ from, to }: { from?: CanvasDocument; to: CanvasDocument }) {
  if (!from) return <span className="ovh-summary">{to.items.length} items</span>;
  const d = diffDocuments(from, to);
  if (!d.added.length && !d.removed.length && !d.changed.length) return <span className="ovh-summary">No changes</span>;
  return (
    <span className="ovh-summary">
      {d.added.length > 0 && <span className="ovh-added">+{d.added.length}</span>}
      {d.removed.length > 0 && <span className="ovh-removed">−{d.removed.length}</span>}
      {d.changed.length > 0 && <span className="ovh-changed">{d.changed.length} edited</span>}
    </span>
  );
}

export function VersionHistory(props: VersionHistoryProps) {
  const { versions, current, selected, onSelect, onRestore, onSave, onRename, onRemove, onClose, colorScheme = 'system', className, style } = props;
  const scheme = useResolvedScheme(colorScheme);
  const theme = props.themes?.[scheme] ?? builtInThemes[scheme];
  const cssVars = useMemo(() => themeCssVariables(theme) as CSSProperties, [theme]);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [onlyNamed, setOnlyNamed] = useState(false);

  const shown = onlyNamed ? versions.filter((v) => v.name) : versions;
  const groups: { label: string; items: CanvasVersion[] }[] = [];
  for (const v of shown) {
    const label = day(v.at);
    const group = groups.at(-1);
    if (group?.label === label) group.items.push(v);
    else groups.push({ label, items: [v] });
  }
  // Each version is compared with the one saved before it (the next in this newest-first list).
  const previous = (v: CanvasVersion) => versions[versions.indexOf(v) + 1]?.doc;

  return (
    <aside className={`ovh-root${className ? ` ${className}` : ''}`} style={{ ...cssVars, colorScheme: scheme, ...style }} aria-label="Version history">
      <style>{CSS}</style>
      <header className="ovh-header">
        <span className="ovh-title">Version history</span>
        {onClose && (
          <button type="button" className="ovh-ghost ovh-close" onClick={onClose} aria-label="Close version history">
            ×
          </button>
        )}
      </header>
      <form
        className="ovh-save"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim());
          setName('');
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this version (optional)" aria-label="Version name" />
        <button type="submit" className="ovh-primary">
          Save
        </button>
      </form>
      <label className="ovh-filter">
        <input type="checkbox" checked={onlyNamed} onChange={(e) => setOnlyNamed(e.target.checked)} /> Only named versions
      </label>
      <div className="ovh-list" role="listbox" aria-label="Versions">
        <button type="button" role="option" aria-selected={selected === null} className="ovh-entry" onClick={() => onSelect(null)}>
          <span className="ovh-dot ovh-dot-current" />
          <span className="ovh-entry-main">
            <strong>Current</strong>
            <Summary from={versions[0]?.doc} to={current} />
          </span>
        </button>
        {groups.map((group) => (
          <div key={group.label} className="ovh-group">
            <div className="ovh-day">{group.label}</div>
            {group.items.map((v) => (
              <div key={v.id} className="ovh-entry-wrap">
                <button type="button" role="option" aria-selected={selected === v.id} className="ovh-entry" onClick={() => onSelect(v.id)}>
                  <span className={`ovh-dot${v.name ? ' ovh-dot-named' : ''}`} />
                  <span className="ovh-entry-main">
                    {renaming === v.id ? (
                      <input
                        className="ovh-rename"
                        autoFocus
                        defaultValue={v.name ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={(e) => {
                          if (renaming === v.id) onRename?.(v.id, e.target.value.trim() || undefined);
                          setRenaming(null);
                        }}
                      />
                    ) : (
                      <strong>{v.name ?? time(v.at)}</strong>
                    )}
                    <span className="ovh-meta">
                      {v.name && `${time(v.at)} · `}
                      {v.author?.name ?? (v.auto ? 'Auto-saved' : 'Saved')}
                    </span>
                    <Summary from={previous(v)} to={v.doc} />
                  </span>
                </button>
                {selected === v.id && (
                  <div className="ovh-actions">
                    <button type="button" className="ovh-primary" onClick={() => onRestore(v.id)}>
                      Restore
                    </button>
                    {onRename && (
                      <button type="button" className="ovh-ghost" onClick={() => setRenaming(v.id)}>
                        {v.name ? 'Rename' : 'Name'}
                      </button>
                    )}
                    {onRemove && (
                      <button type="button" className="ovh-ghost ovh-danger" onClick={() => onRemove(v.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {shown.length === 0 && <p className="ovh-empty">{onlyNamed ? 'No named versions yet.' : 'No versions yet. Versions are saved automatically as you work, or save one now.'}</p>}
      </div>
    </aside>
  );
}

const CSS = `
.ovh-root { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--od-color-raised); color: var(--od-color-text); font: var(--od-text-ui); }
.ovh-root button, .ovh-root input { font: inherit; color: inherit; }
.ovh-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--od-color-border); }
.ovh-title { font-weight: 600; }
.ovh-ghost { border: 0; background: none; color: var(--od-color-text-muted); padding: 3px 8px; border-radius: var(--od-radius-md); cursor: pointer; font-size: 12px; }
.ovh-ghost:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.ovh-close { font-size: 18px; line-height: 1; padding: 2px 7px; }
.ovh-danger:hover { color: var(--od-color-danger); }
.ovh-primary { border: 0; border-radius: var(--od-radius-md); background: var(--od-color-accent); color: var(--od-color-on-accent) !important; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
.ovh-primary:hover { filter: brightness(1.08); }
.ovh-save { display: flex; gap: 6px; padding: 10px 12px 6px; }
.ovh-save input, .ovh-rename { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); background: var(--od-color-surface); }
.ovh-rename { width: 100%; height: 24px; }
.ovh-filter { display: flex; align-items: center; gap: 6px; padding: 0 12px 8px; font-size: 12px; color: var(--od-color-text-muted); border-bottom: 1px solid var(--od-color-border); }
.ovh-list { flex: 1; overflow-y: auto; padding: 6px 0 12px; }
.ovh-day { padding: 10px 14px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--od-color-text-subtle); }
.ovh-entry { position: relative; display: flex; gap: 10px; width: 100%; padding: 7px 14px; border: 0; background: none; text-align: left; cursor: pointer; }
.ovh-entry:hover { background: var(--od-color-hover); }
.ovh-entry[aria-selected="true"] { background: var(--od-color-accent-soft); }
.ovh-entry-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ovh-entry-main strong { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ovh-meta { font-size: 11.5px; color: var(--od-color-text-muted); }
.ovh-dot { flex: none; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; border: 2px solid var(--od-color-border-strong); background: var(--od-color-raised); }
.ovh-dot-named { border-color: var(--od-color-accent); background: var(--od-color-accent); }
.ovh-dot-current { border-color: #30a46c; background: #30a46c; }
.ovh-summary { display: flex; gap: 6px; font-size: 11.5px; color: var(--od-color-text-subtle); }
.ovh-added { color: #30a46c; font-weight: 600; }
.ovh-removed { color: var(--od-color-danger); font-weight: 600; }
.ovh-actions { display: flex; gap: 4px; padding: 2px 14px 8px 33px; background: var(--od-color-accent-soft); }
.ovh-empty { padding: 12px 14px; margin: 0; color: var(--od-color-text-muted); font-size: 12.5px; }
`;
