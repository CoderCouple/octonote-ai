import { createContext, useContext, useMemo, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

export interface WidgetsSettings {
  theme: Theme;
  /** Renders TeX from `$…$`. Pass KaTeX or MathJax here; without it the TeX shows as text. */
  renderMath?: (tex: string) => ReactNode;
  /** Keeps each widget's settings (by its id) for the reader, e.g. across page loads. */
  store?: WidgetStore;
}

/** Where a widget's input values are kept between visits. Values read back are checked before use. */
export interface WidgetStore {
  load(key: string): Record<string, number> | undefined;
  save(key: string, values: Record<string, number>): void;
  remove(key: string): void;
}

/** A store in localStorage (or any Storage), tolerant of full or blocked storage. */
export function webWidgetStore(storage: Storage | undefined = globalThis.localStorage, prefix = "widget:"): WidgetStore {
  return {
    load(key) {
      try {
        const raw = storage?.getItem(prefix + key);
        const parsed: unknown = raw ? JSON.parse(raw) : undefined;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, number>) : undefined;
      } catch {
        return undefined;
      }
    },
    save(key, values) {
      try {
        storage?.setItem(prefix + key, JSON.stringify(values));
      } catch {
        // Full or blocked storage: settings just aren't kept.
      }
    },
    remove(key) {
      try {
        storage?.removeItem(prefix + key);
      } catch {
        // Ignore.
      }
    },
  };
}

const WidgetsContext = createContext<WidgetsSettings>({ theme: "system" });

/** Settings plus a themed wrapper, so the --wg-* tokens apply to every control and block inside. */
export function WidgetsProvider({ theme = "system", renderMath, store, className, children }: Partial<WidgetsSettings> & { className?: string; children: ReactNode }) {
  const value = useMemo(() => ({ theme, renderMath, store }), [theme, renderMath, store]);
  return (
    <WidgetsContext.Provider value={value}>
      <div className={cx("wg-root", className)} data-wg-theme={theme}>
        {children}
      </div>
    </WidgetsContext.Provider>
  );
}

export function useWidgets(): WidgetsSettings {
  return useContext(WidgetsContext);
}

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
