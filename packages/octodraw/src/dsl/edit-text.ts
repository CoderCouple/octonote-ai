import { stripComment } from './parse';
import type { ColumnSpan, PropertiesSpan } from './types';

// Text helpers shared by the ERD and sequence code edits (`edit-erd.ts`,
// `edit-sequence.ts`). Same rules as `edit.ts`: only the target's own lines
// change, indentation, comments, blank lines and property order are kept.

export interface EditResult {
  source: string;
  changed: boolean;
  /** Why nothing changed, when the edit was refused. */
  reason?: string;
}

export function refuse(source: string, reason: string): EditResult {
  return { source, changed: false, reason };
}

export function unchanged(source: string): EditResult {
  return { source, changed: false };
}

/** The source split into lines, with its line ending. */
export interface SourceText {
  source: string;
  lines: string[];
  eol: string;
}

export function sourceText(source: string): SourceText {
  return { source, lines: source.split(/\r?\n/), eol: source.includes('\r\n') ? '\r\n' : '\n' };
}

export function lineAt(text: SourceText, line: number): string {
  return text.lines[line - 1] ?? '';
}

/** The text of a span on a line. */
export function rawAt(text: SourceText, line: number, span: ColumnSpan | undefined): string {
  return span ? lineAt(text, line).slice(span.column - 1, span.endColumn - 1) : '';
}

/** The leading whitespace of a line. */
export function indentOf(text: SourceText, line: number): string {
  return /^\s*/.exec(lineAt(text, line))![0];
}

export const isPropertyKey = (key: string) => /^[A-Za-z][\w-]*$/.test(key);

/** Writes a property value, quoting it when the parser would otherwise split or cut it; undefined when it can't be written. */
export function formatValue(value: string): string | undefined {
  const text = value.replace(/\r?\n/g, '\\n');
  if (text.includes('"')) return undefined;
  return text === '' || /[,[\]:]|\/\//.test(text) || text !== text.trim() ? `"${text}"` : text;
}

/**
 * A `[props]` block's text after setting `key` to a formatted value (or with
 * `null` removing it); '' when no property is left. Order is kept and a new
 * property goes at the end.
 */
export function propsAfter(text: SourceText, line: number, props: PropertiesSpan | undefined, key: string, value: string | null): string {
  if (!props) return value === null ? '' : `[${key}: ${value}]`;
  let raw = rawAt(text, line, props);
  const base = props.column;
  const entries = props.entries.map((e) => ({ key: e.key, start: e.entry.column - base, end: e.entry.endColumn - base, value: e.valueRange }));
  if (value === null) {
    if (!entries.some((e) => e.key === key)) return raw;
    for (let k = entries.length - 1; k >= 0; k--) {
      const entry = entries[k]!;
      if (entry.key !== key) continue;
      if (k < entries.length - 1) raw = raw.slice(0, entry.start) + raw.slice(entries[k + 1]!.start);
      else if (k > 0) raw = raw.slice(0, entries[k - 1]!.end) + raw.slice(entry.end);
      else raw = '[]';
      entries.splice(k, 1);
    }
    return entries.length ? raw : '';
  }
  const existing = entries.filter((e) => e.key === key).at(-1);
  if (existing) return raw.slice(0, existing.value.column - base) + value + raw.slice(existing.value.endColumn - base);
  const last = entries.at(-1);
  if (last) return `${raw.slice(0, last.end)}, ${key}: ${value}${raw.slice(last.end)}`;
  return `[${key}: ${value}]`;
}

/**
 * Writes `next` (from `propsAfter`) in place of a `[props]` block: replaced,
 * removed with the whitespace before it, or inserted (with a space) at `insertAt`.
 */
export function writeProps(text: SourceText, edits: LineEdits, line: number, props: PropertiesSpan | undefined, next: string, insertAt: number): void {
  if (props) {
    if (next) edits.splice(line, props.column, props.endColumn, next);
    else edits.splice(line, startOfSpace(text, line, props.column), props.endColumn, '');
  } else if (next) {
    edits.splice(line, insertAt, insertAt, ` ${next}`);
  }
}

/** The column where the whitespace right before `column` starts. */
export function startOfSpace(text: SourceText, line: number, column: number): number {
  const content = lineAt(text, line);
  let start = column;
  while (start > 1 && /\s/.test(content[start - 2] ?? '')) start--;
  return start;
}

/** Column splices, line removals and inserted lines on the original line numbers, applied together. */
export class LineEdits {
  private readonly splices = new Map<number, { start: number; end: number; text: string; prune: boolean }[]>();
  private readonly removed = new Set<number>();
  private readonly before = new Map<number, string[]>();
  private readonly after = new Map<number, string[]>();

  constructor(private readonly text: SourceText) {}

  /** Replaces 1-based columns `column`–`endColumn` (exclusive) of `line`; with `prune` the line goes if that leaves it blank. */
  splice(line: number, column: number, endColumn: number, text: string, prune = true): void {
    const list = this.splices.get(line) ?? [];
    list.push({ start: column - 1, end: endColumn - 1, text, prune });
    this.splices.set(line, list);
  }

  removeLine(line: number): void {
    this.removed.add(line);
  }

  /** Replaces a whole line's statement with `lines` at its indentation (none removes the line). */
  replaceLine(line: number, lines: string[]): void {
    this.removeLine(line);
    const indent = indentOf(this.text, line);
    for (const l of lines) this.insertAfter(line, indent + l);
  }

  insertBefore(line: number, text: string): void {
    const list = this.before.get(line) ?? [];
    list.push(text);
    this.before.set(line, list);
  }

  insertAfter(line: number, text: string): void {
    const list = this.after.get(line) ?? [];
    list.push(text);
    this.after.set(line, list);
  }

  result(): EditResult {
    const out: string[] = [];
    let overlap: number | undefined;
    this.text.lines.forEach((original, index) => {
      const line = index + 1;
      out.push(...(this.before.get(line) ?? []));
      if (!this.removed.has(line)) {
        const splices = (this.splices.get(line) ?? []).sort((a, b) => b.start - a.start || b.end - a.end);
        let text = original;
        let last = Infinity;
        for (const s of splices) {
          if (s.end > last) overlap ??= line;
          text = text.slice(0, s.start) + s.text + text.slice(s.end);
          last = s.start;
        }
        const prune = splices.some((s) => s.prune);
        for (const part of text.split('\n')) {
          if (prune && !stripComment(part).trim()) continue;
          out.push(part);
        }
      }
      out.push(...(this.after.get(line) ?? []));
    });
    if (overlap !== undefined) return refuse(this.text.source, `Couldn't rewrite line ${overlap} safely`);
    const source = out.join(this.text.eol);
    return { source, changed: source !== this.text.source };
  }
}
