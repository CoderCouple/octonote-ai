import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment, type ReactNode } from "react";
import { highlightCode } from "../lib/highlight";

/**
 * A published note's blocks as plain server-rendered HTML. It is what search
 * engines, AI crawlers and link unfurlers read (BlockNote only renders in the
 * browser), and what readers see until the editor mounts and takes its place
 * — so the page doesn't jump from empty to full. Read-only and dependency-free;
 * anything unknown falls back to its text.
 */

interface Inline {
  type: string;
  text?: string;
  href?: string;
  styles?: Record<string, unknown>;
  props?: { latex?: string };
  content?: Inline[] | string;
}

interface Block {
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | TableContent;
  children?: Block[];
}

interface TableContent {
  type: "tableContent";
  rows: { cells: (Inline[] | { content?: Inline[] })[] }[];
}

function math(latex: string, displayMode: boolean) {
  return katex.renderToString(latex, { displayMode, throwOnError: false });
}

function inline(items: Inline[] | string | undefined): ReactNode {
  if (!items) return null;
  if (typeof items === "string") return items;
  return items.map((c, i) => {
    if (c.type === "link")
      return (
        <a
          key={i}
          href={c.href}
          rel="noopener"
          className="underline underline-offset-2"
        >
          {inline(c.content)}
        </a>
      );
    if (c.type === "math" && c.props?.latex)
      return (
        <span
          key={i}
          dangerouslySetInnerHTML={{ __html: math(c.props.latex, false) }}
        />
      );
    let node: ReactNode = c.text ?? "";
    const s = c.styles ?? {};
    if (s.code)
      node = (
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em]">
          {node}
        </code>
      );
    if (s.bold) node = <strong>{node}</strong>;
    if (s.italic) node = <em>{node}</em>;
    if (s.underline) node = <u>{node}</u>;
    if (s.strike) node = <s>{node}</s>;
    return <Fragment key={i}>{node}</Fragment>;
  });
}

function asInline(content: Block["content"]): Inline[] | undefined {
  return Array.isArray(content) ? content : undefined;
}

// BlockNote's heading scale (3em / 2em / 1.3em), so the swap doesn't jump.
const HEADING = {
  1: "mt-3 text-[3em] font-bold leading-[1.5]",
  2: "mt-3 text-[2em] font-bold leading-[1.5]",
  3: "mt-3 text-[1.3em] font-bold leading-[1.5]",
} as const;

function renderBlock(b: Block, key: number): ReactNode {
  const p = b.props ?? {};
  const text = inline(asInline(b.content));
  const children = b.children?.length ? (
    <div className="pl-6">{renderBlocks(b.children)}</div>
  ) : null;

  switch (b.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(p.level) || 1)) as 1 | 2 | 3;
      const Tag = `h${level + 1}` as "h2" | "h3" | "h4";
      return (
        <Fragment key={key}>
          <Tag className={`text-foreground-strong ${HEADING[level]}`}>
            {text}
          </Tag>
          {children}
        </Fragment>
      );
    }
    case "bulletListItem":
    case "numberedListItem":
    case "checkListItem":
    case "toggleListItem":
      // Lists are grouped by renderBlocks; a lone item renders as one.
      return renderList([b], key);
    case "quote":
      return (
        <blockquote
          key={key}
          className="text-muted-foreground my-1 border-l-2 border-current pl-4"
        >
          {text}
          {children}
        </blockquote>
      );
    case "codeBlock": {
      const raw = (asInline(b.content) ?? [])
        .map((n) => (typeof n.text === "string" ? n.text : ""))
        .join("");
      const html = highlightCode(
        raw,
        typeof p.language === "string" ? p.language : undefined,
      );
      return (
        <pre
          key={key}
          className="bg-code-background text-code-foreground my-2 overflow-x-auto rounded-md p-4 font-mono text-sm leading-[1.6] break-words whitespace-pre-wrap"
        >
          {html ? (
            // highlight.js escapes the code; only its own spans are added.
            <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <code>{text}</code>
          )}
        </pre>
      );
    }
    case "mathBlock":
      return typeof p.latex === "string" && p.latex ? (
        <div
          key={key}
          className="my-2 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: math(p.latex, true) }}
        />
      ) : null;
    case "mermaid":
      // The diagram renders in the browser; crawlers get its source as text.
      return (
        <figure
          key={key}
          className="bg-muted/40 my-2 min-h-48 rounded-lg border"
        >
          <pre className="sr-only">{String(p.code ?? "")}</pre>
        </figure>
      );
    case "image":
      return p.url ? (
        <figure key={key} className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain HTML on purpose: same URL the editor loads */}
          <img
            src={String(p.url)}
            alt={String(p.caption || p.name || "")}
            className="max-w-full rounded-md"
          />
          {p.caption ? (
            <figcaption className="text-muted-foreground mt-1 text-sm">
              {String(p.caption)}
            </figcaption>
          ) : null}
        </figure>
      ) : null;
    case "figure":
      return p.imageUrl ? (
        <figure
          key={key}
          className="my-2"
          style={{ width: `${Number(p.widthPct) || 100}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- plain HTML on purpose: same URL the editor loads */}
          <img
            src={String(p.imageUrl)}
            alt={String(p.title || "Figure")}
            width={Number(p.width) || undefined}
            height={Number(p.height) || undefined}
            className="h-auto w-full rounded-lg border"
          />
          {p.title ? (
            <figcaption className="mt-1 text-sm font-medium">
              {String(p.title)}
            </figcaption>
          ) : null}
        </figure>
      ) : null;
    case "table": {
      const t = b.content as TableContent | undefined;
      if (!t || t.type !== "tableContent") return null;
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r}>
                  {row.cells.map((cell, c) => (
                    <td key={c} className="border px-3 py-1.5 align-top">
                      {inline(Array.isArray(cell) ? cell : cell.content)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "divider":
      return <hr key={key} className="my-4" />;
    case "canvasReference":
      return (
        <div key={key} className="bg-muted/40 my-2 h-24 rounded-lg border" />
      );
    default:
      return (
        <Fragment key={key}>
          {text ? (
            <p className="py-[3px]">{text}</p>
          ) : (
            <p className="h-[1.5em]" />
          )}
          {children}
        </Fragment>
      );
  }
}

function renderList(items: Block[], key: number): ReactNode {
  const type = items[0].type;
  const Tag = type === "numberedListItem" ? "ol" : "ul";
  return (
    <Tag
      key={key}
      className={
        type === "numberedListItem"
          ? "list-decimal pl-6"
          : type === "bulletListItem"
            ? "list-disc pl-6"
            : "list-none pl-1"
      }
    >
      {items.map((b, i) => (
        <li key={i} className="py-[3px]">
          {type === "checkListItem" ? (
            <input
              type="checkbox"
              checked={Boolean(b.props?.checked)}
              readOnly
              disabled
              className="mr-2 align-middle"
            />
          ) : null}
          {inline(asInline(b.content))}
          {b.children?.length ? renderBlocks(b.children) : null}
        </li>
      ))}
    </Tag>
  );
}

const LIST_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
]);

function renderBlocks(blocks: Block[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (LIST_TYPES.has(b.type)) {
      // Consecutive items of one list type become one <ul>/<ol>.
      const run = [b];
      while (blocks[i + 1]?.type === b.type) run.push(blocks[++i]);
      out.push(renderList(run, i));
    } else out.push(renderBlock(b, i));
  }
  return out;
}

export function StaticNote({ document }: { document: unknown }) {
  const blocks =
    document &&
    typeof document === "object" &&
    Array.isArray((document as { blocks?: unknown }).blocks)
      ? (document as { blocks: Block[] }).blocks
      : [];
  return (
    <div className="static-note text-foreground whitespace-pre-wrap mx-auto max-w-[var(--reader-content-width)] text-[length:var(--font-reader-size,1rem)] leading-normal">
      {renderBlocks(blocks)}
    </div>
  );
}
