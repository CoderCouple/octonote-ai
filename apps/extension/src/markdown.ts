/**
 * Turns what the person selected on ChatGPT, Claude or Gemini into Markdown:
 * headings, paragraphs, lists, tables, code (with its language), links,
 * bold/italic and maths (from KaTeX's hidden TeX). Buttons, icons and other
 * page furniture are dropped. Only http(s) links are kept.
 */

const SKIP = new Set([
  "BUTTON",
  "SVG",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "IMG",
  "VIDEO",
  "AUDIO",
  "CANVAS",
]);

export function htmlToMarkdown(root: Node): string {
  // Whitespace between the page's elements leaves lines of spaces; outside code, those are blank lines.
  let inCode = false;
  const lines = block(root, 0)
    .split("\n")
    .map((line) => {
      if (/^```/.test(line.trim())) inCode = !inCode;
      return inCode
        ? line
        : line.replace(/^[ \t]+$/, "").replace(/[ \t]+$/, "");
    });
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A selection (a DocumentFragment from Range.cloneContents()) as Markdown. */
export function fragmentToMarkdown(fragment: DocumentFragment): string {
  const wrap = document.createElement("div");
  wrap.appendChild(fragment);
  return htmlToMarkdown(wrap);
}

function isElement(n: Node): n is HTMLElement {
  return n.nodeType === Node.ELEMENT_NODE;
}

/** KaTeX keeps the original TeX in an annotation; use it instead of the rendered glyphs. */
function tex(el: HTMLElement): string | null {
  const annotation = el.querySelector(
    'annotation[encoding="application/x-tex"]',
  );
  return annotation?.textContent?.trim() ?? null;
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? "").replace(/\s+/g, " ");
  if (
    !isElement(node) ||
    SKIP.has(node.tagName.toUpperCase()) ||
    node.getAttribute("aria-hidden") === "true"
  )
    return "";
  const el = node;
  if (
    el.classList.contains("katex") ||
    el.classList.contains("katex-display")
  ) {
    const t = tex(el);
    if (t)
      return el.classList.contains("katex-display") ||
        el.closest(".katex-display")
        ? `\n\n$$${t}$$\n\n`
        : `$${t}$`;
  }
  const inner = () => [...el.childNodes].map(inline).join("");
  switch (el.tagName) {
    case "STRONG":
    case "B": {
      const t = inner().trim();
      return t ? `**${t}**` : "";
    }
    case "EM":
    case "I": {
      const t = inner().trim();
      return t ? `*${t}*` : "";
    }
    case "CODE":
      return `\`${(el.textContent ?? "").replace(/`/g, "ˋ")}\``;
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const t = inner().trim();
      return /^https?:\/\//.test(href) && t ? `[${t}](${href})` : t;
    }
    case "BR":
      return "\n";
    default:
      return inner();
  }
}

function block(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return inline(node);
  if (
    !isElement(node) ||
    SKIP.has(node.tagName.toUpperCase()) ||
    node.getAttribute("aria-hidden") === "true"
  )
    return "";
  const el = node;
  if (el.classList.contains("katex-display")) return inline(el);
  const children = () =>
    [...el.childNodes].map((c) => block(c, depth)).join("");
  switch (el.tagName) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return `\n\n${"#".repeat(Number(el.tagName[1]))} ${inline(el).trim()}\n\n`;
    case "P":
      return `\n\n${inlineChildren(el).trim()}\n\n`;
    case "BLOCKQUOTE":
      return `\n\n${htmlToMarkdown(el)
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`;
    case "PRE": {
      const code = el.querySelector("code") ?? el;
      const lang = /language-([\w+-]+)/.exec(code.className)?.[1] ?? "";
      return `\n\n\`\`\`${lang}\n${(code.textContent ?? "").replace(/\n$/, "")}\n\`\`\`\n\n`;
    }
    case "UL":
    case "OL":
      return `\n\n${list(el, depth)}\n\n`;
    case "TABLE":
      return `\n\n${table(el)}\n\n`;
    case "HR":
      return "\n\n---\n\n";
    case "DIV":
    case "SECTION":
    case "ARTICLE":
    case "MAIN":
    case "SPAN":
    default:
      // Containers: keep their blocks; inline-only containers read as text.
      return hasBlocks(el) ? children() : inlineChildren(el);
  }
}

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "TABLE",
  "PRE",
  "BLOCKQUOTE",
  "HR",
  "DIV",
  "SECTION",
  "ARTICLE",
  "LI",
]);
const hasBlocks = (el: HTMLElement) =>
  [...el.children].some(
    (c) => BLOCK_TAGS.has(c.tagName) || c.classList.contains("katex-display"),
  );
const inlineChildren = (el: HTMLElement) =>
  [...el.childNodes].map(inline).join("");

function list(el: HTMLElement, depth: number): string {
  const ordered = el.tagName === "OL";
  const start = Number(el.getAttribute("start") ?? 1) || 1;
  const items = [...el.children].filter(
    (c) => c.tagName === "LI",
  ) as HTMLElement[];
  return items
    .map((li, i) => {
      const marker = ordered ? `${start + i}.` : "-";
      const indent = "  ".repeat(depth);
      const own = [...li.childNodes]
        .filter(
          (c) => !(isElement(c) && (c.tagName === "UL" || c.tagName === "OL")),
        )
        .map((c) =>
          isElement(c) && c.tagName === "P"
            ? inlineChildren(c)
            : isElement(c) && hasBlocks(c)
              ? htmlToMarkdown(c)
              : inline(c),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const nested = [...li.children]
        .filter((c) => c.tagName === "UL" || c.tagName === "OL")
        .map((c) => list(c as HTMLElement, depth + 1))
        .join("\n");
      return `${indent}${marker} ${own}${nested ? `\n${nested}` : ""}`;
    })
    .join("\n");
}

function table(el: HTMLElement): string {
  const rows = [...el.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("th,td")].map((cell) =>
      inlineChildren(cell as HTMLElement)
        .replace(/\|/g, "\\|")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const [head, ...body] = rows;
  return [
    `| ${pad(head!).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...body.map((r) => `| ${pad(r).join(" | ")} |`),
  ].join("\n");
}
