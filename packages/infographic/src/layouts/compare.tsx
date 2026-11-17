import type { CSSProperties } from "react";
import { Icon } from "../icons.js";
import { cx, Desc, Figure, ItemBody, Label, Part, toneVar } from "../parts.js";
import type { InfographicContent, InfographicItem, ItemStyle } from "../schema.js";

type Props = { spec: InfographicContent; style: ItemStyle };

const inherit = (parent: InfographicItem, i: number): CSSProperties => ({ "--ig-tone": toneVar(parent, i) }) as CSSProperties;

/** A group's children, each clickable, drawn in the chosen style and the group's colour. */
function Children({ parent, i, style }: { parent: InfographicItem; i: number; style: ItemStyle }) {
  return (
    <ul className="ig-children">
      {(parent.children ?? []).map((child, j) => (
        <li key={j}>
          <Part k={`${i}.${j}`} item={child} index={i} className="ig-children__part" style={child.tone ? undefined : inherit(parent, i)}>
            <ItemBody item={child} index={j} style={style} />
          </Part>
        </li>
      ))}
    </ul>
  );
}

function GroupHead({ item, i, mark }: { item: InfographicItem; i: number; mark?: "check" | "x" }) {
  return (
    <Part k={`${i}`} item={{ ...item, children: undefined }} index={i} className="ig-ghead">
      <span className="ig-ghead__icon" aria-hidden="true">
        {mark ? <Icon name={mark} size={22} /> : item.icon ? <Icon name={item.icon} size={22} /> : <span>{item.label.slice(0, 1).toUpperCase()}</span>}
      </span>
      <span className="ig-item__text">
        <Label>{item.label}</Label>
        <Figure item={item} />
        <Desc lines={2}>{item.desc}</Desc>
      </span>
    </Part>
  );
}

/** Two sides with a VS badge between them. */
export function VersusLayout({ spec, style }: Props) {
  const [a, b] = spec.items as [InfographicItem, InfographicItem];
  return (
    <div className="ig-versus">
      <section className="ig-versus__side" style={inherit(a, 0)}>
        <GroupHead item={a} i={0} />
        <Children parent={a} i={0} style={style} />
      </section>
      <div className="ig-versus__divider" aria-hidden="true">
        <span className="ig-vs">VS</span>
      </div>
      <section className="ig-versus__side" style={inherit(b, 1)}>
        <GroupHead item={b} i={1} />
        <Children parent={b} i={1} style={style} />
      </section>
    </div>
  );
}

/** The good on one side, the bad on the other, folded around a centre seam. */
export function ProsConsLayout({ spec, style }: Props) {
  const [pros, cons] = spec.items as [InfographicItem, InfographicItem];
  const side = (item: InfographicItem, i: number, mark: "check" | "x") => {
    const tone = item.tone ?? (mark === "check" ? "green" : "red");
    const styled = { ...item, tone } as InfographicItem;
    return (
      <section className={cx("ig-proscons__side", `ig-proscons__side--${mark === "check" ? "pro" : "con"}`)} style={inherit(styled, i)}>
        <GroupHead item={styled} i={i} mark={mark} />
        <ul className="ig-children">
          {(item.children ?? []).map((child, j) => (
            <li key={j}>
              <Part k={`${i}.${j}`} item={child} index={i} className="ig-children__part" style={inherit(styled, i)}>
                {style === "card" ? (
                  <span className="ig-item ig-item--card">
                    <span className="ig-item__chip" aria-hidden="true">
                      <Icon name={child.icon ?? (mark === "check" ? "plus" : "minus")} size={16} />
                    </span>
                    <span className="ig-item__text">
                      <Label>{child.label}</Label>
                      <Desc lines={2}>{child.desc}</Desc>
                    </span>
                  </span>
                ) : (
                  <ItemBody item={child} index={j} style={style} />
                )}
              </Part>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  return (
    <div className="ig-proscons">
      {side(pros, 0, "check")}
      <div className="ig-proscons__seam" aria-hidden="true" />
      {side(cons, 1, "x")}
    </div>
  );
}

const SWOT_LETTERS = ["S", "W", "O", "T"];
const SWOT_TONES = ["green", "red", "blue", "amber"] as const;

/** Strengths, weaknesses, opportunities and threats, each with a big letter and its points. */
export function SwotLayout({ spec }: Props) {
  return (
    <div className="ig-swot">
      {spec.items.slice(0, 4).map((raw, i) => {
        const item = { ...raw, tone: raw.tone ?? SWOT_TONES[i] } as InfographicItem;
        return (
          <section key={i} className="ig-swot__cell" style={inherit(item, i)}>
            <Part k={`${i}`} item={{ ...item, children: undefined }} index={i} className="ig-swot__head">
              <span className="ig-swot__letter" aria-hidden="true">
                {SWOT_LETTERS[i]}
              </span>
              <span className="ig-item__text">
                <Label>{item.label}</Label>
                <Desc lines={2}>{item.desc}</Desc>
              </span>
            </Part>
            <ul className="ig-swot__points">
              {(item.children ?? []).map((child, j) => (
                <li key={j}>
                  <Part k={`${i}.${j}`} item={child} index={i} className="ig-swot__point" style={inherit(item, i)}>
                    <span className="ig-swot__bullet" aria-hidden="true" />
                    <span className="ig-item__text">
                      <Label>{child.label}</Label>
                      <Desc lines={2}>{child.desc}</Desc>
                    </span>
                  </Part>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A 2×2 matrix on two axes: items go top-left, top-right, bottom-left, bottom-right. */
export function QuadrantLayout({ spec }: Props) {
  const axes = spec.axes;
  return (
    <div className={cx("ig-quadrant", axes && "ig-quadrant--axes")}>
      {axes ? (
        <div className="ig-quadrant__y" aria-hidden="true">
          <span>{axes.y[1]}</span>
          <span className="ig-quadrant__arrow">→</span>
          <span>{axes.y[0]}</span>
        </div>
      ) : null}
      <div className="ig-quadrant__grid">
        <span className="ig-quadrant__cross ig-quadrant__cross--h" aria-hidden="true" />
        <span className="ig-quadrant__cross ig-quadrant__cross--v" aria-hidden="true" />
        {spec.items.slice(0, 4).map((item, i) => (
          <Part key={i} k={`${i}`} item={item} index={i} className={cx("ig-quadrant__cell", `ig-quadrant__cell--${i}`)}>
            <span className="ig-quadrant__corner" aria-hidden="true">
              {item.icon ? <Icon name={item.icon} size={20} /> : <span>{["A", "B", "C", "D"][i]}</span>}
            </span>
            <Label>{item.label}</Label>
            <Figure item={item} />
            <Desc lines={3}>{item.desc}</Desc>
          </Part>
        ))}
      </div>
      {axes ? (
        <div className="ig-quadrant__x" aria-hidden="true">
          <span>{axes.x[0]}</span>
          <span className="ig-quadrant__arrow">→</span>
          <span>{axes.x[1]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Two to four columns, each headed by a big letter card, with its points below. */
export function ColumnsLayout({ spec, style }: Props) {
  return (
    <div className="ig-columns" style={{ "--ig-cols": spec.items.length } as CSSProperties}>
      {spec.items.map((item, i) => (
        <section key={i} className="ig-columns__col" style={inherit(item, i)}>
          <Part k={`${i}`} item={{ ...item, children: undefined }} index={i} className="ig-letter">
            <span className="ig-letter__big" aria-hidden="true">
              {item.icon ? <Icon name={item.icon} size={30} /> : item.label.slice(0, 1).toUpperCase()}
            </span>
            <Label>{item.label}</Label>
            <Desc lines={2}>{item.desc}</Desc>
          </Part>
          <Children parent={item} i={i} style={style} />
        </section>
      ))}
    </div>
  );
}
