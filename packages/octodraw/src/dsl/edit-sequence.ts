import { parseSequenceWithSpans, SEQUENCE_KEYWORDS, type SeqMentionSpan, type SeqMessageSpan, type SeqStatementSpan, type SequenceDiagram, type SequenceSpans } from './sequence';
import {
  formatValue,
  indentOf,
  isPropertyKey,
  LineEdits,
  propsAfter,
  rawAt,
  refuse,
  sourceText,
  startOfSpace,
  unchanged,
  writeProps,
  type EditResult,
  type SourceText,
} from './edit-text';
import type { Connector } from './types';

// Pure rewrites of sequence diagram code for the element toolbar. Same rules as
// `edit.ts`: only the target's own lines change; when an edit isn't safe the
// source comes back unchanged with a one-line `reason`. Participants are
// columns in order of first appearance, so no edit may change that order.

/** Call (solid) or return (dashed) message. */
export type MessageLine = 'call' | 'return';
/** Which way a message points, relative to how it is written (`from` → `to`). */
export type MessageDirection = 'forward' | 'back' | 'both';

export type SequenceEdit =
  | { type: 'setParticipantProperty'; participant: string; key: string; value: string | null }
  | { type: 'renameParticipant'; participant: string; name: string }
  | { type: 'deleteParticipant'; participant: string }
  | { type: 'setMessageLabel'; message: string; label: string | null }
  | { type: 'setMessageProperty'; message: string; key: string; value: string | null }
  | { type: 'setMessageLine'; message: string; line: MessageLine }
  | { type: 'setMessageDirection'; message: string; direction: MessageDirection }
  | { type: 'deleteMessage'; message: string };

const MESSAGE_CONNECTORS: readonly Connector[] = ['>', '<', '<>', '-', '--', '-->'];

interface Doc extends SourceText {
  diagram: SequenceDiagram;
  spans: SequenceSpans;
}

function load(source: string): Doc {
  const { diagram, spans } = parseSequenceWithSpans(source);
  return { ...sourceText(source), diagram, spans };
}

const hasError = (doc: Doc, line: number) => doc.diagram.diagnostics.some((d) => d.severity === 'error' && d.line === line);
const mentionsOf = (doc: Doc, name: string) => doc.spans.statements.flatMap((s) => s.mentions.filter((m) => m.name === name));
/** The statement a participant is first written in. */
const firstStatement = (doc: Doc, name: string) => doc.spans.statements.find((s) => s.mentions.some((m) => m.name === name));

/** The line style of a connector: dashed ones are returns. */
export function messageLineOf(connector: Connector): MessageLine {
  return connector === '-->' || connector === '--' ? 'return' : 'call';
}

/** Which way a connector points; undefined for plain lines (`-`, `--`). */
export function messageDirectionOf(connector: Connector): MessageDirection | undefined {
  if (connector === '>' || connector === '-->') return 'forward';
  if (connector === '<') return 'back';
  if (connector === '<>') return 'both';
  return undefined;
}

/** How many messages a participant sends or receives (deleting it deletes them). */
export function participantMessageCount(diagram: SequenceDiagram, name: string): number {
  return diagram.events.filter((e) => e.type === 'message' && (e.from === name || e.to === name)).length;
}

/**
 * Sets (or with `null` removes) a participant property. An existing value is
 * changed where it is written; a new one goes on its declaration line, or a
 * declaration is added before its first use (after it, when that would change
 * the column order).
 */
export function setParticipantProperty(source: string, participant: string, key: string, value: string | null): EditResult {
  const doc = load(source);
  if (!doc.diagram.participants.has(participant)) return refuse(source, `There is no participant '${participant}' in the code`);
  if (!isPropertyKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
  const mentions = mentionsOf(doc, participant);
  const withKey = mentions.filter((m) => m.props?.entries.some((e) => e.key === key));
  const edits = new LineEdits(doc);
  const write = (m: SeqMentionSpan) => {
    const next = propsAfter(doc, m.line, m.props, key, formatted);
    if (next !== rawAt(doc, m.line, m.props)) writeProps(doc, edits, m.line, m.props, next, m.nameSpan.endColumn);
  };
  if (withKey.length) {
    for (const m of withKey) {
      if (hasError(doc, m.line)) return refuse(source, `Line ${m.line} has an error`);
      write(m);
    }
    return edits.result();
  }
  if (formatted === null) return unchanged(source);
  const target =
    mentions.find((m) => m.role === 'declare' && m.props) ?? mentions.find((m) => m.role === 'declare') ?? mentions.find((m) => m.props && m.role !== 'activate' && m.role !== 'deactivate');
  if (target) {
    if (hasError(doc, target.line)) return refuse(source, `Line ${target.line} has an error`);
    write(target);
    return edits.result();
  }
  const stmt = firstStatement(doc, participant)!;
  const first = stmt.mentions.find((m) => m.name === participant)!;
  const text = `${indentOf(doc, stmt.line)}${rawAt(doc, stmt.line, first.nameSpan)} [${key}: ${formatted}]`;
  if (introducedBefore(doc, stmt, first)) edits.insertAfter(stmt.line, text);
  else edits.insertBefore(stmt.line, text);
  return edits.result();
}

/** Why a participant can't be called `name` (undefined when it can), and whether it must be quoted. */
export function sequenceNameProblem(name: string): { reason?: string; quote: boolean } {
  if (!name) return { reason: 'A name cannot be blank', quote: false };
  if (name.includes('"') || /[\r\n]/.test(name)) return { reason: 'Names cannot contain double quotes or line breaks', quote: false };
  const first = name.split(/\s+/)[0]!;
  const quote =
    /[<>:[\]{}]|\/\//.test(name) ||
    /(^|\s)(-|--|-->)(\s|$)/.test(name) ||
    name.startsWith('-') ||
    ((SEQUENCE_KEYWORDS as readonly string[]).includes(first) && first !== name);
  return { quote };
}

/** Renames a participant everywhere: messages, activations and declarations. */
export function renameParticipant(source: string, participant: string, newName: string): EditResult {
  const doc = load(source);
  if (!doc.diagram.participants.has(participant)) return refuse(source, `There is no participant '${participant}' in the code`);
  const name = newName.trim();
  if (name === participant) return unchanged(source);
  const problem = sequenceNameProblem(name);
  if (problem.reason) return refuse(source, problem.reason);
  if (doc.diagram.participants.has(name)) return refuse(source, `'${name}' already exists`);
  const edits = new LineEdits(doc);
  for (const m of mentionsOf(doc, participant)) edits.splice(m.line, m.nameSpan.column, m.nameSpan.endColumn, m.nameSpan.quoted || problem.quote ? `"${name}"` : name);
  return edits.result();
}

/** Deletes a participant with its messages, activations and declarations. */
export function deleteParticipant(source: string, participant: string): EditResult {
  const doc = load(source);
  if (!doc.diagram.participants.has(participant)) return refuse(source, `There is no participant '${participant}' in the code`);
  const edits = new LineEdits(doc);
  for (const stmt of doc.spans.statements) {
    if (!stmt.mentions.some((m) => m.name === participant)) continue;
    if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
    edits.replaceLine(stmt.line, keepAlive(doc, stmt, participant));
  }
  return edits.result();
}

/** Sets (or with `null`/blank removes) a message's label. */
export function setMessageLabel(source: string, id: string, label: string | null): EditResult {
  const found = findMessage(source, id);
  if (!('doc' in found)) return found;
  const { doc, msg } = found;
  const text = label?.trim() || null;
  if (text !== null) {
    if (/[\r\n]/.test(text)) return refuse(source, 'Labels are one line');
    if (text.includes('//')) return refuse(source, "Labels cannot contain '//' (it starts a comment)");
    if (text.endsWith(']')) return refuse(source, "Labels cannot end with ']'");
  }
  const current = msg.label ? rawAt(doc, msg.line, msg.label) : null;
  if (current === text) return unchanged(source);
  const edits = new LineEdits(doc);
  const line = msg.line;
  if (text === null) {
    // With `[props]` the colon stays: without it they would belong to the participant.
    if (msg.props) edits.splice(line, msg.label!.column, msg.props.column, '');
    else edits.splice(line, startOfSpace(doc, line, msg.colon!.column), msg.label!.endColumn, '');
  } else if (msg.label) {
    edits.splice(line, msg.label.column, msg.label.endColumn, text);
  } else if (msg.colon) {
    if (msg.props) edits.splice(line, msg.props.column, msg.props.column, `${text} `);
    else edits.splice(line, msg.colon.endColumn, msg.colon.endColumn, ` ${text}`);
  } else {
    edits.splice(line, msg.to.range.endColumn, msg.to.range.endColumn, `: ${text}`);
  }
  return edits.result();
}

/** Sets (or with `null` removes) a message property (`color`). Without a label it is written `A > B: [color: red]`. */
export function setMessageProperty(source: string, id: string, key: string, value: string | null): EditResult {
  const found = findMessage(source, id);
  if (!('doc' in found)) return found;
  const { doc, msg } = found;
  if (!isPropertyKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
  const next = propsAfter(doc, msg.line, msg.props, key, formatted);
  if (next === rawAt(doc, msg.line, msg.props)) return unchanged(source);
  const edits = new LineEdits(doc);
  const line = msg.line;
  if (msg.props && !next && !msg.label) {
    // The last property goes, and the colon that only held it.
    edits.splice(line, startOfSpace(doc, line, msg.colon!.column), msg.props.endColumn, '');
  } else if (msg.props || msg.colon) {
    writeProps(doc, edits, line, msg.props, next, (msg.label ?? msg.colon!).endColumn);
  } else {
    edits.splice(line, msg.to.range.endColumn, msg.to.range.endColumn, `: ${next}`);
  }
  return edits.result();
}

/** Call (`>`) or return (`-->`): the arrow keeps pointing the same way. Two-way messages can't be returns. */
export function setMessageLine(source: string, id: string, line: MessageLine): EditResult {
  const found = findMessage(source, id);
  if (!('doc' in found)) return found;
  const { doc, msg } = found;
  const c = msg.connector.connector;
  if (messageLineOf(c) === line) return unchanged(source);
  if (line === 'call') return writeConnector(doc, msg, c === '-->' ? '>' : '-');
  if (c === '<>') return refuse(source, "A two-way message can't be a return (dashed lines point one way)");
  if (c === '<') return swapEnds(doc, msg, '-->');
  return writeConnector(doc, msg, c === '>' ? '-->' : '--');
}

/** Points a message forward (`from` → `to`), back, or both ways; a return pointing back swaps its ends. */
export function setMessageDirection(source: string, id: string, direction: MessageDirection): EditResult {
  const found = findMessage(source, id);
  if (!('doc' in found)) return found;
  const { doc, msg } = found;
  const c = msg.connector.connector;
  if (messageDirectionOf(c) === direction) return unchanged(source);
  const dashed = messageLineOf(c) === 'return';
  if (direction === 'both') {
    if (dashed) return refuse(source, "A return can't point both ways; make it a call first");
    return writeConnector(doc, msg, '<>');
  }
  if (direction === 'forward') return writeConnector(doc, msg, dashed ? '-->' : '>');
  // Back: `<` for calls; dashed lines have no `<--`, so the ends swap.
  return dashed ? swapEnds(doc, msg, '-->') : writeConnector(doc, msg, '<');
}

/** Deletes a message; a participant first written there (or styled there) keeps a declaration line, so columns don't move. */
export function deleteMessage(source: string, id: string): EditResult {
  const found = findMessage(source, id);
  if (!('doc' in found)) return found;
  const { doc, msg } = found;
  const edits = new LineEdits(doc);
  edits.replaceLine(msg.line, keepAlive(doc, doc.spans.statements[msg.statement]!, null));
  return edits.result();
}

/**
 * Applies edits in order, re-reading the code between them, as one change. If any
 * edit is refused nothing is applied. Deleting a message renumbers the ones after it.
 */
export function applySequenceEdits(source: string, edits: readonly SequenceEdit[]): EditResult {
  let current = source;
  for (const edit of edits) {
    const result = applySequenceEdit(current, edit);
    if (result.reason) return { source, changed: false, reason: result.reason };
    current = result.source;
  }
  return { source: current, changed: current !== source };
}

function applySequenceEdit(source: string, edit: SequenceEdit): EditResult {
  switch (edit.type) {
    case 'setParticipantProperty':
      return setParticipantProperty(source, edit.participant, edit.key, edit.value);
    case 'renameParticipant':
      return renameParticipant(source, edit.participant, edit.name);
    case 'deleteParticipant':
      return deleteParticipant(source, edit.participant);
    case 'setMessageLabel':
      return setMessageLabel(source, edit.message, edit.label);
    case 'setMessageProperty':
      return setMessageProperty(source, edit.message, edit.key, edit.value);
    case 'setMessageLine':
      return setMessageLine(source, edit.message, edit.line);
    case 'setMessageDirection':
      return setMessageDirection(source, edit.message, edit.direction);
    case 'deleteMessage':
      return deleteMessage(source, edit.message);
  }
}

// ---------------------------------------------------------------------------

function findMessage(source: string, id: string): { doc: Doc; msg: SeqMessageSpan } | EditResult {
  const doc = load(source);
  const msg = doc.spans.messages.find((m) => m.id === id);
  if (!msg) return refuse(source, `There is no message '${id}' in the code`);
  if (hasError(doc, msg.line)) return refuse(source, `Line ${msg.line} has an error`);
  return { doc, msg };
}

function writeConnector(doc: Doc, msg: SeqMessageSpan, connector: Connector): EditResult {
  if (!MESSAGE_CONNECTORS.includes(connector)) return refuse(doc.source, `'${connector}' isn't a connector`);
  const edits = new LineEdits(doc);
  // Always spaced: `-`, `--` and `-->` are only connectors between whitespace.
  edits.splice(msg.line, msg.from.range.endColumn, msg.to.range.column, ` ${connector} `);
  return edits.result();
}

/** `A > B` → `B <connector> A`; when both are new on this line, `A` is declared first so the columns keep their order. */
function swapEnds(doc: Doc, msg: SeqMessageSpan, connector: Connector): EditResult {
  const edits = new LineEdits(doc);
  const line = msg.line;
  const from = rawAt(doc, line, msg.from.range);
  const to = rawAt(doc, line, msg.to.range);
  edits.splice(line, msg.from.range.column, msg.to.range.endColumn, `${to} ${connector} ${from}`);
  const stmt = doc.spans.statements[msg.statement]!;
  if (msg.from.name !== msg.to.name && firstStatement(doc, msg.from.name) === stmt && firstStatement(doc, msg.to.name) === stmt) {
    edits.insertBefore(line, `${indentOf(doc, line)}${rawAt(doc, line, msg.from.nameSpan)}`);
  }
  return edits.result();
}

/** Whether a participant first written in `stmt` before `mention` would swap columns with it if `mention` were declared above. */
function introducedBefore(doc: Doc, stmt: SeqStatementSpan, mention: SeqMentionSpan): boolean {
  return stmt.mentions.some((m) => m.name !== mention.name && m.range.column < mention.range.column && firstStatement(doc, m.name) === stmt);
}

/**
 * Declarations to write in place of a statement that is going away, for the
 * participants first written there or styled there (except `deleted`).
 */
function keepAlive(doc: Doc, stmt: SeqStatementSpan, deleted: string | null): string[] {
  const out: string[] = [];
  const written = new Set<string>();
  for (const m of stmt.mentions) {
    if (m.name === deleted) continue;
    const first = firstStatement(doc, m.name) === stmt && !written.has(m.name);
    if (!first && !m.props) continue;
    written.add(m.name);
    out.push(rawAt(doc, stmt.line, m.range));
  }
  return out;
}
