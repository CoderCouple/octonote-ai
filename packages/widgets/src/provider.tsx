import { createContext, useContext, useMemo, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

export interface WidgetsSettings {
  theme: Theme;
  /** Renders TeX from `$…$`. Pass KaTeX or MathJax here; without it the TeX shows as text. */
  renderMath?: (tex: string) => ReactNode;
}

const WidgetsContext = createContext<WidgetsSettings>({ theme: "system" });

/** Settings plus a themed wrapper, so the --wg-* tokens apply to every control and block inside. */
export function WidgetsProvider({ theme = "system", renderMath, className, children }: Partial<WidgetsSettings> & { className?: string; children: ReactNode }) {
  const value = useMemo(() => ({ theme, renderMath }), [theme, renderMath]);
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
