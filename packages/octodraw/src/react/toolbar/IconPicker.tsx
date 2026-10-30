import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { listIconNames, onIconCatalogChange, resolveIcon, type IconSet } from '../../icons/resolve';
import type { IconResolver } from '../../icons/types';
import type { Theme } from '../../theme/tokens';
import { Icon } from '../DiagramSvg';
import { SearchGlyph } from './glyphs';

const CATEGORIES = ['All', 'General', 'Tech logos', 'AWS', 'GCP', 'Azure', 'Recent'] as const;
type Category = (typeof CATEGORIES)[number];
const COLUMNS = 6;
const LIMIT = 60;
const RECENT_KEY = 'octodraw.recentIcons';
const SUGGESTED = ['user', 'users', 'server', 'database', 'globe', 'cloud', 'lock', 'mobile', 'monitor', 'mail', 'aws-lambda', 'aws-s3', 'postgres', 'redis', 'kafka', 'react', 'github', 'docker'];
// Cloud, Kubernetes and networking sets: neither "General" nor "Tech logos".
const CLOUD = /^(aws|gcp|azure|oci|k8s|cisco|d365|fabric|power|microsoft)-/;

const brandCache = new Map<string, boolean>();
/** Logos are the names the open catalog draws as brand marks. */
function isLogo(name: string): boolean {
  let logo = brandCache.get(name);
  if (logo === undefined) {
    logo = resolveIcon(name, undefined, 'open')?.icon.kind === 'brand';
    brandCache.set(name, logo);
  }
  return logo;
}

function inCategory(name: string, category: Category): boolean {
  switch (category) {
    case 'AWS':
      return name.startsWith('aws-');
    case 'GCP':
      return name.startsWith('gcp-');
    case 'Azure':
      return name.startsWith('azure-');
    case 'Tech logos':
      return !CLOUD.test(name) && isLogo(name);
    case 'General':
      return !CLOUD.test(name) && !isLogo(name);
    default:
      return true;
  }
}

export function readRecentIcons(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberIcon(name: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...readRecentIcons().filter((n) => n !== name)].slice(0, 8)));
  } catch {
    // Storage may be unavailable (private mode, embedded frames); recents are a convenience.
  }
}

/** Search, category chips and a grid of icons; arrow keys move, Enter picks, "No icon" clears. */
export function IconPicker({ theme, icons, iconSet, value, mixed, onPick }: { theme: Theme; icons?: IconResolver; iconSet: IconSet; value: string | undefined; mixed: boolean; onPick: (name: string | null) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [active, setActive] = useState(0);
  // The full catalogs load lazily; list again when they land.
  const [epoch, setEpoch] = useState(0);
  useEffect(() => onIconCatalogChange(() => setEpoch((e) => e + 1)), []);
  const recent = useMemo(readRecentIcons, []);

  const { names, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    let all: string[];
    if (category === 'Recent') {
      all = recent.filter((n) => !q || n.includes(q));
    } else {
      all = listIconNames().filter((n) => (!q || n.includes(q)) && inCategory(n, category));
      if (q) all.sort((a, b) => a.length - b.length || a.localeCompare(b));
      else if (category === 'All') {
        // Recent picks first, then common ones, then the rest.
        const first = [...recent, ...SUGGESTED].filter((n, i, list) => list.indexOf(n) === i && all.includes(n));
        all = [...first, ...all.filter((n) => !first.includes(n))];
      }
    }
    return { names: all.slice(0, LIMIT), total: all.length };
  }, [query, category, recent, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [query, category]);

  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (name: string) => {
    rememberIcon(name);
    onPick(name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = (n: number) => {
      event.preventDefault();
      setActive((a) => Math.max(0, Math.min(names.length - 1, a + n)));
    };
    if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowDown') move(COLUMNS);
    else if (event.key === 'ArrowUp') move(-COLUMNS);
    else if (event.key === 'Enter' && names[active]) {
      event.preventDefault();
      choose(names[active]!);
    }
  };

  return (
    <div className="od-etb-icons">
      <div className="od-etb-icons-search">
        <SearchGlyph />
        <input data-autofocus aria-label="Search icons" placeholder="Search icons" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
        <span className="od-etb-icons-count">{total === 1 ? '1 icon' : `${total} icons`}</span>
      </div>
      <div className="od-etb-chips" role="group" aria-label="Icon category">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="od-etb-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div ref={grid} className="od-etb-icon-grid">
        {names.map((name, i) => {
          const resolved = resolveIcon(name, icons, iconSet);
          return (
            <button key={name} type="button" role="menuitemradio" tabIndex={-1} data-index={i} aria-checked={!mixed && value === name} data-active={i === active || undefined} className="od-etb-tile" title={name} onClick={() => choose(name)} onPointerEnter={() => setActive(i)}>
              <span className="od-etb-tile-box">
                <svg width="26" height="26" aria-hidden="true">
                  <Icon name={name} resolved={resolved} x={0} y={0} size={26} tint={resolved?.tint ?? theme.color.text} theme={theme} />
                </svg>
              </span>
              <span className="od-etb-tile-name">{name}</span>
            </button>
          );
        })}
        {names.length === 0 && <p className="od-etb-empty">{category === 'Recent' ? 'No recent icons yet' : 'No icons match'}</p>}
      </div>
      <div className="od-etb-icons-foot">
        <button type="button" role="menuitem" className="od-etb-link" onClick={() => onPick(null)}>
          No icon
        </button>
        <span>↑ ↓ ← → to move · Enter to choose · Esc to close</span>
      </div>
    </div>
  );
}
