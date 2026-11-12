import { Component, useMemo, useState, type ReactNode } from "react";
import { cx, useWidgets, type Theme } from "../provider.js";
import { renderTemplate } from "./format.js";
import { WidgetInputControl } from "./inputs.js";
import { computeScope, useWidget, type InputValues } from "./runtime.js";
import { RuntimeProvider } from "./interact.js";
import { placedInputs, widgetSpecSchema, type WidgetBlock, type WidgetSpec } from "./schema.js";
import { WidgetViewRenderer } from "./views.js";

type WidgetContent = Omit<WidgetBlock, "type" | "id">;

/** An explorable widget card: inputs, values computed from them, and views that update live. */
export function Widget({ spec, className }: { spec: WidgetContent; className?: string }) {
  const { inputs, scope, setInput, reset, changed } = useWidget(spec);
  const [pin, setPin] = useState<InputValues | null>(null);
  const pinned = useMemo(() => (pin ? computeScope(spec, pin) : undefined), [spec, pin]);
  const runtime = useMemo(() => ({ spec, inputs, scope, setInput, pinned }), [spec, inputs, scope, setInput, pinned]);
  const placed = placedInputs(spec.views, spec.inputs);
  const loose = spec.inputs.filter((input) => !placed.has(input.id));
  const byId = new Map(spec.inputs.map((input) => [input.id, input]));
  const control = (id: string) => {
    const input = byId.get(id)!;
    return <WidgetInputControl key={`input-${id}`} input={input} value={inputs[id]!} onChange={(v) => setInput(id, v)} currency={spec.currency} />;
  };

  return (
    <section className={cx("wg-widget", className)} aria-label={spec.title}>
      <header className="wg-widget__header">
        <h3 className="wg-widget__title">{spec.title}</h3>
        {spec.compare ? (
          <button
            type="button"
            className={cx("wg-widget__reset", pin && "wg-widget__pin--on")}
            aria-pressed={!!pin}
            title={pin ? "Stop comparing" : "Keep these settings to compare against"}
            onClick={() => setPin((p) => (p ? null : { ...inputs }))}
          >
            {pin ? "Unpin" : "Pin to compare"}
          </button>
        ) : null}
        {changed ? (
          <button type="button" className={cx("wg-widget__reset", spec.compare && "wg-widget__reset--after")} onClick={reset}>
            Reset
          </button>
        ) : null}
        {spec.badge ? <span className="wg-widget__badge">{spec.badge}</span> : null}
      </header>
      {spec.description ? <p className="wg-widget__description">{spec.description}</p> : null}
      <RuntimeProvider value={runtime}>
        <WidgetBoundary>
          {spec.views.map((view, i) => (view.type === "input" ? control(view.input) : <WidgetViewRenderer key={i} view={view} scope={scope} currency={spec.currency} />))}
          {loose.length ? <div className="wg-widget__inputs">{loose.map((input) => control(input.id))}</div> : null}
        </WidgetBoundary>
      </RuntimeProvider>
      {spec.note ? <p className="wg-widget__note">{renderTemplate(spec.note, scope, spec.currency)}</p> : null}
    </section>
  );
}

/** Validates a standalone widget spec from any source and renders it, or a safe message. */
export function WidgetSpecRenderer({ spec, theme, className, fallback }: { spec: unknown; theme?: Theme; className?: string; fallback?: (issues: { path: string; message: string }[]) => ReactNode }) {
  const settings = useWidgets();
  const result = useMemo(() => validateWidget(spec), [spec]);
  return (
    <div className={cx("wg-root", className)} data-wg-theme={theme ?? settings.theme}>
      {result.ok ? (
        <Widget spec={result.spec} />
      ) : fallback ? (
        fallback(result.issues)
      ) : (
        <div className="wg-notice" role="alert">
          <p className="wg-notice__title">This widget couldn't be shown</p>
          <ul>
            {result.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                {issue.path ? <code>{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function validateWidget(input: unknown): { ok: true; spec: WidgetSpec } | { ok: false; issues: { path: string; message: string }[] } {
  const parsed = widgetSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}

class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Widget crashed", error);
  }

  render() {
    return this.state.failed ? (
      <div className="wg-notice" role="alert">
        <p className="wg-notice__title">Something went wrong in this widget</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
