import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowsLayout, ChecklistLayout, GridLayout, SectorLayout, TiersLayout } from "./layouts/list.js";
import { CycleLayout, FunnelLayout, PyramidLayout, RoadmapLayout, SnakeLayout, StairsLayout, StepsLayout, TimelineLayout, ZigzagLayout } from "./layouts/sequence.js";
import { ColumnsLayout, ProsConsLayout, QuadrantLayout, SwotLayout, VersusLayout } from "./layouts/compare.js";
import { HubLayout, LayersLayout, TreeLayout } from "./layouts/hierarchy.js";
import { BarsLayout, ColumnsChartLayout, LineLayout, PieLayout, RingsLayout, StatsLayout } from "./layouts/chart.js";
import { cx, figureOf, InfographicContext } from "./parts.js";
import { familyOf, LAYOUT_STYLES, type InfographicContent, type InfographicItem, type ItemStyle } from "./schema.js";
import { validateInfographic } from "./validate.js";

export type Theme = "light" | "dark" | "system";

/** The item at a key like "2" or "1.3" or "0.2.1". */
function itemAt(items: InfographicItem[], key: string): InfographicItem | undefined {
  let list: InfographicItem[] | undefined = items;
  let found: InfographicItem | undefined;
  for (const part of key.split(".")) {
    found = list?.[Number(part)];
    list = found?.children;
  }
  return found;
}

const hasDetail = (items: InfographicItem[]): boolean => items.some((it) => !!it.detail || (it.children ? hasDetail(it.children) : false));

function body(spec: InfographicContent, style: ItemStyle): ReactNode {
  const p = { spec, style };
  switch (spec.layout) {
    case "grid": return <GridLayout {...p} />;
    case "arrows": return <ArrowsLayout {...p} />;
    case "checklist": return <ChecklistLayout {...p} />;
    case "tiers": return <TiersLayout {...p} />;
    case "sector": return <SectorLayout {...p} />;
    case "steps": return <StepsLayout {...p} />;
    case "timeline": return <TimelineLayout {...p} />;
    case "roadmap": return <RoadmapLayout {...p} />;
    case "snake": return <SnakeLayout {...p} />;
    case "zigzag": return <ZigzagLayout {...p} />;
    case "stairs": return <StairsLayout {...p} />;
    case "funnel": return <FunnelLayout {...p} />;
    case "pyramid": return <PyramidLayout {...p} />;
    case "cycle": return <CycleLayout {...p} />;
    case "versus": return <VersusLayout {...p} />;
    case "pros-cons": return <ProsConsLayout {...p} />;
    case "swot": return <SwotLayout {...p} />;
    case "quadrant": return <QuadrantLayout {...p} />;
    case "columns": return <ColumnsLayout {...p} />;
    case "tree": return <TreeLayout {...p} />;
    case "layers": return <LayersLayout {...p} />;
    case "hub": return <HubLayout {...p} />;
    case "bars": return <BarsLayout {...p} />;
    case "columns-chart": return <ColumnsChartLayout {...p} />;
    case "pie": return <PieLayout {...p} />;
    case "donut": return <PieLayout {...p} donut />;
    case "stats": return <StatsLayout {...p} />;
    case "rings": return <RingsLayout {...p} />;
    case "line": return <LineLayout {...p} />;
  }
}

/**
 * An infographic from a validated spec. Parts come in, one after another,
 * as it scrolls into view; any part with a detail opens it under the graphic
 * (click again or press Escape to close).
 */
export function Infographic({ spec, theme = "system", className }: { spec: InfographicContent; theme?: Theme; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const detailId = useId();
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setSeen(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const style: ItemStyle = spec.style ?? LAYOUT_STYLES[spec.layout]?.[0] ?? "plain";
  const ctx = useMemo(() => ({ open, toggle: (k: string) => setOpen((o) => (o === k ? null : k)), detailId, unit: spec.unit }), [open, detailId, spec.unit]);
  const selected = open ? itemAt(spec.items, open) : undefined;
  const clickable = hasDetail(spec.items);

  return (
    <InfographicContext.Provider value={ctx}>
      <figure
        ref={ref}
        className={cx("ig", `ig--${spec.layout}`, `ig--${familyOf(spec.layout)}`, seen && "ig--in", className)}
        data-theme={theme}
        data-palette={spec.palette ?? "default"}
        aria-labelledby={titleId}
      >
        <header className="ig__header">
          <h3 id={titleId} className="ig__title">
            {spec.title}
          </h3>
          {spec.subtitle ? <p className="ig__subtitle">{spec.subtitle}</p> : null}
        </header>
        <div className="ig__body">{body(spec, style)}</div>
        <div id={detailId} className={cx("ig__detail", selected?.detail && "ig__detail--on")} role="region" aria-live="polite" aria-label={selected ? `About ${selected.label}` : "Details"}>
          {selected?.detail ? (
            <>
              <p className="ig__detail-title">
                {selected.label}
                {figureOf(selected, spec.unit) ? <span className="ig__detail-figure">{figureOf(selected, spec.unit)}</span> : null}
              </p>
              <p className="ig__detail-text">{selected.detail}</p>
            </>
          ) : null}
        </div>
        {(clickable && !selected) || spec.source ? (
          <figcaption className="ig__foot">
            {clickable && !selected ? <span>Click any highlighted part to learn more.</span> : <span />}
            {spec.source ? <span className="ig__source">Source: {spec.source}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    </InfographicContext.Provider>
  );
}

/** Validates, then draws; shows what's wrong instead of crashing on a bad spec. */
export function InfographicRenderer({ spec, theme, className }: { spec: unknown; theme?: Theme; className?: string }) {
  const result = useMemo(() => validateInfographic(spec), [spec]);
  if (!result.ok)
    return (
      <div className="ig-error" role="alert">
        <p className="ig-error__title">This infographic can&apos;t be shown</p>
        <ul>
          {result.issues.slice(0, 5).map((i, n) => (
            <li key={n}>
              {i.path ? `${i.path}: ` : ""}
              {i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  return <Infographic spec={result.spec} theme={theme} className={className} />;
}
