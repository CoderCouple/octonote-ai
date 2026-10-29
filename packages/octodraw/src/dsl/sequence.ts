import { findClosingBracket, splitOutsideQuotes, stripComment, unquote } from './parse';
import type { Connector, Diagnostic, Legend, Properties, Severity, SourceRange } from './types';

// Parser for Eraser's sequence diagram syntax:
//
//   autoNumber on
//   Client [icon: monitor] > Server: Data request
//   activate Server
//   alt [label: if cached] {
//     Server > Client: Cached data
//   }
//   else [label: otherwise] {
//     Server > DB: Query
//   }
//   deactivate Server

export interface Participant {
  name: string;
  label: string;
  properties: Properties;
  range: SourceRange;
}

export type BlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'break';

export type SequenceEvent =
  | { type: 'message'; from: string; to: string; connector: Connector; label?: string; properties: Properties; range: SourceRange }
  | { type: 'activate' | 'deactivate'; participant: string; range: SourceRange }
  | { type: 'block-start'; block: number; kind: BlockKind; label?: string; properties: Properties; range: SourceRange }
  /** `else` (in alt) or `and` (in par): a new section of an open block. */
  | { type: 'block-section'; block: number; label?: string; range: SourceRange }
  | { type: 'block-end'; block: number; range: SourceRange };

export interface SequenceSettings {
  title?: string;
  colorMode: string;
  styleMode: string;
  typeface: string;
  autoNumber: 'off' | 'on' | 'nested';
}

export interface SequenceDiagram {
  kind: 'sequence';
  settings: SequenceSettings;
  /** In order of first appearance. */
  participants: Map<string, Participant>;
  events: SequenceEvent[];
  legend?: Legend;
  diagnostics: Diagnostic[];
}

const SETTINGS = {
  colorMode: ['pastel', 'bold', 'outline'],
  styleMode: ['shadow', 'plain', 'watercolor'],
  typeface: ['rough', 'clean', 'mono'],
  autoNumber: ['on', 'nested', 'off'],
} as const;
const PARTICIPANT_PROPERTIES = new Set(['icon', 'color', 'label', 'link', 'colorMode', 'styleMode', 'typeface']);
const BLOCK_KINDS: readonly string[] = ['loop', 'alt', 'opt', 'par', 'break'];

export function parseSequence(source: string): SequenceDiagram {
  const diagnostics: Diagnostic[] = [];
  const participants = new Map<string, Participant>();
  const events: SequenceEvent[] = [];
  const settings: SequenceSettings = { colorMode: 'pastel', styleMode: 'shadow', typeface: 'clean', autoNumber: 'off' };
  let legend: Legend | undefined;
  let inLegend = false;
  const stack: { block: number; kind: BlockKind; line: number }[] = [];
  let lastClosed: { block: number; kind: BlockKind } | undefined;
  let blocks = 0;

  const report = (severity: Severity, message: string, line: number, column: number, endColumn: number) =>
    diagnostics.push({ severity, message, line, column, endColumn: Math.max(endColumn, column + 1) });

  const parseProps = (raw: string, line: number, column: number, known?: Set<string>): Properties => {
    const props: Properties = {};
    for (const part of splitOutsideQuotes(raw, ',')) {
      const text = part.text.trim();
      if (!text) continue;
      const colon = text.indexOf(':');
      const at = column + part.start;
      if (colon < 0) {
        report('error', `Property '${text}' needs a value`, line, at, at + text.length);
        continue;
      }
      const key = text.slice(0, colon).trim();
      if (known && !known.has(key)) report('warning', `Unknown property '${key}'`, line, at, at + key.length);
      props[key] = unquote(text.slice(colon + 1).trim());
    }
    return props;
  };

  /** "Name [props]" → participant (created on first use, props merged). */
  const participant = (text: string, line: number, column: number): string | undefined => {
    const m = /^("[^"]*"|[^[]+?)\s*(?:\[(.*)\])?\s*$/.exec(text.trim());
    if (!m) return undefined;
    const name = unquote(m[1]!.trim());
    if (!name) return undefined;
    let p = participants.get(name);
    if (!p) {
      p = { name, label: name, properties: {}, range: { line, column, endColumn: column + name.length } };
      participants.set(name, p);
    }
    if (m[2] !== undefined) {
      Object.assign(p.properties, parseProps(m[2], line, column + text.indexOf('[') + 1, PARTICIPANT_PROPERTIES));
      if (p.properties.label) p.label = p.properties.label;
    }
    return name;
  };

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const text = stripComment(rawLine);
    const trimmed = text.trim();
    if (!trimmed) return;
    const column = text.length - text.trimStart().length + 1;
    const range = { line, column, endColumn: column + trimmed.length };

    if (inLegend) {
      if (trimmed === '}') {
        inLegend = false;
        return;
      }
      let pos = 0;
      while (pos < trimmed.length) {
        const start = trimmed.indexOf('[', pos);
        if (start < 0) break;
        const end = findClosingBracket(trimmed, start);
        if (end < 0) break;
        legend!.items.push({ properties: parseProps(trimmed.slice(start + 1, end), line, column + start + 1), range });
        pos = end + 1;
      }
      return;
    }

    if (trimmed === '}') {
      const open = stack.pop();
      if (!open) {
        report('error', "Unexpected '}'", line, column, column + 1);
        return;
      }
      events.push({ type: 'block-end', block: open.block, range });
      lastClosed = open;
      return;
    }

    const setting = /^(title|colorMode|styleMode|typeface|autoNumber)\s+(.+)$/.exec(trimmed);
    if (setting) {
      const key = setting[1]!;
      const value = setting[2]!.trim();
      if (key === 'title') settings.title = unquote(value);
      else if ((SETTINGS[key as keyof typeof SETTINGS] as readonly string[]).includes(value)) (settings as unknown as Record<string, string>)[key] = value;
      else report('warning', `Unknown ${key} '${value}'. Use ${SETTINGS[key as keyof typeof SETTINGS].join(', ')}`, line, column, column + trimmed.length);
      return;
    }

    const activation = /^(activate|deactivate)\s+(.+)$/.exec(trimmed);
    if (activation) {
      const name = participant(activation[2]!, line, column + activation[1]!.length + 1);
      if (name) events.push({ type: activation[1] as 'activate' | 'deactivate', participant: name, range });
      return;
    }

    const legendOpen = /^legend\s*(?:\[(.*)\])?\s*\{\s*$/.exec(trimmed);
    if (legendOpen) {
      legend = { properties: legendOpen[1] !== undefined ? parseProps(legendOpen[1], line, column) : {}, items: [], range };
      inLegend = true;
      return;
    }

    const block = /^(\w+)\s*(?:\[(.*)\])?\s*\{\s*$/.exec(trimmed);
    if (block && (BLOCK_KINDS.includes(block[1]!) || block[1] === 'else' || block[1] === 'and')) {
      const props = block[2] !== undefined ? parseProps(block[2], line, column + trimmed.indexOf('[') + 1, new Set(['label', 'icon', 'color'])) : {};
      if (block[1] === 'else' || block[1] === 'and') {
        const expected = block[1] === 'else' ? 'alt' : 'par';
        const last = events.at(-1);
        if (!lastClosed || lastClosed.kind !== expected || last?.type !== 'block-end' || last.block !== lastClosed.block) {
          report('error', `'${block[1]}' must directly follow a closed '${expected}' block`, line, column, column + block[1]!.length);
          return;
        }
        // Reopen the previous block as a new section.
        events.pop();
        events.push({ type: 'block-section', block: lastClosed.block, label: props.label, range });
        stack.push({ ...lastClosed, line });
        return;
      }
      const id = blocks++;
      events.push({ type: 'block-start', block: id, kind: block[1] as BlockKind, label: props.label, properties: props, range });
      stack.push({ block: id, kind: block[1] as BlockKind, line });
      return;
    }

    // Message: A [props] <connector> B [props] [: label] [props]
    const connector = findConnector(trimmed);
    if (connector) {
      const left = trimmed.slice(0, connector.index);
      let right = trimmed.slice(connector.index + connector.token.length);
      let label: string | undefined;
      let props: Properties = {};
      const colon = indexOutside(right, ':');
      if (colon >= 0) {
        let tail = right.slice(colon + 1).trim();
        right = right.slice(0, colon);
        const propsAt = tail.endsWith(']') ? tail.lastIndexOf('[') : -1;
        if (propsAt >= 0) {
          props = parseProps(tail.slice(propsAt + 1, -1), line, column, new Set(['color']));
          tail = tail.slice(0, propsAt).trim();
        }
        label = tail || undefined;
      }
      const from = participant(left, line, column);
      const to = participant(right, line, column + connector.index + connector.token.length);
      if (!from || !to) {
        report('error', 'A message needs a participant on both sides', line, column, column + trimmed.length);
        return;
      }
      events.push({ type: 'message', from, to, connector: connector.token as Connector, label, properties: props, range });
      return;
    }

    // Bare declaration: Name [props]
    if (!participant(trimmed, line, column)) report('error', "Expected a message ('A > B: text'), a block, or a participant", line, column, column + trimmed.length);
  });

  for (const open of stack) report('error', "Missing closing '}'", open.line, 1, 2);
  return { kind: 'sequence', settings, participants, events, legend, diagnostics };
}

/** First connector outside brackets and quotes; dashes only when surrounded by spaces. */
function findConnector(text: string): { index: number; token: string } | undefined {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (depth > 0 || ch === ':') {
      if (ch === ':' && depth === 0) return undefined;
      continue;
    }
    if (text.startsWith('<>', i)) return { index: i, token: '<>' };
    if (ch === '>' || ch === '<') return { index: i, token: ch };
    if (ch === '-' && /\s/.test(text[i - 1] ?? '')) {
      for (const token of ['-->', '--', '-']) if (text.startsWith(token, i) && /\s/.test(text[i + token.length] ?? '')) return { index: i, token };
    }
  }
  return undefined;
}

function indexOutside(text: string, ch: string): number {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    if (quoted) continue;
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    else if (depth === 0 && text[i] === ch) return i;
  }
  return -1;
}
