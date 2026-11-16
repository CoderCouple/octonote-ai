import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../explorable/icons.js";
import { PALETTE, type PaletteColor } from "../explorable/schema.js";
import { cx } from "../provider.js";
import { validateInfographic, type InfographicItem, type InfographicSpec } from "./schema.js";

/** Colours handed out in order to items that don't pick one. */
const CYCLE = PALETTE.filter((c) => c !== "gray");

const tone = (color: PaletteColor | undefined, i: number): CSSProperties =>
  ({ "--ig-tone": `var(--wg-c-${color ?? CYCLE[i % CYCLE.length]})`, "--ig-i": i }) as CSSProperties;

type Content = Omit<InfographicSpec, "schemaVersion" | "type" | "id">;

/**
 * An infographic drawn from a validated spec. Parts come in as it scrolls
 * into view; any part with a detail opens it underneath when clicked.
 */
export function Infographic({ spec, className }: { spec: Content; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setSeen(true);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = spec.layout === "compare" ? (spec.groups ?? []).flatMap((g, gi) => g.items.map((it, i) => ({ key: `${gi}-${i}`, it }))) : (spec.items ?? []).map((it, i) => ({ key: `${i}`, it }));
  const selected = items.find((x) => x.key === open)?.it;
  const anyDetail = items.some((x) => x.it.detail);

  /** One part of the graphic: a button when it has a detail to open. */
  const part = (key: string, item: InfographicItem, i: number, body: ReactNode, extra?: string) => {
    const style = tone(item.color, i);
    if (!item.detail)
      return (
        <div key={key} className={cx("wg-ig__part", extra)} style={style}>
          {body}
        </div>
      );
    return (
      <button
        key={key}
        type="button"
        className={cx("wg-ig__part wg-ig__part--open", open === key && "wg-ig__part--on", extra)}
        style={style}
        aria-expanded={open === key}
        onClick={() => setOpen((o) => (o === key ? null : key))}
      >
        {body}
      </button>
    );
  };

  const badge = (item: InfographicItem) => (item.icon ? <span className="wg-ig__icon"><Icon name={item.icon} size={20} /></span> : null);

  let graphic: ReactNode;
  switch (spec.layout) {
    case "cards":
      graphic = (
        <div className="wg-ig__cards">
          {(spec.items ?? []).map((item, i) =>
            part(`${i}`, item, i, <>
              {badge(item)}
              {item.value ? <span className="wg-ig__value">{item.value}</span> : null}
              <span className="wg-ig__label">{item.label}</span>
            </>),
          )}
        </div>
      );
      break;
    case "process":
      graphic = (
        <ol className="wg-ig__process">
          {(spec.items ?? []).map((item, i) => (
            <li key={i} className="wg-ig__step">
              {part(`${i}`, item, i, <>
                <span className="wg-ig__num">{item.icon ? <Icon name={item.icon} size={18} /> : i + 1}</span>
                <span className="wg-ig__label">{item.label}</span>
                {item.value ? <span className="wg-ig__meta">{item.value}</span> : null}
              </>)}
            </li>
          ))}
        </ol>
      );
      break;
    case "stats":
      graphic = (
        <div className="wg-ig__stats">
          {(spec.items ?? []).map((item, i) =>
            part(`${i}`, item, i, <>
              <span className="wg-ig__big">{item.value}</span>
              <span className="wg-ig__label">{item.label}</span>
            </>),
          )}
        </div>
      );
      break;
    case "compare":
      graphic = (
        <div className="wg-ig__compare" style={{ "--ig-cols": spec.groups?.length ?? 2 } as CSSProperties}>
          {(spec.groups ?? []).map((group, gi) => (
            <section key={gi} className="wg-ig__group" style={tone(group.color, gi)}>
              <h4 className="wg-ig__group-title">{group.label}</h4>
              {group.items.map((item, i) =>
                part(`${gi}-${i}`, { ...item, color: item.color ?? group.color ?? CYCLE[gi % CYCLE.length] }, gi * 6 + i, <>
                  {badge(item)}
                  <span className="wg-ig__label">{item.label}</span>
                  {item.value ? <span className="wg-ig__meta">{item.value}</span> : null}
                </>, "wg-ig__row"),
              )}
            </section>
          ))}
        </div>
      );
      break;
    case "timeline":
      graphic = (
        <ol className="wg-ig__timeline">
          {(spec.items ?? []).map((item, i) => (
            <li key={i} className="wg-ig__event">
              {part(`${i}`, item, i, <>
                <span className="wg-ig__dot" />
                <span className="wg-ig__date">{item.value}</span>
                <span className="wg-ig__label">{item.label}</span>
              </>)}
            </li>
          ))}
        </ol>
      );
      break;
    case "bars": {
      const max = Math.max(...(spec.items ?? []).map((it) => it.amount ?? 0), 0) || 1;
      graphic = (
        <div className="wg-ig__bars">
          {(spec.items ?? []).map((item, i) =>
            part(`${i}`, item, i, <>
              <span className="wg-ig__label">{item.label}</span>
              <span className="wg-ig__track">
                <span className="wg-ig__fill" style={{ width: seen ? `${((item.amount ?? 0) / max) * 100}%` : 0 }} />
              </span>
              <span className="wg-ig__amount">{item.value ?? `${(item.amount ?? 0).toLocaleString()}${spec.unit ? ` ${spec.unit}` : ""}`}</span>
            </>, "wg-ig__bar"),
          )}
        </div>
      );
      break;
    }
  }

  return (
    <section ref={ref} className={cx("wg-ig", `wg-ig--${spec.layout}`, seen && "wg-ig--in", className)} aria-label={spec.title}>
      <header className="wg-ig__header">
        <h3 className="wg-ig__title">{spec.title}</h3>
        {spec.subtitle ? <p className="wg-ig__subtitle">{spec.subtitle}</p> : null}
      </header>
      {graphic}
      {selected?.detail ? (
        <div className="wg-ig__detail" role="region" aria-live="polite" aria-label={selected.label}>
          <strong>{selected.label}</strong> {selected.detail}
        </div>
      ) : anyDetail ? (
        <p className="wg-ig__hint">Click any part to learn more.</p>
      ) : null}
      {spec.source ? <p className="wg-ig__source">Source: {spec.source}</p> : null}
    </section>
  );
}

/** Validates, then draws; shows what's wrong instead of crashing on a bad spec. */
export function InfographicSpecRenderer({ spec, className }: { spec: unknown; className?: string }) {
  const result = validateInfographic(spec);
  if (!result.ok)
    return (
      <div className="wg-notice" role="alert">
        <p className="wg-notice__title">This infographic can't be shown</p>
        <ul>
          {result.issues.slice(0, 5).map((i, n) => (
            <li key={n}>{i.path ? `${i.path}: ` : ""}{i.message}</li>
          ))}
        </ul>
      </div>
    );
  return <Infographic spec={result.spec} className={className} />;
}
