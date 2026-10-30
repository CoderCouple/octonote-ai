import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

// The right-click menu of the free-form canvas: a list of commands with their
// shortcuts, separators and one level of sub-menus (Arrange ▸). Arrow keys
// move, → opens a sub-menu, ← or Escape closes it, Escape closes the menu.

export type MenuEntry =
  | {
      label: string;
      kbd?: string;
      onSelect?: () => void;
      disabled?: boolean;
      danger?: boolean;
      submenu?: MenuEntry[];
    }
  | 'sep';

const WIDTH = 236;

export function ContextMenu({ x, y, bounds, entries, onClose, label = 'Canvas menu' }: { x: number; y: number; bounds: { w: number; h: number }; entries: MenuEntry[]; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<number | null>(null);
  // Keep the menu inside the canvas: flip left / up when it would spill over.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setPos({ x: x + WIDTH > bounds.w - 8 ? Math.max(8, x - WIDTH) : x, y: y + h > bounds.h - 8 ? Math.max(8, bounds.h - 8 - h) : y });
  }, [x, y, bounds.w, bounds.h]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
  }, []);
  const subLeft = pos.x + WIDTH * 2 + 8 > bounds.w;

  const run = (entry: Exclude<MenuEntry, 'sep'>) => {
    if (entry.disabled || entry.submenu) return;
    onClose();
    entry.onSelect?.();
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const target = e.target as HTMLElement;
    const level = target.closest('.occ-ctx') as HTMLElement | null;
    const inSub = !!level && level !== ref.current;
    const handled = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Escape', 'Home', 'End', 'Tab'].includes(e.key);
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && inSub)) {
      if (inSub) {
        setOpenSub(null);
        level?.parentElement?.querySelector<HTMLElement>(':scope > button')?.focus();
      } else onClose();
      return;
    }
    if (e.key === 'ArrowRight') {
      const index = target.getAttribute('data-sub');
      if (index !== null) {
        setOpenSub(Number(index));
        requestAnimationFrame(() => target.parentElement?.querySelector<HTMLElement>('.occ-ctx button:not([disabled])')?.focus());
      }
      return;
    }
    if (e.key === 'Tab' || e.key === 'ArrowLeft') return;
    const buttons = [...(level?.querySelectorAll<HTMLElement>(':scope > button:not([disabled]), :scope > .occ-ctx-sub > button:not([disabled])') ?? [])];
    if (!buttons.length) return;
    const i = buttons.indexOf(target);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const list = (items: MenuEntry[], sub: boolean) =>
    items.map((entry, i) => {
      if (entry === 'sep') {
        // Skip separators at the edges or next to each other (entries left out conditionally).
        const prev = items[i - 1];
        if (i === 0 || i === items.length - 1 || prev === 'sep') return null;
        return <div key={`sep-${i}`} className="occ-menu-sep" role="separator" />;
      }
      if (entry.submenu && !sub) {
        return (
          <div key={entry.label} className="occ-ctx-sub" onPointerEnter={() => setOpenSub(i)}>
            <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openSub === i} data-sub={i} onClick={() => setOpenSub(openSub === i ? null : i)}>
              {entry.label} <span aria-hidden="true">▸</span>
            </button>
            {openSub === i && (
              <div className={`occ-ctx${subLeft ? ' occ-ctx-left' : ''}`} role="menu" aria-label={entry.label}>
                {list(entry.submenu, true)}
              </div>
            )}
          </div>
        );
      }
      return (
        <button key={entry.label} type="button" role="menuitem" disabled={entry.disabled} className={entry.danger ? 'occ-danger' : undefined} onPointerEnter={sub ? undefined : () => setOpenSub(null)} onClick={() => run(entry)}>
          {entry.label} {entry.kbd && <kbd>{entry.kbd}</kbd>}
        </button>
      );
    });

  return (
    <div
      ref={ref}
      className="occ-ctx occ-chrome"
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y, width: WIDTH }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {list(entries, false)}
    </div>
  );
}
