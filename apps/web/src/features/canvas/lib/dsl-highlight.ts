/**
 * Syntax colours for figure code (octodraw's Eraser-style DSL), for the
 * figure code pane. Line by line and forgiving: a half-typed line still
 * colours sensibly. Kinds map to the design tokens' dark `code-*` palette.
 */
export type DslTokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "name"
  | "operator"
  | "punct"
  | "attr"
  | "value"
  | "number"
  | "string"
  | "label";

export interface DslToken {
  text: string;
  kind: DslTokenKind;
}

const KEYWORDS = new Set([
  "title",
  "direction",
  "colorMode",
  "styleMode",
  "typeface",
  "wrap",
  "notation",
  "autoNumber",
  "activate",
  "deactivate",
  "legend",
  "flow",
  "loop",
  "alt",
  "opt",
  "par",
  "break",
  "else",
  "and",
]);

// Longest first, so "-->" isn't read as "-" then ">".
const OPERATORS = ["<-->", "<->", "-->", "<--", "<>", "--", "->", ">", "<"];

export function highlightDslLine(line: string): DslToken[] {
  const out: DslToken[] = [];
  const push = (text: string, kind: DslTokenKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let inProps = false;
  let afterColon = false; // inside [ ]: reading a value
  let first = true; // first word on the line
  while (i < line.length) {
    const rest = line.slice(i);
    const ch = line[i]!;
    if (!inProps && rest.startsWith("//")) {
      push(rest, "comment");
      break;
    }
    if (/\s/.test(ch)) {
      const m = /^\s+/.exec(rest)![0];
      push(m, "plain");
      i += m.length;
      continue;
    }
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      const text = end === -1 ? rest : line.slice(i, end + 1);
      push(text, inProps && afterColon ? "value" : "string");
      i += text.length;
      continue;
    }
    if (inProps) {
      if (ch === "]") {
        push(ch, "punct");
        inProps = false;
        i++;
        continue;
      }
      if (ch === ",") {
        push(ch, "punct");
        afterColon = false;
        i++;
        continue;
      }
      if (ch === ":") {
        push(ch, "punct");
        afterColon = true;
        i++;
        continue;
      }
      const m = /^[^,\]":]+/.exec(rest)![0];
      const trimmed = m.trimEnd();
      if (afterColon)
        push(
          trimmed,
          /^-?\d+(\.\d+)?(px)?$/.test(trimmed) ? "number" : "value",
        );
      else push(trimmed, "attr");
      push(m.slice(trimmed.length), "plain");
      i += m.length;
      continue;
    }
    if (ch === "[") {
      push(ch, "punct");
      inProps = true;
      afterColon = false;
      first = false;
      i++;
      continue;
    }
    if (ch === ":") {
      // An arrow's label runs to the end of the line or to its own [props].
      push(ch, "punct");
      const m = /^[^[]*/.exec(line.slice(i + 1))![0];
      const trimmed = m.trimEnd();
      push(m.slice(0, m.length - m.trimStart().length), "plain");
      push(trimmed.trimStart(), "label");
      push(m.slice(trimmed.length), "plain");
      i += 1 + m.length;
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    // A lone "-" is a connector only between spaces; otherwise it's part of a name.
    const dash =
      ch === "-" && /^-(\s|$)/.test(rest) && /(^|\s)$/.test(line.slice(0, i));
    if (op || dash) {
      push(op ?? "-", "operator");
      i += (op ?? "-").length;
      first = false;
      continue;
    }
    if ("{},&".includes(ch)) {
      push(ch, "punct");
      i++;
      continue;
    }
    const m = /^[^\s[\]{}:,&"<>]+/.exec(rest)?.[0] ?? ch;
    push(m, first && KEYWORDS.has(m) ? "keyword" : "name");
    if (
      first &&
      KEYWORDS.has(m) &&
      /^(title|direction|colorMode|styleMode|typeface|wrap|notation|autoNumber)$/.test(
        m,
      )
    ) {
      // A setting: the rest of the line is its value.
      const value = line.slice(i + m.length);
      push(value.slice(0, value.length - value.trimStart().length), "plain");
      push(value.trimStart(), "value");
      break;
    }
    first = false;
    i += m.length;
  }
  return out;
}

export function highlightDsl(source: string): DslToken[][] {
  return source.split("\n").map(highlightDslLine);
}
