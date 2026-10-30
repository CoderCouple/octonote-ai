import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

// Menu building blocks for the element toolbar: a keyboard-navigable menu
// container, labelled sections, option rows and segmented rows.

const ITEM = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])';

/**
 * A sub-menu: arrow keys move between items (by `columns` vertically in grids),
 * Home/End jump, Escape closes (the toolbar returns focus to its button). It
 * focuses the checked item, an element marked `data-autofocus`, or the first item.
 */
export function Menu({ label, onClose, children, className, columns, width }: { label: string; onClose: () => void; children: ReactNode; className?: string; columns?: number; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('[aria-checked="true"]') ?? el.querySelector<HTMLElement>(ITEM);
    target?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    // Keys typed into a field stay there (the icon picker handles its own arrows).
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      event.stopPropagation();
      return;
    }
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = (n: number) => items[Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + n))]!;
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowRight') next = step(1);
    else if (event.key === 'ArrowLeft') next = step(-1);
    else if (event.key === 'ArrowDown') next = step(columns ?? 1);
    else if (event.key === 'ArrowUp') next = step(-(columns ?? 1));
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items.at(-1);
    if (next) {
      event.preventDefault();
      next.focus();
    }
    // The diagram's own shortcuts (Backspace, Enter, +/−) don't apply inside a menu.
    event.stopPropagation();
  };
  return (
    <div ref={ref} className={`od-etb-pop${className ? ` ${className}` : ''}`} role="menu" aria-label={label} onKeyDown={onKeyDown} style={width ? { width } : undefined}>
      <div className="od-etb-sheet-handle" aria-hidden="true" />
      {children}
    </div>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="od-etb-plabel">{children}</div>;
export const MenuSeparator = () => <div className="od-etb-msep" role="separator" />;

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Leading preview (line sample, arrowhead, shape outline, "Aa"…). */
  preview?: ReactNode;
  /** Trailing text, e.g. a size in px. */
  hint?: string;
}

/** A vertical list of choices; the current one is highlighted in the accent colour. */
export function OptionList<T extends string>({ options, value, onPick, tall = false }: { options: readonly Option<T>[]; value: string | undefined; onPick: (value: T) => void; tall?: boolean }) {
  return (
    <div className="od-etb-options">
      {options.map((o) => (
        <button key={o.value} type="button" role="menuitemradio" aria-checked={value === o.value} className={`od-etb-opt${tall ? ' od-etb-opt-tall' : ''}`} onClick={() => onPick(o.value)}>
          {o.preview !== undefined && <span className="od-etb-opt-preview">{o.preview}</span>}
          {o.label}
          {o.hint && <span className="od-etb-opt-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** A row of segments in a grey track (alignment, line style, width, S/M/L). */
export function Segmented<T extends string>({ options, value, onPick, tall = false, label }: { options: readonly Option<T>[]; value: string | undefined; onPick: (value: T) => void; tall?: boolean; label: string }) {
  return (
    <div className={`od-etb-seg${tall ? ' od-etb-seg-tall' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="menuitemradio" aria-checked={value === o.value} aria-label={o.preview && !tall ? o.label : undefined} title={o.label} onClick={() => onPick(o.value)}>
          {o.preview}
          {(tall || !o.preview) && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

/** A menu row that runs a command (More menu). */
export function CommandRow({ icon, label, hint, danger, onClick, checked }: { icon: ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void; checked?: boolean }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} className={`od-etb-cmd${danger ? ' od-etb-danger' : ''}`} onClick={onClick}>
      {icon}
      {label}
      {checked !== undefined ? <span className="od-etb-switch" data-on={checked || undefined} aria-hidden="true" /> : hint ? <span className="od-etb-cmd-hint">{hint}</span> : null}
    </button>
  );
}
