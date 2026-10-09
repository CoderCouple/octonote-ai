/**
 * Markdown → note blocks, with the extras BlockNote's own parser doesn't
 * know: `$…$` inline math, `$$…$$` display math, and ```mermaid / ```math
 * fences. Used when pasting markdown into a note.
 *
 * Math is lifted out before BlockNote parses the markdown (otherwise `\\`
 * gets escaped and a lone `=` line turns into a heading), replaced by plain
 * placeholder tokens, and put back as math blocks / inline math afterwards.
 * Fenced code and inline code are left alone, so `$` inside code stays code.
 */
import type { BlockNoteEditor } from "@blocknote/core";

type AnyEditor = BlockNoteEditor<any, any, any>;
// Loosely-typed views of BlockNote's block JSON; the editor validates on insert.
type Node = Record<string, any>;

const BLOCK_TOKEN = (i: number) => `OCTOMATHBLOCK${i}END`;
const INLINE_TOKEN = (i: number) => `OCTOMATHINLINE${i}END`;
const BLOCK_TOKEN_RE = /^OCTOMATHBLOCK(\d+)END$/;
const INLINE_TOKEN_RE = /OCTOMATHINLINE(\d+)END/g;

/**
 * `$…$` with no space just inside either `$`, not preceded by a word char,
 * `\` or `$`, and not followed by a word char — so prices like "$0 | $29" or
 * "$125,000" stay text.
 */
const INLINE_MATH_RE =
  /(^|[^\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\w$])/g;
const DISPLAY_MATH_RE = /^[ \t]*\$\$([\s\S]*?)\$\$[ \t]*$/gm;
const FENCE_RE = /^[ \t]*(```|~~~)/;

const MATH_LANGS = new Set(["math", "latex", "tex", "katex"]);

/** Cheap check: does this text use any of the extras? */
export function hasMarkdownExtras(text: string): boolean {
  return (
    /^[ \t]*(```|~~~)[ \t]*(mermaid|math|latex|tex|katex)\b/im.test(text) ||
    /\$\$[\s\S]*?\$\$/.test(text) ||
    new RegExp(INLINE_MATH_RE.source, "m").test(text)
  );
}

export function markdownToBlocks(editor: AnyEditor, markdown: string): Node[] {
  const display: string[] = [];
  const inline: string[] = [];

  // Split into fenced-code and prose segments; only prose gets math lifted out.
  const segments: { code: boolean; text: string }[] = [];
  let fence: string | null = null;
  let buf: string[] = [];
  const flush = (code: boolean) => {
    if (buf.length) segments.push({ code, text: buf.join("\n") });
    buf = [];
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.match(FENCE_RE);
    if (!fence && m) {
      flush(false);
      fence = m[1]!;
      buf.push(line);
    } else if (fence && m && m[1] === fence) {
      buf.push(line);
      flush(true);
      fence = null;
    } else buf.push(line);
  }
  flush(fence !== null);

  const prose = (text: string) =>
    text
      .replace(
        DISPLAY_MATH_RE,
        (_, latex: string) =>
          `\n\n${BLOCK_TOKEN(display.push(latex.trim()) - 1)}\n\n`,
      )
      // Leave inline code spans untouched.
      .split(/(`+[^`\n]*`+)/)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(
              INLINE_MATH_RE,
              (_, pre: string, latex: string) =>
                `${pre}${INLINE_TOKEN(inline.push(latex) - 1)}`,
            ),
      )
      .join("");

  const processed = segments
    .map((s) => (s.code ? s.text : prose(s.text)))
    .join("\n");
  const blocks = editor.tryParseMarkdownToBlocks(processed) as Node[];
  return blocks.map((b) => restoreBlock(b, display, inline));
}

function textOf(content: unknown): string {
  return Array.isArray(content)
    ? content
        .map((c: Node) => (typeof c.text === "string" ? c.text : ""))
        .join("")
    : "";
}

function restoreBlock(block: Node, display: string[], inline: string[]): Node {
  const children = Array.isArray(block.children)
    ? block.children.map((c: Node) => restoreBlock(c, display, inline))
    : [];

  if (block.type === "paragraph") {
    const token = textOf(block.content).trim().match(BLOCK_TOKEN_RE);
    if (token)
      return {
        type: "mathBlock",
        props: { latex: display[Number(token[1])] ?? "" },
        children,
      };
  }

  if (block.type === "codeBlock") {
    const lang = String(block.props?.language ?? "").toLowerCase();
    const code = textOf(block.content);
    if (lang === "mermaid")
      return { type: "mermaid", props: { code }, children };
    if (MATH_LANGS.has(lang))
      return { type: "mathBlock", props: { latex: code.trim() }, children };
    return { ...block, children };
  }

  let content = block.content;
  if (Array.isArray(content)) content = restoreInline(content, inline);
  else if (content && content.type === "tableContent") {
    content = {
      ...content,
      rows: content.rows.map((row: Node) => ({
        ...row,
        cells: row.cells.map((cell: Node) =>
          Array.isArray(cell)
            ? restoreInline(cell, inline)
            : {
                ...cell,
                content: Array.isArray(cell.content)
                  ? restoreInline(cell.content, inline)
                  : cell.content,
              },
        ),
      })),
    };
  }
  return { ...block, content, children };
}

/** Splits text runs around inline-math tokens; also reads `$…$` inline code (our own export) as math. */
function restoreInline(content: Node[], inline: string[]): Node[] {
  const out: Node[] = [];
  for (const node of content) {
    if (node.type === "link" && Array.isArray(node.content)) {
      out.push({ ...node, content: restoreInline(node.content, inline) });
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") {
      out.push(node);
      continue;
    }
    const codeMath = node.styles?.code && node.text.match(/^\$([^$]+)\$$/);
    if (codeMath) {
      out.push({ type: "math", props: { latex: codeMath[1] } });
      continue;
    }
    let last = 0;
    for (const m of node.text.matchAll(INLINE_TOKEN_RE)) {
      if (m.index! > last)
        out.push({ ...node, text: node.text.slice(last, m.index) });
      out.push({ type: "math", props: { latex: inline[Number(m[1])] ?? "" } });
      last = m.index! + m[0].length;
    }
    if (last === 0) out.push(node);
    else if (last < node.text.length)
      out.push({ ...node, text: node.text.slice(last) });
  }
  return out;
}
