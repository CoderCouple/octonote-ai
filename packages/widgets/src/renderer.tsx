import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Blocks } from "./blocks.js";
import { cx, useWidgets, type Theme } from "./provider.js";
import { validateDocument, type SpecIssue } from "./schema.js";

export interface WidgetRendererProps {
  /** A document from any source. It is validated before anything renders. */
  spec: unknown;
  fallback?: (issues: SpecIssue[]) => ReactNode;
  onInvalid?: (issues: SpecIssue[]) => void;
  theme?: Theme;
  className?: string;
}

/** Validates a content document and renders its blocks, or a safe message. */
export function WidgetRenderer({ spec, fallback, onInvalid, theme, className }: WidgetRendererProps) {
  const settings = useWidgets();
  const result = useMemo(() => validateDocument(spec), [spec]);
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;
  useEffect(() => {
    if (!result.ok) onInvalidRef.current?.(result.issues);
  }, [result]);
  return (
    <article className={cx("wg-root", "wg-document", className)} data-wg-theme={theme ?? settings.theme}>
      {result.ok ? (
        <BlockBoundary>
          {result.spec.title ? <h1 className="wg-document__title">{result.spec.title}</h1> : null}
          <Blocks blocks={result.spec.blocks} />
        </BlockBoundary>
      ) : fallback ? (
        fallback(result.issues)
      ) : (
        <div className="wg-notice" role="alert">
          <p className="wg-notice__title">This content couldn't be shown</p>
          <ul>
            {result.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                {issue.path ? <code>{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

class BlockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Widget document crashed", error);
  }

  render() {
    return this.state.failed ? (
      <div className="wg-notice" role="alert">
        <p className="wg-notice__title">Something went wrong showing this content</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
