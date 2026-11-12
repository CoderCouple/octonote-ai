import { Fragment, type ReactNode } from "react";
import { useWidgets } from "./provider.js";

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "math"; tex: string }
  | { kind: "link"; href: string; children: InlineNode[] };

/** Only these link targets are ever rendered as links. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Parses the inline Markdown subset into nodes. It never produces HTML: the
 * result is rendered as React elements, so text is always escaped.
 */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const rest = source.slice(i);
    if (ch === "\\" && i + 1 < source.length) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ kind: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "$") {
      const end = source.indexOf("$", i + 1);
      // "$5 and $10" is money, not maths: math must not start or end with a space.
      if (end > i + 1 && source[i + 1] !== " " && source[end - 1] !== " ") {
        flush();
        nodes.push({ kind: "math", tex: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        flush();
        const href = safeHref(link[2]!);
        // Unsafe targets (javascript:, data:…) keep their text and lose the link.
        if (href) nodes.push({ kind: "link", href, children: parseInline(link[1]!) });
        else nodes.push(...parseInline(link[1]!));
        i += link[0].length;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = source.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ kind: "strong", children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const end = source.indexOf(ch, i + 1);
      if (end > i + 1 && source[i + 1] !== " ") {
        flush();
        nodes.push({ kind: "em", children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return nodes;
}

function renderNodes(nodes: InlineNode[], renderMath?: (tex: string) => ReactNode): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case "text":
        return <Fragment key={i}>{node.text}</Fragment>;
      case "strong":
        return <strong key={i}>{renderNodes(node.children, renderMath)}</strong>;
      case "em":
        return <em key={i}>{renderNodes(node.children, renderMath)}</em>;
      case "code":
        return (
          <code key={i} className="wg-inline-code">
            {node.text}
          </code>
        );
      case "math":
        return (
          <span key={i} className="wg-math">
            {renderMath ? renderMath(node.tex) : node.tex}
          </span>
        );
      case "link":
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {renderNodes(node.children, renderMath)}
          </a>
        );
    }
  });
}

/** Renders inline Markdown safely. Math uses the provider's `renderMath` (e.g. KaTeX) or shows the TeX. */
export function RichText({ text }: { text: string }) {
  const { renderMath } = useWidgets();
  return <>{renderNodes(parseInline(text), renderMath)}</>;
}
