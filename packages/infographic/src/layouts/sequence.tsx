import { useId, type CSSProperties } from "react";
import { Icon } from "../icons.js";
import { cx, Desc, Figure, figureOf, formatNumber, IconBubble, ItemBody, Label, pad2, Part, toneVar, useInfographic } from "../parts.js";
import type { InfographicContent, ItemStyle } from "../schema.js";
import { arcLine, polar } from "./geometry.js";

type Props = { spec: InfographicContent; style: ItemStyle };

const Node = ({ i, icon, small }: { i: number; icon?: Parameters<typeof Icon>[0]["name"]; small?: boolean }) => (
  <span className={cx("ig-node", small && "ig-node--small")} aria-hidden="true">
    {icon ? <Icon name={icon} size={small ? 14 : 18} /> : <span>{i + 1}</span>}
  </span>
);

/** Numbered steps joined by a line, the text under each (a column when narrow). */
export function StepsLayout({ spec, style }: Props) {
  return (
    <ol className="ig-steps" style={{ "--ig-n": spec.items.length } as CSSProperties}>
      {spec.items.map((item, i) => (
        <li key={i} className="ig-steps__step">
          <Part k={`${i}`} item={item} index={i} className="ig-steps__part">
            <span className="ig-steps__head">
              <Node i={i} icon={item.icon} />
              <span className="ig-steps__kicker">Step {i + 1}</span>
            </span>
            <ItemBody item={{ ...item, icon: undefined }} index={i} style={style} align="center" />
          </Part>
        </li>
      ))}
    </ol>
  );
}

/** Dated events on a line: dates on the line, events alternating above and below (a list when narrow). */
export function TimelineLayout({ spec, style }: Props) {
  const { unit } = useInfographic();
  return (
    <ol className="ig-timeline" style={{ "--ig-n": spec.items.length } as CSSProperties}>
      {spec.items.map((item, i) => (
        <li key={i} className={cx("ig-timeline__event", i % 2 ? "ig-timeline__event--up" : "ig-timeline__event--down")}>
          <Part k={`${i}`} item={item} index={i} className="ig-timeline__part">
            <span className="ig-timeline__date">{figureOf(item, unit)}</span>
            <span className="ig-timeline__dot" aria-hidden="true" />
            <span className="ig-timeline__card">
              <ItemBody item={{ ...item, display: undefined, value: undefined }} index={i} style={style} align="center" />
            </span>
          </Part>
        </li>
      ))}
    </ol>
  );
}

/** A vertical spine with numbered nodes; items alternate sides (one side when narrow). */
export function RoadmapLayout({ spec, style }: Props) {
  return (
    <ol className="ig-roadmap">
      {spec.items.map((item, i) => (
        <li key={i} className={cx("ig-roadmap__row", i % 2 ? "ig-roadmap__row--right" : "ig-roadmap__row--left")}>
          <Part k={`${i}`} item={item} index={i} className="ig-roadmap__part">
            <span className="ig-roadmap__node">
              <Node i={i} icon={item.icon} />
            </span>
            <span className="ig-roadmap__card">
              <span className="ig-roadmap__kicker">{item.display ?? `Phase ${i + 1}`}</span>
              <ItemBody item={{ ...item, icon: undefined, display: undefined }} index={i} style={style} />
            </span>
          </Part>
        </li>
      ))}
    </ol>
  );
}

/** Steps that run left to right, turn, and run back: a path you can follow row by row. */
export function SnakeLayout({ spec, style }: Props) {
  const n = spec.items.length;
  const per = n <= 6 ? 3 : 4;
  return (
    <ol className="ig-snake" style={{ "--ig-cols": per } as CSSProperties}>
      {spec.items.map((item, i) => {
        const row = Math.floor(i / per);
        const forward = row % 2 === 0;
        const col = forward ? i % per : per - 1 - (i % per);
        const last = i === n - 1;
        const turn = !last && Math.floor((i + 1) / per) !== row;
        const link = last ? null : turn ? "down" : forward ? "right" : "left";
        return (
          <li key={i} className={cx("ig-snake__cell", link && `ig-snake__cell--${link}`)} style={{ gridRow: row + 1, gridColumn: col + 1 }}>
            <Part k={`${i}`} item={item} index={i} className="ig-snake__part">
              <span className="ig-snake__badge">{pad2(i + 1)}</span>
              <ItemBody item={item} index={i} style={style} />
            </Part>
          </li>
        );
      })}
    </ol>
  );
}

/** Steps alternating above and below a zigzag line. */
export function ZigzagLayout({ spec, style }: Props) {
  const n = spec.items.length;
  const points = spec.items.map((_, i) => `${((i + 0.5) / n) * 100},${i % 2 ? 80 : 20}`).join(" ");
  return (
    <div className="ig-zigzag" style={{ "--ig-n": n } as CSSProperties}>
      <svg className="ig-zigzag__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      {spec.items.map((item, i) => (
        <div key={i} className={cx("ig-zigzag__cell", i % 2 ? "ig-zigzag__cell--down" : "ig-zigzag__cell--up")} style={{ gridColumn: i + 1 }}>
          <Part k={`${i}`} item={item} index={i} className="ig-zigzag__part">
            <span className="ig-zigzag__node">
              <Node i={i} icon={item.icon} small />
            </span>
            <ItemBody item={{ ...item, icon: undefined }} index={i} style={style} align="center" />
          </Part>
        </div>
      ))}
    </div>
  );
}

/** Steps climbing up to the right, each on a taller block. */
export function StairsLayout({ spec, style }: Props) {
  const n = spec.items.length;
  return (
    <ol className="ig-stairs" style={{ "--ig-n": n } as CSSProperties}>
      {spec.items.map((item, i) => (
        <li key={i} className="ig-stairs__step">
          <Part k={`${i}`} item={item} index={i} className="ig-stairs__part">
            <span className="ig-stairs__text">
              <ItemBody item={item} index={i} style={style} />
            </span>
            <span className="ig-stairs__block" style={{ height: `${46 + (i / Math.max(1, n - 1)) * 90}px` }} aria-hidden="true">
              <span>{pad2(i + 1)}</span>
            </span>
          </Part>
        </li>
      ))}
    </ol>
  );
}

/** Narrowing stages; each shows its figure and what share of the first stage reaches it. */
export function FunnelLayout({ spec }: Props) {
  const n = spec.items.length;
  const first = spec.items[0]?.value || 0;
  const inset = 30 / n;
  return (
    <ol className="ig-funnel">
      {spec.items.map((item, i) => {
        const share = first > 0 && i > 0 && item.value !== undefined ? Math.round((item.value / first) * 100) : null;
        const x0 = i * inset;
        const x1 = (i + 1) * inset;
        return (
          <li key={i} className="ig-funnel__row">
            <Part k={`${i}`} item={item} index={i} className="ig-funnel__part">
              <span className="ig-funnel__band" style={{ clipPath: `polygon(${x0}% 0, ${100 - x0}% 0, ${100 - x1}% 100%, ${x1}% 100%)` }}>
                <Label>{item.label}</Label>
                <Figure item={item} className="ig-figure--inline" />
              </span>
              <span className="ig-funnel__side">
                {share !== null ? <span className="ig-funnel__share">{share}% of first stage</span> : <span className="ig-funnel__share">Start</span>}
                <Desc lines={2}>{item.desc}</Desc>
              </span>
            </Part>
          </li>
        );
      })}
    </ol>
  );
}

/** A triangle cut into levels, the first item at the top; the text sits beside each level. */
export function PyramidLayout({ spec }: Props) {
  const n = spec.items.length;
  return (
    <ol className="ig-pyramid">
      {spec.items.map((item, i) => {
        const w0 = (i / n) * 100;
        const w1 = ((i + 1) / n) * 100;
        return (
          <li key={i} className="ig-pyramid__row">
            <Part k={`${i}`} item={item} index={i} className="ig-pyramid__part">
              <span className="ig-pyramid__shape">
                <span
                  className="ig-pyramid__band"
                  style={{ clipPath: `polygon(${50 - w0 / 2}% 0, ${50 + w0 / 2}% 0, ${50 + w1 / 2}% 100%, ${50 - w1 / 2}% 100%)` }}
                >
                  {i > 0 || n <= 3 ? item.icon ? <Icon name={item.icon} size={18} /> : <span>{i + 1}</span> : null}
                </span>
              </span>
              <span className="ig-pyramid__text">
                <span className="ig-pyramid__rule" aria-hidden="true" />
                <span className="ig-item__text">
                  <Label>{item.label}</Label>
                  <Figure item={item} />
                  <Desc lines={2}>{item.desc}</Desc>
                </span>
              </span>
            </Part>
          </li>
        );
      })}
    </ol>
  );
}

/** Stages around a loop with arrows between them, the title in the middle. */
export function CycleLayout({ spec }: Props) {
  const uid = useId().replace(/:/g, "");
  const n = spec.items.length;
  const gap = n <= 4 ? 26 : n <= 6 ? 20 : 16;
  return (
    <div className="ig-cycle" style={{ "--ig-n": n } as CSSProperties}>
      <svg className="ig-cycle__ring" viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          {spec.items.map((item, i) => (
            <marker key={i} id={`${uid}-a${i}`} viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
              <path d="M0 1L10 5L0 9z" style={{ fill: toneVar(item, i) }} />
            </marker>
          ))}
        </defs>
        {spec.items.map((item, i) => {
          const a0 = (i / n) * 360 + gap / 2;
          const a1 = ((i + 1) / n) * 360 - gap / 2;
          return <path key={i} d={arcLine(0, 0, 70, a0, a1)} className="ig-cycle__arc ig-anim" style={{ stroke: toneVar(item, i), "--ig-i": i } as CSSProperties} markerEnd={`url(#${uid}-a${i})`} />;
        })}
      </svg>
      <div className="ig-cycle__center">
        <span>{spec.items.length} stages</span>
      </div>
      {spec.items.map((item, i) => {
        const [x, y] = polar(50, 50, 35, (i / n) * 360);
        return (
          <div key={i} className="ig-cycle__stage" style={{ left: `${x}%`, top: `${y}%` }}>
            <Part k={`${i}`} item={item} index={i} className="ig-cycle__part">
              <IconBubble item={item} index={i} size={44} />
              <span className="ig-cycle__text">
                <Label>{item.label}</Label>
                <Figure item={item} />
                <Desc lines={2}>{item.desc}</Desc>
              </span>
            </Part>
          </div>
        );
      })}
    </div>
  );
}

export { formatNumber };
