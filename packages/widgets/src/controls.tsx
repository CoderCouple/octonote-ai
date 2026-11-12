import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "./provider.js";

/* Button */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** Shows a spinner and blocks clicks, keeping the button's width. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("wg-button", `wg-button--${variant}`, `wg-button--${size}`, loading && "wg-button--loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="wg-spinner" aria-hidden="true" /> : null}
      <span className="wg-button__label">{children}</span>
    </button>
  );
});

/** A button with only an icon. `label` is required so screen readers can name it. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children"> & { label: string; icon: ReactNode }>(function IconButton(
  { label, icon, className, variant = "ghost", ...rest },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} aria-label={label} title={label} className={cx("wg-icon-button", className)} {...rest}>
      <span aria-hidden="true">{icon}</span>
    </Button>
  );
});

/* Small display pieces */

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  return <span className={cx("wg-badge", `wg-badge--${tone}`, className)} {...rest} />;
}

export function Card({ className, interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("wg-card", interactive && "wg-card--interactive", className)} {...rest} />;
}

export function Progress({ value, max = 100, label, showValue = true }: { value: number; max?: number; label: string; showValue?: boolean }) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? Math.round((clamped / max) * 100) : 0;
  return (
    <div className="wg-progress">
      <div className="wg-progress__header">
        <span>{label}</span>
        {showValue ? <span className="wg-muted">{percent}%</span> : null}
      </div>
      <div className="wg-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={clamped}>
        <div className="wg-progress__bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="wg-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="wg-switch__track" aria-hidden="true">
        <span className="wg-switch__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

/* Tabs */

/** Headless tabs: roving focus with arrow keys, Home and End (WAI-ARIA tabs pattern). */
export function useTabs(count: number, initial = 0) {
  const base = useId();
  const [selected, setSelected] = useState(Math.min(initial, count - 1));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (index: number, focus = false) => {
    const next = (index + count) % count;
    setSelected(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: count - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key]!, true);
  };
  return {
    selected,
    select,
    tabProps: (index: number) => ({
      ref: (el: HTMLButtonElement | null) => void (tabs.current[index] = el),
      id: `${base}-tab-${index}`,
      role: "tab" as const,
      type: "button" as const,
      "aria-selected": index === selected,
      "aria-controls": `${base}-panel-${index}`,
      tabIndex: index === selected ? 0 : -1,
      onClick: () => select(index),
      onKeyDown,
    }),
    panelProps: (index: number) => ({
      id: `${base}-panel-${index}`,
      role: "tabpanel" as const,
      "aria-labelledby": `${base}-tab-${index}`,
      hidden: index !== selected,
      tabIndex: 0,
    }),
  };
}

export function Tabs({ items, label, initial }: { items: { label: string; content: ReactNode }[]; label?: string; initial?: number }) {
  const tabs = useTabs(items.length, initial);
  return (
    <div className="wg-tabs">
      <div className="wg-tabs__list" role="tablist" aria-label={label}>
        {items.map((item, i) => (
          <button key={i} className="wg-tabs__tab" {...tabs.tabProps(i)}>
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div key={i} className="wg-tabs__panel" {...tabs.panelProps(i)}>
          {item.content}
        </div>
      ))}
    </div>
  );
}

/* Accordion */

/** Headless accordion: which items are open, and props for each header button and panel. */
export function useAccordion(allowMultiple = false, initiallyOpen: number[] = []) {
  const base = useId();
  const [open, setOpen] = useState<Set<number>>(() => new Set(initiallyOpen));
  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(allowMultiple ? current : current.has(index) ? [index] : []);
      if (current.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  return {
    isOpen: (index: number) => open.has(index),
    toggle,
    buttonProps: (index: number) => ({
      id: `${base}-button-${index}`,
      type: "button" as const,
      "aria-expanded": open.has(index),
      "aria-controls": `${base}-panel-${index}`,
      onClick: () => toggle(index),
    }),
    panelProps: (index: number) => ({
      id: `${base}-panel-${index}`,
      role: "region" as const,
      "aria-labelledby": `${base}-button-${index}`,
      hidden: !open.has(index),
    }),
  };
}

export function Accordion({ items, allowMultiple, initiallyOpen }: { items: { title: string; content: ReactNode }[]; allowMultiple?: boolean; initiallyOpen?: number[] }) {
  const accordion = useAccordion(allowMultiple, initiallyOpen);
  return (
    <div className="wg-accordion">
      {items.map((item, i) => (
        <div key={i} className="wg-accordion__item">
          <h4 className="wg-accordion__heading">
            <button className="wg-accordion__button" {...accordion.buttonProps(i)}>
              <span>{item.title}</span>
              <span className="wg-accordion__chevron" aria-hidden="true" />
            </button>
          </h4>
          <div className="wg-accordion__panel" {...accordion.panelProps(i)}>
            {item.content}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Tooltip */

/** Shows on hover and keyboard focus; Escape hides it. The trigger is described by the tip. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="wg-tooltip"
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      {children}
      {open ? (
        <span id={tipId} role="tooltip" className="wg-tooltip__bubble">
          {content}
        </span>
      ) : null}
    </span>
  );
}

/* Dialog */

/**
 * A modal built on the native <dialog>, which traps focus, closes on Escape
 * and returns focus to the trigger by itself.
 */
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="wg-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="wg-dialog__content">
        <div className="wg-dialog__header">
          <h2 id={titleId} className="wg-dialog__title">
            {title}
          </h2>
          <IconButton label="Close" icon="✕" size="sm" onClick={onClose} />
        </div>
        <div className="wg-dialog__body">{children}</div>
        {footer ? <div className="wg-dialog__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}

/* Toasts */

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone?: "neutral" | "success" | "danger";
}

type ToastInput = Omit<Toast, "id"> & { duration?: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Hosts toasts. Each one is announced politely and disappears after `duration` (default 5 s). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ duration = 5000, ...toast }: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="wg-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("wg-toast", `wg-toast--${toast.tone ?? "neutral"}`)}>
            <div className="wg-toast__text">
              <p className="wg-toast__title">{toast.title}</p>
              {toast.description ? <p className="wg-muted">{toast.description}</p> : null}
            </div>
            <IconButton label="Dismiss" icon="✕" size="sm" onClick={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs a ToastProvider above it");
  return show;
}
