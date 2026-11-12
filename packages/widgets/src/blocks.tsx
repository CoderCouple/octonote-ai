import { useEffect, useRef, useState } from "react";
import { Accordion, Button, Progress, Tabs } from "./controls.js";
import { Widget } from "./explorable/widget.js";
import { cx } from "./provider.js";
import { RichText } from "./rich-text.js";
import type { BlockOf, ContentBlock } from "./schema.js";

const CALLOUT_LABELS = { note: "Note", tip: "Tip", warning: "Warning", important: "Important" } as const;
const CALLOUT_ICONS = { note: "i", tip: "✦", warning: "!", important: "★" } as const;

export function Callout({ variant = "note", title, text }: Omit<BlockOf<"callout">, "type">) {
  return (
    <aside className={cx("wg-callout", `wg-callout--${variant}`)} aria-label={title ?? CALLOUT_LABELS[variant]}>
      <span className="wg-callout__icon" aria-hidden="true">
        {CALLOUT_ICONS[variant]}
      </span>
      <div className="wg-callout__body">
        <p className="wg-callout__title">{title ?? CALLOUT_LABELS[variant]}</p>
        <p>
          <RichText text={text} />
        </p>
      </div>
    </aside>
  );
}

export function Definition({ term, definition, example }: Omit<BlockOf<"definition">, "type">) {
  return (
    <dl className="wg-definition">
      <dt className="wg-definition__term">{term}</dt>
      <dd className="wg-definition__text">
        <RichText text={definition} />
      </dd>
      {example ? (
        <dd className="wg-definition__example">
          <span className="wg-label">Example</span> <RichText text={example} />
        </dd>
      ) : null}
    </dl>
  );
}

export function Steps({ title, items }: Omit<BlockOf<"steps">, "type">) {
  return (
    <section className="wg-steps" aria-label={title ?? "Steps"}>
      {title ? <p className="wg-block-title">{title}</p> : null}
      <ol className="wg-steps__list">
        {items.map((item, i) => (
          <li key={i} className="wg-steps__item">
            <span className="wg-steps__number" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <p className="wg-steps__title">{item.title}</p>
              {item.text ? (
                <p className="wg-muted">
                  <RichText text={item.text} />
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CodeBlock({ code, language, caption }: Omit<BlockOf<"code">, "type">) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <figure className="wg-code">
      <div className="wg-code__bar">
        <span className="wg-code__language">{language ?? "code"}</span>
        <Button size="sm" variant="ghost" onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="wg-code__pre" tabIndex={0}>
        <code>{code}</code>
      </pre>
      {caption ? <figcaption className="wg-muted wg-small">{caption}</figcaption> : null}
    </figure>
  );
}

export function Takeaway({ title = "Key takeaway", points }: Omit<BlockOf<"takeaway">, "type">) {
  return (
    <section className="wg-takeaway" aria-label={title}>
      <p className="wg-takeaway__title">{title}</p>
      {points.length === 1 ? (
        <p>
          <RichText text={points[0]!} />
        </p>
      ) : (
        <ul>
          {points.map((point, i) => (
            <li key={i}>
              <RichText text={point} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Comparison({ caption, columns, rows, highlight }: Omit<BlockOf<"comparison">, "type">) {
  return (
    <div className="wg-table-wrap" tabIndex={0} role="group" aria-label={caption ?? "Comparison table"}>
      <table className="wg-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            <td />
            {columns.map((column, i) => (
              <th key={i} scope="col" className={cx(i === highlight && "wg-table__highlight")}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{row.label}</th>
              {columns.map((_, c) => (
                <td key={c} className={cx(c === highlight && "wg-table__highlight")}>
                  {row.values[c] ? <RichText text={row.values[c]!} /> : <span className="wg-muted">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stats({ items }: Omit<BlockOf<"stats">, "type">) {
  return (
    <dl className="wg-stats">
      {items.map((item, i) => (
        <div key={i} className="wg-stat">
          <dt className="wg-stat__label">{item.label}</dt>
          <dd className="wg-stat__value">{item.value}</dd>
          {item.detail ? <dd className="wg-muted wg-small">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ items }: Omit<BlockOf<"timeline">, "type">) {
  return (
    <ol className="wg-timeline">
      {items.map((item, i) => (
        <li key={i} className="wg-timeline__item">
          <span className="wg-timeline__label">{item.label}</span>
          <div className="wg-timeline__body">
            <p className="wg-timeline__title">{item.title}</p>
            {item.text ? (
              <p className="wg-muted">
                <RichText text={item.text} />
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Renders one content block. Unknown types render nothing, since validation already ran. */
export function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level ?? 2}` as "h2" | "h3" | "h4";
      return <Tag className={cx("wg-heading", `wg-heading--${block.level ?? 2}`)}>{block.text}</Tag>;
    }
    case "paragraph":
      return (
        <p className="wg-paragraph">
          <RichText text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="wg-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <figure className="wg-quote">
          <blockquote>
            <RichText text={block.text} />
          </blockquote>
          {block.cite ? <figcaption>— {block.cite}</figcaption> : null}
        </figure>
      );
    case "divider":
      return <hr className="wg-divider" />;
    case "callout":
      return <Callout {...block} />;
    case "definition":
      return <Definition {...block} />;
    case "steps":
      return <Steps {...block} />;
    case "code":
      return <CodeBlock {...block} />;
    case "takeaway":
      return <Takeaway {...block} />;
    case "comparison":
      return <Comparison {...block} />;
    case "stats":
      return <Stats {...block} />;
    case "timeline":
      return <Timeline {...block} />;
    case "progress":
      return <Progress label={block.label} value={block.value} max={block.max} />;
    case "tabs":
      return <Tabs items={block.tabs.map((tab) => ({ label: tab.label, content: <Blocks blocks={tab.blocks} /> }))} />;
    case "widget":
      return <Widget spec={block} />;
    case "accordion":
      return <Accordion allowMultiple={block.allowMultiple} items={block.items.map((item) => ({ title: item.title, content: <Blocks blocks={item.blocks} /> }))} />;
    default:
      return null;
  }
}

export function Blocks({ blocks }: { blocks: readonly ContentBlock[] }) {
  return (
    <div className="wg-blocks">
      {blocks.map((block, i) => (
        <Block key={block.id ?? i} block={block} />
      ))}
    </div>
  );
}
