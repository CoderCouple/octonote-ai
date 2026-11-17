import { Icon } from "../icons.js";
import { cx, Desc, Figure, IconBubble, ItemBody, Label, Part, toneVar } from "../parts.js";
import type { InfographicContent, ItemStyle } from "../schema.js";
import type { CSSProperties } from "react";
import { arcPath, r2 } from "./geometry.js";

type Props = { spec: InfographicContent; style: ItemStyle };

/** Cards in a grid: as many columns as fit, never more than four. */
export function GridLayout({ spec, style }: Props) {
  const n = spec.items.length;
  const cols = n <= 4 ? n : n % 3 === 0 ? 3 : 4;
  return (
    <div className="ig-grid" style={{ "--ig-cols": cols } as CSSProperties}>
      {spec.items.map((item, i) => (
        <Part key={i} k={`${i}`} item={item} index={i} className="ig-grid__cell">
          <ItemBody item={item} index={i} style={style} />
        </Part>
      ))}
    </div>
  );
}

/** A row of interlocking chevrons with the text underneath. */
export function ArrowsLayout({ spec, style }: Props) {
  return (
    <ol className="ig-arrows">
      {spec.items.map((item, i) => (
        <li key={i} className="ig-arrows__step">
          <Part k={`${i}`} item={item} index={i} className="ig-arrows__part">
            <span className={cx("ig-chevron", i === 0 && "ig-chevron--first")} aria-hidden="true">
              {style === "badge" && item.icon ? <Icon name={item.icon} size={22} /> : <span className="ig-chevron__n">{String(i + 1).padStart(2, "0")}</span>}
            </span>
            <span className="ig-arrows__text">
              <Label>{item.label}</Label>
              <Figure item={item} />
              <Desc>{item.desc}</Desc>
            </span>
          </Part>
        </li>
      ))}
    </ol>
  );
}

/** Ticked and unticked items. */
export function ChecklistLayout({ spec }: Props) {
  return (
    <ul className="ig-checklist">
      {spec.items.map((item, i) => (
        <li key={i}>
          <Part k={`${i}`} item={item} index={i} className={cx("ig-check", item.done === false && "ig-check--todo")} style={item.tone ? undefined : ({ "--ig-tone": "var(--ig-green)" } as CSSProperties)}>
            <span className="ig-check__mark" aria-hidden="true">
              {item.done === false ? null : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
            <span className="ig-check__text">
              <Label>{item.label}</Label>
              <Desc lines={2}>{item.desc}</Desc>
            </span>
            <Figure item={item} />
            <span className="ig-sr">{item.done === false ? " (not done)" : " (done)"}</span>
          </Part>
        </li>
      ))}
    </ul>
  );
}

/** Stacked bands, widest first, each narrowing like a stepped pyramid seen from the front. */
export function TiersLayout({ spec }: Props) {
  const n = spec.items.length;
  return (
    <ol className="ig-tiers">
      {spec.items.map((item, i) => (
        <li key={i} className="ig-tiers__row">
          <Part k={`${i}`} item={item} index={i} className="ig-tier" style={{ width: `${100 - (i * 44) / Math.max(1, n - 1)}%` }}>
            <span className="ig-tier__band">
              <IconBubble item={item} index={i} size={30} />
              <Label>{item.label}</Label>
              <Figure item={item} className="ig-figure--inline" />
            </span>
          </Part>
          {item.desc ? <Desc className="ig-tiers__desc" lines={2}>{item.desc}</Desc> : null}
        </li>
      ))}
    </ol>
  );
}

/** A ring cut into equal segments, numbered, with the items listed either side. */
export function SectorLayout({ spec }: Props) {
  const n = spec.items.length;
  const gap = 2.2;
  const half = Math.ceil(n / 2);
  const side = (from: number, to: number, cls: string) => (
    <ol className={cx("ig-sector__list", cls)} start={from + 1}>
      {spec.items.slice(from, to).map((item, j) => {
        const i = from + j;
        return (
          <li key={i}>
            <Part k={`${i}`} item={item} index={i} className="ig-sector__item">
              <IconBubble item={item} index={i} size={34} />
              <span className="ig-item__text">
                <Label>{item.label}</Label>
                <Figure item={item} />
                <Desc lines={2}>{item.desc}</Desc>
              </span>
            </Part>
          </li>
        );
      })}
    </ol>
  );
  return (
    <div className="ig-sector">
      {side(0, half, "ig-sector__list--left")}
      <svg className="ig-sector__ring" viewBox="-110 -110 220 220" role="presentation" aria-hidden="true">
        {spec.items.map((item, i) => {
          const a0 = (i / n) * 360 + gap / 2;
          const a1 = ((i + 1) / n) * 360 - gap / 2;
          const mid = ((a0 + a1) / 2 - 90) * (Math.PI / 180);
          return (
            <g key={i} className="ig-anim" style={{ "--ig-i": i } as CSSProperties}>
              <path d={arcPath(0, 0, 100, 62, a0, a1)} fill={toneVar(item, i)} />
              <text x={r2(Math.cos(mid) * 81)} y={r2(Math.sin(mid) * 81)} className="ig-sector__n" textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
            </g>
          );
        })}
        <circle r="54" className="ig-sector__hole" />
      </svg>
      {side(half, n, "ig-sector__list--right")}
    </div>
  );
}
