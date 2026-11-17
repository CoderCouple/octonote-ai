import type { CSSProperties } from "react";
import { Icon } from "../icons.js";
import { cx, Desc, Figure, ItemBody, Label, Part, toneVar } from "../parts.js";
import type { InfographicContent, InfographicItem, ItemStyle } from "../schema.js";
import { polar } from "./geometry.js";

type Props = { spec: InfographicContent; style: ItemStyle };

/** An org-chart tree: the root on top, children below, joined by elbow connectors. */
export function TreeLayout({ spec, style }: Props) {
  const root = spec.items[0]!;
  const branch = (item: InfographicItem, key: string, tone: CSSProperties, depth: number, index: number) => (
    <li key={key} className="ig-tree__branch">
      <Part k={key} item={{ ...item, children: undefined }} index={index} className={cx("ig-tree__node", `ig-tree__node--d${depth}`)} style={item.tone ? undefined : tone}>
        <ItemBody item={item} index={index} style={depth === 0 ? "badge" : style} align="center" />
      </Part>
      {item.children?.length ? (
        <ul className="ig-tree__kids">
          {item.children.map((child, j) =>
            branch(child, `${key}.${j}`, depth === 0 ? ({ "--ig-tone": toneVar(child, j + 1) } as CSSProperties) : tone, depth + 1, depth === 0 ? j + 1 : index),
          )}
        </ul>
      ) : null}
    </li>
  );
  return (
    <div className="ig-tree">
      <ul className="ig-tree__root">{branch(root, "0", { "--ig-tone": toneVar(root, 0) } as CSSProperties, 0, 0)}</ul>
    </div>
  );
}

/** Stacked layers, each a labelled band holding its parts as pills: an architecture or a stack. */
export function LayersLayout({ spec, style }: Props) {
  return (
    <ol className="ig-layers">
      {spec.items.map((item, i) => (
        <li key={i} className="ig-layers__row" style={{ "--ig-tone": toneVar(item, i), "--ig-i": i } as CSSProperties}>
          <Part k={`${i}`} item={{ ...item, children: undefined }} index={i} className="ig-layers__label">
            {item.icon ? <Icon name={item.icon} size={20} /> : null}
            <Label>{item.label}</Label>
            <Desc lines={2}>{item.desc}</Desc>
          </Part>
          <ul className="ig-layers__parts">
            {(item.children ?? []).map((child, j) => (
              <li key={j}>
                <Part k={`${i}.${j}`} item={child} index={i} className={cx("ig-layers__part", style === "card" && "ig-layers__part--card")} style={{ "--ig-tone": toneVar(item, i) } as CSSProperties}>
                  {child.icon ? <Icon name={child.icon} size={16} /> : null}
                  <span className="ig-item__text">
                    <Label>{child.label}</Label>
                    {style === "card" ? <Desc lines={2}>{child.desc}</Desc> : null}
                  </span>
                </Part>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** One idea in the centre with spokes out to the things around it. */
export function HubLayout({ spec, style }: Props) {
  const center = spec.items[0]!;
  const kids = center.children ?? [];
  const n = kids.length;
  const at = (j: number) => polar(50, 50, 1, (j / n) * 360);
  return (
    <div className="ig-hub" style={{ "--ig-n": n } as CSSProperties}>
      <svg className="ig-hub__spokes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {kids.map((child, j) => {
          const [ux, uy] = at(j);
          return (
            <line
              key={j}
              x1={50}
              y1={50}
              x2={50 + (ux - 50) * 38}
              y2={50 + (uy - 50) * 36}
              className="ig-hub__spoke ig-anim"
              style={{ stroke: toneVar(child, j + 1), "--ig-i": j } as CSSProperties}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <Part k="0" item={{ ...center, children: undefined }} index={0} className="ig-hub__center">
        <span className="ig-hub__core" aria-hidden="true">
          {center.icon ? <Icon name={center.icon} size={30} /> : null}
        </span>
        <Label>{center.label}</Label>
        <Figure item={center} />
      </Part>
      {kids.map((child, j) => {
        const [ux, uy] = at(j);
        return (
          <div key={j} className="ig-hub__spot" style={{ left: `${50 + (ux - 50) * 38}%`, top: `${50 + (uy - 50) * 36}%` }}>
            <Part k={`0.${j}`} item={child} index={j + 1} className="ig-hub__part">
              <ItemBody item={child} index={j} style={style} align="center" />
            </Part>
          </div>
        );
      })}
    </div>
  );
}
