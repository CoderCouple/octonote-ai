import { parseDiagramWithSpans, stripComment } from './parse';
import type { ColumnSpan, Connector, Diagram, DiagramSpans, EdgeSpan, NameSpan, PropertiesSpan, StatementSpan } from './types';

// Pure rewrites of diagram code, used by the element toolbar: each one changes
// only the target's own line(s) and keeps indentation, comments, blank lines and
// property order. When an edit isn't safe the source comes back unchanged with a
// one-line `reason`.

export interface EditResult {
  source: string;
  changed: boolean;
  /** Why nothing changed, when the edit was refused. */
  reason?: string;
}

export type DiagramEdit =
  | { type: 'setNodeProperty'; nodeId: string; key: string; value: string | null }
  | { type: 'renameNode'; nodeId: string; name: string }
  | { type: 'declareNode'; nodeId: string; properties?: Record<string, string> }
  | { type: 'deleteNode'; nodeId: string; keepContents?: boolean }
  | { type: 'setEdgeProperty'; edgeId: string; key: string; value: string | null }
  | { type: 'setEdgeLabel'; edgeId: string; label: string | null }
  | { type: 'setEdgeConnector'; edgeId: string; connector: Connector }
  | { type: 'reverseEdge'; edgeId: string }
  | { type: 'deleteEdge'; edgeId: string };

export const CONNECTORS: readonly Connector[] = ['>', '<', '<>', '-', '--', '-->'];

/** Sets (or with `null` removes) one property on a node or group's declaration. Undeclared nodes get a declaration. */
export function setNodeProperty(source: string, nodeId: string, key: string, value: string | null): EditResult {
  const doc = load(source);
  const node = doc.diagram.nodes.get(nodeId);
  if (!node) return refuse(source, `There is no '${nodeId}' in the code`);
  if (!isKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const decls = doc.spans.nodes.filter((d) => d.id === nodeId);
  if (decls.length === 0) {
    if (value === null) return unchanged(source);
    return declareNode(source, nodeId, { [key]: value });
  }
  if (decls.length > 1) return refuse(source, `'${nodeId}' is defined in ${decls.length} places`);
  const decl = decls[0]!;
  const stmt = doc.spans.statements[decl.statement]!;
  if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');

  const edits = new LineEdits(doc);
  const props = editProps(doc, stmt, key, formatted);
  if (props === rawOf(doc, stmt, stmt.props)) return unchanged(source);
  if (stmt.lists[0]!.length === 1) {
    applyProps(doc, edits, stmt, props);
  } else {
    // `A, B [props]` declares both with one bracket: give the target its own line.
    const raw = (n: NameSpan) => rawOf(doc, stmt, n);
    const original = rawOf(doc, stmt, stmt.props);
    const lines = stmt.lists[0]!.map((n, i) => {
      const p = i === decl.listIndex ? props : original;
      return p ? `${raw(n)} ${p}` : raw(n);
    });
    edits.replaceStatement(stmt, lines);
  }
  return edits.result();
}

/** Gives an implicit node (one only used in connections) a declaration line, next to where it is first used. */
export function declareNode(source: string, nodeId: string, properties: Record<string, string> = {}): EditResult {
  const doc = load(source);
  const node = doc.diagram.nodes.get(nodeId);
  if (!node) return refuse(source, `There is no '${nodeId}' in the code`);
  if (!node.implicit) return refuse(source, `'${nodeId}' is already declared`);
  const stmt = doc.spans.statements.find(
    (s) => s.kind === 'connection' && s.line === node.range.line && s.range.column <= node.range.column && node.range.column < s.range.endColumn,
  );
  const name = stmt?.lists.flat().find((n) => n.name === nodeId && n.column === node.range.column);
  if (!stmt || !name) return refuse(source, `Couldn't find where '${nodeId}' is used`);
  if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
  const entries: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!isKey(key)) return refuse(source, `'${key}' isn't a property name`);
    const formatted = formatValue(value);
    if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
    entries.push(`${key}: ${formatted}`);
  }
  const text = rawOf(doc, stmt, name) + (entries.length ? ` [${entries.join(', ')}]` : '');
  const edits = new LineEdits(doc);
  const indent = statementIndent(doc, stmt);
  const after = stripComment(lineOf(doc, stmt.line)).slice(stmt.range.endColumn - 1);
  // `G { A > B }`: the declaration must stay inside the braces, so it goes before the rest of the line.
  if (after.trim()) edits.splice(stmt.line, stmt.range.endColumn, stmt.range.endColumn, `\n${indent}${text}`);
  else edits.insertAfter(stmt.line, indent + text);
  return edits.result();
}

/** Renames a node or group everywhere: declarations, connections, flow steps and `attached:` values. */
export function renameNode(source: string, nodeId: string, newName: string): EditResult {
  const doc = load(source);
  if (!doc.diagram.nodes.has(nodeId)) return refuse(source, `There is no '${nodeId}' in the code`);
  const name = newName.trim();
  if (!name) return refuse(source, 'A name cannot be blank');
  if (name.includes('"') || /[\r\n]/.test(name)) return refuse(source, 'Names cannot contain double quotes or line breaks');
  if (name === nodeId) return unchanged(source);
  if (doc.diagram.nodes.has(name)) return refuse(source, `'${name}' already exists`);
  if (name === 'legend') return refuse(source, "'legend' is reserved");
  const quoted = `"${name}"`;
  const plain = needsQuotes(name) ? quoted : name;
  const edits = new LineEdits(doc);
  for (const stmt of doc.spans.statements) {
    for (const ref of stmt.lists.flat()) {
      if (ref.name === nodeId) edits.splice(stmt.line, ref.column, ref.endColumn, ref.quoted ? quoted : plain);
    }
    for (const entry of stmt.props?.entries ?? []) {
      if (entry.key === 'attached' && entry.value === nodeId) edits.splice(stmt.line, entry.valueRange.column, entry.valueRange.endColumn, formatValue(name)!);
    }
  }
  return edits.result();
}

/**
 * Deletes a node with every connection and flow step that touches it. A group is
 * deleted with its contents, or with `keepContents` only its braces go and the
 * contents move out one level.
 */
export function deleteNode(source: string, nodeId: string, options: { keepContents?: boolean } = {}): EditResult {
  const doc = load(source);
  const node = doc.diagram.nodes.get(nodeId);
  if (!node) return refuse(source, `There is no '${nodeId}' in the code`);
  const keep = options.keepContents === true && node.kind === 'group';
  const deleted = new Set<string>([nodeId]);
  if (!keep) {
    const walk = (id: string) => {
      for (const child of doc.diagram.nodes.get(id)?.children ?? []) {
        deleted.add(child);
        walk(child);
      }
    };
    walk(nodeId);
  }

  const edits = new LineEdits(doc);
  const regions: { line: number; column: number; endLine: number; endColumn: number }[] = [];
  const inRegion = (line: number, column: number) =>
    regions.some((r) => (line > r.line || (line === r.line && column >= r.column)) && (line < r.endLine || (line === r.endLine && column < r.endColumn)));

  // Group blocks first: everything inside a deleted block goes with it.
  for (const group of doc.spans.groups) {
    if (!deleted.has(group.id)) continue;
    const stmt = doc.spans.statements[group.statement]!;
    if (inRegion(stmt.line, stmt.range.column)) continue;
    if (!group.close) return refuse(source, `'${group.id}' is missing its closing '}'`);
    if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
    const close = group.close;
    if (keep && group.id === nodeId) {
      const openLine = lineOf(doc, stmt.line);
      let afterBrace = group.open.endColumn;
      while (afterBrace <= openLine.length && /\s/.test(openLine[afterBrace - 1] ?? '')) afterBrace++;
      edits.splice(stmt.line, stmt.range.column, afterBrace, '');
      const closeLine = lineOf(doc, close.line);
      let beforeClose = close.column;
      while (beforeClose > 1 && /\s/.test(closeLine[beforeClose - 2] ?? '') && !(close.line === stmt.line && beforeClose <= afterBrace)) beforeClose--;
      edits.splice(close.line, beforeClose, close.endColumn, '');
      const unit = indentUnit(doc);
      for (let line = stmt.line + 1; line < close.line; line++) {
        const text = lineOf(doc, line);
        if (text.trim() && text.startsWith(unit)) edits.splice(line, 1, 1 + unit.length, '', false);
      }
      continue;
    }
    regions.push({ line: stmt.line, column: stmt.range.column, endLine: close.line, endColumn: close.endColumn });
    if (close.line === stmt.line) {
      edits.splice(stmt.line, stmt.range.column, close.endColumn, '');
    } else {
      edits.splice(stmt.line, stmt.range.column, lineOf(doc, stmt.line).length + 1, '');
      for (let line = stmt.line + 1; line < close.line; line++) edits.removeLine(line);
      edits.splice(close.line, 1, close.endColumn, '');
    }
  }

  for (const stmt of doc.spans.statements) {
    if (inRegion(stmt.line, stmt.range.column)) continue;
    if (!stmt.lists.some((list) => list.some((n) => deleted.has(n.name)))) continue;
    if (stmt.kind === 'declaration' && stmt.brace) continue; // a kept group's own opening line, handled above
    if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
    const lists = stmt.lists.map((list) => list.filter((n) => !deleted.has(n.name)));
    const pieces: Piece[] = [];
    if (stmt.kind === 'declaration') {
      if (lists[0]!.length) pieces.push(piece(doc, stmt, lists, []));
    } else {
      const connectors = stmt.connectors.map((c) => c.connector as string);
      let run: NameSpan[][] = [];
      let runConnectors: string[] = [];
      const flush = () => {
        if (run.length >= 2) pieces.push(piece(doc, stmt, run, runConnectors));
        run = [];
        runConnectors = [];
      };
      lists.forEach((list, k) => {
        if (!list.length) return flush();
        if (run.length) runConnectors.push(connectors[k - 1]!);
        run.push(list);
      });
      flush();
    }
    edits.replaceStatement(stmt, keepAlive(doc, stmt, pieces, deleted, (s) => inRegion(s.line, s.range.column)).concat(pieces.map((p) => formatPiece(doc, stmt, p))));
  }
  return edits.result();
}

/** Sets (or with `null` removes) one property on a connection; a chain or multi-target line is split first. */
export function setEdgeProperty(source: string, edgeId: string, key: string, value: string | null): EditResult {
  const found = findEdge(source, edgeId);
  if (!('doc' in found)) return found;
  const { doc, edge, stmt } = found;
  if (!isKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
  const props = editProps(doc, stmt, key, formatted);
  if (props === rawOf(doc, stmt, stmt.props)) return unchanged(source);
  if (stmt.edges.length > 1) return splitEdgeOut(doc, stmt, edge, (p) => ({ ...p, props: props || undefined }));
  const edits = new LineEdits(doc);
  applyProps(doc, edits, stmt, props);
  return edits.result();
}

/** Sets (or with `null`/blank removes) a connection's label. */
export function setEdgeLabel(source: string, edgeId: string, label: string | null): EditResult {
  const found = findEdge(source, edgeId);
  if (!('doc' in found)) return found;
  const { doc, edge, stmt } = found;
  const text = label?.trim() || null;
  if (text !== null) {
    if (/[\r\n]/.test(text)) return refuse(source, 'Labels are one line');
    if (text.includes('//')) return refuse(source, "Labels cannot contain '//' (it starts a comment)");
    if (text.endsWith(']')) return refuse(source, "Labels cannot end with ']'");
    if (stmt.followedAt !== undefined) return refuse(source, `The label would swallow the rest of line ${stmt.line}; put the connection on its own line`);
  }
  const current = stmt.label ? rawOf(doc, stmt, stmt.label) : null;
  if (current === text) return unchanged(source);
  if (stmt.edges.length > 1) return splitEdgeOut(doc, stmt, edge, (p) => ({ ...p, label: text ?? undefined }));
  const edits = new LineEdits(doc);
  if (text === null) {
    const line = lineOf(doc, stmt.line);
    let start = stmt.colon!.column;
    while (start > 1 && /\s/.test(line[start - 2] ?? '')) start--;
    edits.splice(stmt.line, start, (stmt.label ?? stmt.colon!).endColumn, '');
  } else if (stmt.label) {
    edits.splice(stmt.line, stmt.label.column, stmt.label.endColumn, text);
  } else if (stmt.colon) {
    edits.splice(stmt.line, stmt.colon.endColumn, stmt.colon.endColumn, ` ${text}`);
  } else {
    edits.splice(stmt.line, edge.to.endColumn, edge.to.endColumn, `: ${text}`);
  }
  return edits.result();
}

/** Changes a connection's connector (`>` solid arrow, `-->` dashed arrow, …). Only the parser's connectors are accepted. */
export function setEdgeConnector(source: string, edgeId: string, connector: Connector): EditResult {
  if (!CONNECTORS.includes(connector)) return refuse(source, `'${connector}' isn't a connector. Use ${CONNECTORS.join(' ')}`);
  const found = findEdge(source, edgeId);
  if (!('doc' in found)) return found;
  const { doc, edge, stmt } = found;
  if (edge.connector.connector === connector) return unchanged(source);
  if (stmt.edges.length > 1) return splitEdgeOut(doc, stmt, edge, (p) => ({ ...p, connectors: [connector] }));
  const edits = new LineEdits(doc);
  // Always spaced: `-`, `--` and `-->` are only connectors between whitespace.
  edits.splice(stmt.line, edge.from.endColumn, edge.to.column, ` ${connector} `);
  return edits.result();
}

/** Swaps a connection's ends (`Web > API: calls` → `API > Web: calls`), keeping connector, label and properties. */
export function reverseEdge(source: string, edgeId: string): EditResult {
  const found = findEdge(source, edgeId);
  if (!('doc' in found)) return found;
  const { doc, edge, stmt } = found;
  if (edge.from.name === edge.to.name) return unchanged(source);
  if (stmt.edges.length > 1) return splitEdgeOut(doc, stmt, edge, (p) => ({ ...p, lists: [p.lists[1]!, p.lists[0]!] }));
  const edits = new LineEdits(doc);
  edits.splice(stmt.line, edge.from.column, edge.from.endColumn, rawOf(doc, stmt, edge.to));
  edits.splice(stmt.line, edge.to.column, edge.to.endColumn, rawOf(doc, stmt, edge.from));
  return edits.result();
}

/** Deletes one connection; the boxes it joined stay (an undeclared one gets a declaration). */
export function deleteEdge(source: string, edgeId: string): EditResult {
  const found = findEdge(source, edgeId);
  if (!('doc' in found)) return found;
  const { doc, edge, stmt } = found;
  const { before, after } = around(doc, stmt, edge);
  const pieces = mergePieces([...before, ...after]);
  const edits = new LineEdits(doc);
  edits.replaceStatement(stmt, keepAlive(doc, stmt, pieces, new Set(), () => false).concat(pieces.map((p) => formatPiece(doc, stmt, p))));
  return edits.result();
}

/**
 * Applies edits in order, re-reading the code between them, as one change. If any
 * edit is refused nothing is applied. Note that deleting a connection renumbers
 * the ones after it (`e3` becomes `e2`), and renames change node ids.
 */
export function applyEdits(source: string, edits: readonly DiagramEdit[]): EditResult {
  let current = source;
  for (const edit of edits) {
    const result = applyEdit(current, edit);
    if (result.reason) return { source, changed: false, reason: result.reason };
    current = result.source;
  }
  return { source: current, changed: current !== source };
}

function applyEdit(source: string, edit: DiagramEdit): EditResult {
  switch (edit.type) {
    case 'setNodeProperty':
      return setNodeProperty(source, edit.nodeId, edit.key, edit.value);
    case 'renameNode':
      return renameNode(source, edit.nodeId, edit.name);
    case 'declareNode':
      return declareNode(source, edit.nodeId, edit.properties);
    case 'deleteNode':
      return deleteNode(source, edit.nodeId, { keepContents: edit.keepContents });
    case 'setEdgeProperty':
      return setEdgeProperty(source, edit.edgeId, edit.key, edit.value);
    case 'setEdgeLabel':
      return setEdgeLabel(source, edit.edgeId, edit.label);
    case 'setEdgeConnector':
      return setEdgeConnector(source, edit.edgeId, edit.connector);
    case 'reverseEdge':
      return reverseEdge(source, edit.edgeId);
    case 'deleteEdge':
      return deleteEdge(source, edit.edgeId);
  }
}

// ---------------------------------------------------------------------------

interface Doc {
  source: string;
  lines: string[];
  eol: string;
  diagram: Diagram;
  spans: DiagramSpans;
}

function load(source: string): Doc {
  const { diagram, spans } = parseDiagramWithSpans(source);
  return { source, lines: source.split(/\r?\n/), eol: source.includes('\r\n') ? '\r\n' : '\n', diagram, spans };
}

function refuse(source: string, reason: string): EditResult {
  return { source, changed: false, reason };
}

function unchanged(source: string): EditResult {
  return { source, changed: false };
}

function hasError(doc: Doc, line: number): boolean {
  return doc.diagram.diagnostics.some((d) => d.severity === 'error' && d.line === line);
}

function lineOf(doc: Doc, line: number): string {
  return doc.lines[line - 1] ?? '';
}

function rawOf(doc: Doc, stmt: StatementSpan, span: ColumnSpan | undefined): string {
  return span ? lineOf(doc, stmt.line).slice(span.column - 1, span.endColumn - 1) : '';
}

function findEdge(source: string, edgeId: string): { doc: Doc; edge: EdgeSpan; stmt: StatementSpan } | EditResult {
  const doc = load(source);
  const edge = doc.spans.edges.find((e) => e.id === edgeId);
  if (!edge) return refuse(source, `There is no connection '${edgeId}' in the code`);
  const stmt = doc.spans.statements[edge.statement]!;
  if (hasError(doc, stmt.line)) return refuse(source, `Line ${stmt.line} has an error`);
  return { doc, edge, stmt };
}

const isKey = (key: string) => /^[A-Za-z][\w-]*$/.test(key);

/** Writes a property value, quoting it when the parser would otherwise split or cut it. */
function formatValue(value: string): string | undefined {
  const text = value.replace(/\r?\n/g, '\\n');
  if (text.includes('"')) return undefined;
  return text === '' || /[,[\]:]|\/\//.test(text) || text !== text.trim() ? `"${text}"` : text;
}

/** Names that would read as a connector, delimiter, comment or setting need quotes. */
function needsQuotes(name: string): boolean {
  return (
    /[,{}:[\]<>]|\/\//.test(name) ||
    /(^|\s)(-|--|-->)(\s|$)/.test(name) ||
    name !== name.trim() ||
    /^(direction|colorMode|styleMode|typeface|wrap|title|flow)(\s|$)/.test(name)
  );
}

/** The statement's `[props]` text after setting `key` (formatted value) or removing it (`null`); '' when empty. */
function editProps(doc: Doc, stmt: StatementSpan, key: string, value: string | null): string {
  const props: PropertiesSpan | undefined = stmt.props;
  if (!props) return value === null ? '' : `[${key}: ${value}]`;
  let raw = rawOf(doc, stmt, props);
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

/** Replaces a single-name statement's `[props]` with `props` ('' removes the brackets). */
function applyProps(doc: Doc, edits: LineEdits, stmt: StatementSpan, props: string): void {
  if (stmt.props) {
    if (props) {
      edits.splice(stmt.line, stmt.props.column, stmt.props.endColumn, props);
    } else {
      const line = lineOf(doc, stmt.line);
      let start = stmt.props.column;
      while (start > 1 && /\s/.test(line[start - 2] ?? '')) start--;
      edits.splice(stmt.line, start, stmt.props.endColumn, '');
    }
  } else if (props) {
    edits.splice(stmt.line, stmt.range.endColumn, stmt.range.endColumn, ` ${props}`);
  }
}

/** One statement to write: names (spans of the original statement), connectors, label and props as written. */
interface Piece {
  lists: NameSpan[][];
  connectors: string[];
  label?: string;
  props?: string;
}

function piece(doc: Doc, stmt: StatementSpan, lists: NameSpan[][], connectors: string[]): Piece {
  return {
    lists,
    connectors,
    label: stmt.label ? rawOf(doc, stmt, stmt.label) : undefined,
    props: stmt.props ? rawOf(doc, stmt, stmt.props) : undefined,
  };
}

function formatPiece(doc: Doc, stmt: StatementSpan, p: Piece): string {
  let text = p.lists.map((list) => list.map((n) => rawOf(doc, stmt, n)).join(', ')).reduce((acc, list, k) => `${acc} ${p.connectors[k - 1]} ${list}`);
  if (p.label !== undefined) text += `: ${p.label}`;
  if (p.props) text += ` ${p.props}`;
  return text;
}

/**
 * The statement's edges before and after `edge`, as statements that keep the
 * original edge order (so edge ids don't change when the line is split).
 */
function around(doc: Doc, stmt: StatementSpan, edge: EdgeSpan): { before: Piece[]; target: Piece; after: Piece[] } {
  const c = edge.segment;
  const lists = stmt.lists;
  const connectors = stmt.connectors.map((k) => k.connector as string);
  const conn = connectors[c]!;
  const froms = lists[c]!;
  const tos = lists[c + 1]!;
  const from = froms[edge.fromIndex]!;
  const make = (ls: NameSpan[][], cs: string[]) => piece(doc, stmt, ls, cs);
  const before: Piece[] = [];
  const after: Piece[] = [];
  if (c > 0) before.push(make(lists.slice(0, c + 1), connectors.slice(0, c)));
  if (edge.fromIndex > 0) before.push(make([froms.slice(0, edge.fromIndex), tos], [conn]));
  if (edge.toIndex > 0) before.push(make([[from], tos.slice(0, edge.toIndex)], [conn]));
  if (edge.toIndex < tos.length - 1) after.push(make([[from], tos.slice(edge.toIndex + 1)], [conn]));
  if (edge.fromIndex < froms.length - 1) after.push(make([froms.slice(edge.fromIndex + 1), tos], [conn]));
  if (c + 1 < lists.length - 1) after.push(make(lists.slice(c + 1), connectors.slice(c + 1)));
  return { before, target: make([[from], [tos[edge.toIndex]!]], [conn]), after };
}

/** Joins neighbouring one-segment pieces that share a side (`A > B` + `A > C` → `A > B, C`). */
function mergePieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  const same = (a: NameSpan[], b: NameSpan[]) => a.length === b.length && a.every((n, i) => n.name === b[i]!.name);
  for (const p of pieces) {
    const prev = out.at(-1);
    if (prev && prev.lists.length === 2 && p.lists.length === 2 && prev.connectors[0] === p.connectors[0]) {
      if (same(prev.lists[0]!, p.lists[0]!)) {
        prev.lists = [prev.lists[0]!, [...prev.lists[1]!, ...p.lists[1]!]];
        continue;
      }
      if (same(prev.lists[1]!, p.lists[1]!)) {
        prev.lists = [[...prev.lists[0]!, ...p.lists[0]!], prev.lists[1]!];
        continue;
      }
    }
    out.push({ ...p });
  }
  return out;
}

/** Rewrites a chain / multi-target statement so `edge` gets its own line, changed by `change`. */
function splitEdgeOut(doc: Doc, stmt: StatementSpan, edge: EdgeSpan, change: (p: Piece) => Piece): EditResult {
  const { before, target, after } = around(doc, stmt, edge);
  const edits = new LineEdits(doc);
  edits.replaceStatement(stmt, [...before, change(target), ...after].map((p) => formatPiece(doc, stmt, p)));
  return edits.result();
}

/**
 * Declarations for undeclared names that a rewritten connection no longer
 * mentions but which were first used there, so they don't vanish or move group.
 */
function keepAlive(doc: Doc, stmt: StatementSpan, pieces: Piece[], deleted: Set<string>, removed: (s: StatementSpan) => boolean): string[] {
  if (stmt.kind !== 'connection') return [];
  const still = new Set(pieces.flatMap((p) => p.lists.flat().map((n) => n.name)));
  const names: NameSpan[] = [];
  for (const ref of stmt.lists.flat()) {
    if (still.has(ref.name) || deleted.has(ref.name) || names.some((n) => n.name === ref.name)) continue;
    const node = doc.diagram.nodes.get(ref.name);
    if (!node?.implicit || node.range.line !== stmt.line || node.range.column !== ref.column) continue;
    // Not needed when a later connection in the same group still uses the name.
    const next = doc.spans.edges.find(
      (e) => e.statement !== stmt.index && !removed(doc.spans.statements[e.statement]!) && (e.from.name === ref.name || e.to.name === ref.name) && !(deleted.has(e.from.name) || deleted.has(e.to.name)),
    );
    if (next && next.group === stmt.group) continue;
    names.push(ref);
  }
  return names.length ? [names.map((n) => rawOf(doc, stmt, n)).join(', ')] : [];
}

/** Leading whitespace for a new line written for `stmt` (one level deeper when it follows a `{`). */
function statementIndent(doc: Doc, stmt: StatementSpan): string {
  const line = lineOf(doc, stmt.line);
  const lead = /^\s*/.exec(line)![0];
  const before = line.slice(0, stmt.range.column - 1).trim();
  return before.endsWith('{') ? lead + indentUnit(doc) : lead;
}

function indentUnit(doc: Doc): string {
  let unit: string | undefined;
  for (const line of doc.lines) {
    if (!line.trim()) continue;
    const lead = /^\s*/.exec(line)![0];
    if (lead && (!unit || lead.length < unit.length)) unit = lead;
  }
  return unit ?? '  ';
}

/** Column splices on original lines, applied together; lines an edit leaves blank are removed. */
class LineEdits {
  private readonly splices = new Map<number, { start: number; end: number; text: string; prune: boolean }[]>();
  private readonly removed = new Set<number>();
  private readonly inserted = new Map<number, string[]>();

  constructor(private readonly doc: Doc) {}

  /** Replaces 1-based columns `column`–`endColumn` (exclusive) of `line`; with `prune` the line goes if that leaves it blank. */
  splice(line: number, column: number, endColumn: number, text: string, prune = true): void {
    const list = this.splices.get(line) ?? [];
    list.push({ start: column - 1, end: endColumn - 1, text, prune });
    this.splices.set(line, list);
  }

  removeLine(line: number): void {
    this.removed.add(line);
  }

  insertAfter(line: number, text: string): void {
    const list = this.inserted.get(line) ?? [];
    list.push(text);
    this.inserted.set(line, list);
  }

  /** Replaces a statement with `lines` (more than one go on new lines at its indentation); none removes it. */
  replaceStatement(stmt: StatementSpan, lines: string[]): void {
    if (lines.length) {
      this.splice(stmt.line, stmt.range.column, stmt.range.endColumn, lines.join(`\n${statementIndent(this.doc, stmt)}`));
      return;
    }
    const text = lineOf(this.doc, stmt.line);
    let end = stmt.range.endColumn;
    while (end <= text.length && /\s/.test(text[end - 1] ?? '')) end++;
    this.splice(stmt.line, stmt.range.column, end, '');
  }

  result(): EditResult {
    const out: string[] = [];
    let overlap: number | undefined;
    this.doc.lines.forEach((original, index) => {
      const line = index + 1;
      if (!this.removed.has(line)) {
        const splices = (this.splices.get(line) ?? []).sort((a, b) => b.start - a.start);
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
      out.push(...(this.inserted.get(line) ?? []));
    });
    if (overlap !== undefined) return refuse(this.doc.source, `Couldn't rewrite line ${overlap} safely`);
    const source = out.join(this.doc.eol);
    return { source, changed: source !== this.doc.source };
  }
}
