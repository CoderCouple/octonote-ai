import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./icons.js";
import type { InfographicItem, ItemStyle } from "./schema.js";

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export interface InfographicContextValue {
  /** Key of the part whose detail is open. */
  open: string | null;
  toggle: (key: string) => void;
  /** Id of the detail panel, for aria-controls. */
  detailId: string;
  unit?: string;
}

export const InfographicContext = createContext<InfographicContextValue>({ open: null, toggle: () => undefined, detailId: "", unit: undefined });
export const useInfographic = () => useContext(InfographicContext);

/** The CSS colour of an item: its own tone, else the palette colour for its position. */
export function toneVar(item: Pick<InfographicItem, "tone"> | undefined, index: number): string {
  return item?.tone ? `var(--ig-${item.tone})` : `var(--ig-p${index % 8})`;
}

export function toneStyle(item: Pick<InfographicItem, "tone"> | undefined, index: number, extra?: CSSProperties): CSSProperties {
  return { "--ig-tone": toneVar(item, index), "--ig-i": index, ...extra } as CSSProperties;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
  return Math.abs(n) >= 100_000 ? compactFormat.format(n) : numberFormat.format(n);
}

/** What an item shows as its figure: its display text, else its value with the unit. */
export function figureOf(item: InfographicItem, unit?: string): string | undefined {
  if (item.display) return item.display;
  if (item.value === undefined) return undefined;
  const u = unit ?? "";
  return `${formatNumber(item.value)}${u === "%" ? "%" : u ? ` ${u}` : ""}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * One clickable part of a graphic. With a detail, it's a button that opens
 * the detail panel under the graphic; without one it's plain. Either way it
 * carries its tone and its place in the entrance stagger.
 */
export function Part({
  k,
  item,
  index,
  className,
  style,
  children,
}: {
  k: string;
  item: InfographicItem;
  index: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { open, toggle, detailId } = useInfographic();
  const css = { ...toneStyle(item, index), ...style };
  if (!item.detail)
    return (
      <div className={cx("ig-part", className)} style={css}>
        {children}
      </div>
    );
  return (
    <button
      type="button"
      className={cx("ig-part ig-part--open", open === k && "ig-part--on", className)}
      style={css}
      aria-expanded={open === k}
      aria-controls={detailId}
      onClick={() => toggle(k)}
    >
      {children}
    </button>
  );
}

export function IconBubble({ item, index, size = 40, number }: { item: InfographicItem; index: number; size?: number; number?: boolean }) {
  return (
    <span className="ig-bubble" style={{ width: size, height: size }} aria-hidden="true">
      {item.icon ? <Icon name={item.icon} size={Math.round(size * 0.5)} /> : <span className="ig-bubble__n">{number === false ? "" : index + 1}</span>}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("ig-label", className)}>{children}</span>;
}

export function Desc({ children, lines = 3, className }: { children?: ReactNode; lines?: number; className?: string }) {
  if (!children) return null;
  return (
    <span className={cx("ig-desc", className)} style={{ WebkitLineClamp: lines } as CSSProperties}>
      {children}
    </span>
  );
}

export function Figure({ item, className }: { item: InfographicItem; className?: string }) {
  const { unit } = useInfographic();
  const text = figureOf(item, unit);
  return text ? <span className={cx("ig-figure", className)}>{text}</span> : null;
}

/** An item drawn in one of the shared styles. Layouts place it; this draws what's inside. */
export function ItemBody({ item, index, style, align = "start" }: { item: InfographicItem; index: number; style: ItemStyle; align?: "start" | "center" }) {
  const centered = align === "center";
  switch (style) {
    case "badge":
      return (
        <span className={cx("ig-item ig-item--badge", centered && "ig-item--center")}>
          <IconBubble item={item} index={index} />
          <span className="ig-item__text">
            <Label>{item.label}</Label>
            <Figure item={item} />
            <Desc>{item.desc}</Desc>
          </span>
        </span>
      );
    case "card":
      return (
        <span className={cx("ig-item ig-item--card", centered && "ig-item--center")}>
          {item.icon ? (
            <span className="ig-item__chip" aria-hidden="true">
              <Icon name={item.icon} size={18} />
            </span>
          ) : null}
          <span className="ig-item__text">
            <span className="ig-item__row">
              <Label>{item.label}</Label>
              <Figure item={item} className="ig-figure--inline" />
            </span>
            <Desc>{item.desc}</Desc>
          </span>
        </span>
      );
    case "ribbon":
      return (
        <span className="ig-item ig-item--ribbon">
          <span className="ig-ribbon">
            {item.icon ? <Icon name={item.icon} size={18} /> : <span className="ig-ribbon__n">{pad2(index + 1)}</span>}
            <Label>{item.label}</Label>
          </span>
          <span className="ig-item__text">
            <Figure item={item} />
            <Desc lines={4}>{item.desc}</Desc>
          </span>
        </span>
      );
    case "candy":
      return (
        <span className="ig-item ig-item--candy">
          <svg className="ig-candy__blob" viewBox="0 0 120 120" aria-hidden="true">
            <path d="M120 0v78c-18 10-34 6-46-8S50 40 34 30 6 12 0 0z" />
          </svg>
          <IconBubble item={item} index={index} size={36} />
          <Label>{item.label}</Label>
          <Figure item={item} />
          <Desc>{item.desc}</Desc>
        </span>
      );
    case "indexed":
      return (
        <span className={cx("ig-item ig-item--indexed", centered && "ig-item--center")}>
          <span className="ig-index">{pad2(index + 1)}</span>
          <span className="ig-rule" aria-hidden="true" />
          <Label>{item.label}</Label>
          <Figure item={item} />
          <Desc>{item.desc}</Desc>
        </span>
      );
    case "pill":
      return (
        <span className={cx("ig-item ig-item--pill", centered && "ig-item--center")}>
          <span className="ig-pill">
            {item.icon ? <Icon name={item.icon} size={16} /> : null}
            <Label>{item.label}</Label>
            <Figure item={item} className="ig-figure--inline" />
          </span>
          <Desc lines={2}>{item.desc}</Desc>
        </span>
      );
    case "underline":
      return (
        <span className={cx("ig-item ig-item--underline", centered && "ig-item--center")}>
          <span className="ig-item__row">
            {item.icon ? <Icon name={item.icon} size={18} /> : null}
            <Label>{item.label}</Label>
          </span>
          <span className="ig-underline" aria-hidden="true" />
          <Figure item={item} />
          <Desc>{item.desc}</Desc>
        </span>
      );
    case "icon":
      return (
        <span className="ig-item ig-item--icon ig-item--center">
          <span className="ig-iconbadge" aria-hidden="true">
            {item.icon ? <Icon name={item.icon} size={24} /> : <span className="ig-bubble__n">{index + 1}</span>}
            {item.icon ? <span className="ig-iconbadge__n">{index + 1}</span> : null}
          </span>
          <Label>{item.label}</Label>
          <Figure item={item} />
          <Desc lines={2}>{item.desc}</Desc>
        </span>
      );
    case "plain":
    default:
      return (
        <span className={cx("ig-item ig-item--plain", centered && "ig-item--center")}>
          <Label>{item.label}</Label>
          <Figure item={item} />
          <Desc>{item.desc}</Desc>
        </span>
      );
  }
}
