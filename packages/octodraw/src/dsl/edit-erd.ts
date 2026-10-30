import { ERD_KEYWORDS, parseErdWithSpans, type ErdConnector, type ErdDiagram, type ErdEndSpan, type ErdRelationshipSpan, type ErdSpans } from './erd';
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

// Pure rewrites of ERD code for the element toolbar. Same rules as `edit.ts`:
// only the target's own lines change; when an edit isn't safe the source comes
// back unchanged with a one-line `reason`.

export type ErdEdit =
  | { type: 'setEntityProperty'; entity: string; key: string; value: string | null }
  | { type: 'renameEntity'; entity: string; name: string }
  | { type: 'deleteEntity'; entity: string }
  | { type: 'setRelationshipConnector'; relationship: string; connector: ErdConnector }
  | { type: 'setRelationshipProperty'; relationship: string; key: string; value: string | null }
  | { type: 'setRelationshipLabel'; relationship: string; label: string | null }
  | { type: 'deleteRelationship'; relationship: string }
  | { type: 'renameColumn'; entity: string; column: string; name: string }
  | { type: 'setColumnType'; entity: string; column: string; columnType: string }
  | { type: 'setColumnKey'; entity: string; column: string; key: string; on: boolean }
  | { type: 'addColumn'; entity: string; name: string; columnType: string; after?: string }
  | { type: 'deleteColumn'; entity: string; column: string };

/** `<` one-to-many, `>` many-to-one, `-` one-to-one, `<>` many-to-many. */
export const ERD_CONNECTORS: readonly ErdConnector[] = ['<', '>', '-', '<>'];

interface Doc extends SourceText {
  diagram: ErdDiagram;
  spans: ErdSpans;
}

function load(source: string): Doc {
  const { diagram, spans } = parseErdWithSpans(source);
  return { ...sourceText(source), diagram, spans };
}

const hasError = (doc: Doc, line: number) => doc.diagram.diagnostics.some((d) => d.severity === 'error' && d.line === line);

/** Sets (or with `null` removes) a property on a table's declaration; a table only used in relationships gets a declaration line. */
export function setEntityProperty(source: string, entity: string, key: string, value: string | null): EditResult {
  const doc = load(source);
  if (!doc.diagram.entities.has(entity)) return refuse(source, `There is no table '${entity}' in the code`);
  if (!isPropertyKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
  const decls = doc.spans.entities.filter((d) => d.entity === entity);
  if (decls.length > 1) return refuse(source, `'${entity}' is defined in ${decls.length} places`);
  const edits = new LineEdits(doc);
  if (decls.length === 0) {
    if (formatted === null) return unchanged(source);
    // Declare it next to where it is first used: before, unless the table written first on that line is new there too.
    const rel = doc.spans.relationships.find((r) => r.from.entity.name === entity || r.to.entity.name === entity);
    if (!rel) return refuse(source, `Couldn't find where '${entity}' is used`);
    if (hasError(doc, rel.line)) return refuse(source, `Line ${rel.line} has an error`);
    const end = rel.from.entity.name === entity ? rel.from : rel.to;
    const text = `${indentOf(doc, rel.line)}${rawAt(doc, rel.line, end.entity)} [${key}: ${formatted}]`;
    const otherFirst = end === rel.to && rel.from.entity.name !== entity && firstLine(doc, rel.from.entity.name) === rel.line;
    if (otherFirst) edits.insertAfter(rel.line, text);
    else edits.insertBefore(rel.line, text);
    return edits.result();
  }
  const decl = decls[0]!;
  if (hasError(doc, decl.line)) return refuse(source, `Line ${decl.line} has an error`);
  const next = propsAfter(doc, decl.line, decl.props, key, formatted);
  if (next === rawAt(doc, decl.line, decl.props)) return unchanged(source);
  writeProps(doc, edits, decl.line, decl.props, next, decl.name.endColumn);
  return edits.result();
}

/** Why a table can't be called `name` (undefined when it can), and whether it must be quoted. */
export function erdNameProblem(doc: { diagram: ErdDiagram; spans: ErdSpans }, entity: string, name: string): { reason?: string; quote: boolean } {
  if (!name) return { reason: 'A name cannot be blank', quote: false };
  if (name.includes('"') || /[\r\n]/.test(name)) return { reason: 'Names cannot contain double quotes or line breaks', quote: false };
  if (name.includes('.')) return { reason: "Table names cannot contain '.' (it separates the table from the column)", quote: false };
  if (name === 'legend') return { reason: "'legend' is reserved", quote: false };
  const first = name.split(/\s+/)[0]!;
  if ((ERD_KEYWORDS as readonly string[]).includes(first)) return { reason: `'${first}' starts a setting line; pick another name`, quote: false };
  const quote = /[\s<>[\]{}:,]|\/\//.test(name) || name.startsWith('-');
  if (quote && doc.spans.relationships.some((r) => (r.from.entity.name === entity && r.from.column) || (r.to.entity.name === entity && r.to.column))) {
    return { reason: `'${entity}' is used as 'table.column', so its name can't have spaces or < > [ ] { } : ,`, quote };
  }
  return { quote };
}

/** Renames a table everywhere: its declaration and every relationship end (`table.column` keeps the column). */
export function renameEntity(source: string, entity: string, newName: string): EditResult {
  const doc = load(source);
  if (!doc.diagram.entities.has(entity)) return refuse(source, `There is no table '${entity}' in the code`);
  const name = newName.trim();
  if (name === entity) return unchanged(source);
  const problem = erdNameProblem(doc, entity, name);
  if (problem.reason) return refuse(source, problem.reason);
  if (doc.diagram.entities.has(name)) return refuse(source, `'${name}' already exists`);
  const written = (quoted: boolean) => (quoted || problem.quote ? `"${name}"` : name);
  const edits = new LineEdits(doc);
  for (const decl of doc.spans.entities) if (decl.entity === entity) edits.splice(decl.line, decl.name.column, decl.name.endColumn, written(decl.name.quoted));
  for (const rel of doc.spans.relationships) {
    for (const end of [rel.from, rel.to]) if (end.entity.name === entity) edits.splice(rel.line, end.entity.column, end.entity.endColumn, written(end.entity.quoted));
  }
  return edits.result();
}

/** Deletes a table (declaration and body) and every relationship that touches it. */
export function deleteEntity(source: string, entity: string): EditResult {
  const doc = load(source);
  if (!doc.diagram.entities.has(entity)) return refuse(source, `There is no table '${entity}' in the code`);
  const edits = new LineEdits(doc);
  for (const decl of doc.spans.entities) {
    if (decl.entity !== entity) continue;
    if (decl.open && !decl.close) return refuse(source, `'${entity}' is missing its closing '}'`);
    for (let line = decl.line; line <= (decl.close?.line ?? decl.line); line++) edits.removeLine(line);
  }
  const deleted = new Set([entity]);
  for (const rel of doc.spans.relationships) {
    if (rel.from.entity.name !== entity && rel.to.entity.name !== entity) continue;
    if (hasError(doc, rel.line)) return refuse(source, `Line ${rel.line} has an error`);
    edits.replaceLine(rel.line, keepAlive(doc, rel, deleted));
  }
  return edits.result();
}

/** Changes a relationship's cardinality connector. */
export function setRelationshipConnector(source: string, id: string, connector: ErdConnector): EditResult {
  if (!ERD_CONNECTORS.includes(connector)) return refuse(source, `'${connector}' isn't a relationship. Use ${ERD_CONNECTORS.join(' ')}`);
  const found = findRelationship(source, id);
  if (!('doc' in found)) return found;
  const { doc, rel } = found;
  if (rawAt(doc, rel.line, rel.connector) === connector) return unchanged(source);
  const edits = new LineEdits(doc);
  edits.splice(rel.line, rel.connector.column, rel.connector.endColumn, spacedConnector(doc, rel, connector));
  return edits.result();
}

/** Sets (or with `null` removes) a property (`color`) on a relationship. */
export function setRelationshipProperty(source: string, id: string, key: string, value: string | null): EditResult {
  const found = findRelationship(source, id);
  if (!('doc' in found)) return found;
  const { doc, rel } = found;
  if (!isPropertyKey(key)) return refuse(source, `'${key}' isn't a property name`);
  const formatted = value === null ? null : formatValue(value);
  if (formatted === undefined) return refuse(source, 'Values cannot contain double quotes');
  const next = propsAfter(doc, rel.line, rel.props, key, formatted);
  if (next === rawAt(doc, rel.line, rel.props)) return unchanged(source);
  const edits = new LineEdits(doc);
  writeProps(doc, edits, rel.line, rel.props, next, rel.range.endColumn);
  return edits.result();
}

/** Sets (or with `null`/blank removes) a relationship's label. */
export function setRelationshipLabel(source: string, id: string, label: string | null): EditResult {
  const found = findRelationship(source, id);
  if (!('doc' in found)) return found;
  const { doc, rel } = found;
  const text = label?.trim() || null;
  if (text !== null) {
    if (/[\r\n]/.test(text)) return refuse(source, 'Labels are one line');
    if (text.includes('//')) return refuse(source, "Labels cannot contain '//' (it starts a comment)");
    if (text.includes('[')) return refuse(source, "Relationship labels cannot contain '['");
  }
  const current = rel.label ? rawAt(doc, rel.line, rel.label) : null;
  if (current === text) return unchanged(source);
  const edits = new LineEdits(doc);
  if (text === null) {
    if (!rel.colon) return unchanged(source);
    edits.splice(rel.line, startOfSpace(doc, rel.line, rel.colon.column), (rel.label ?? rel.colon).endColumn, '');
  } else if (rel.label) {
    edits.splice(rel.line, rel.label.column, rel.label.endColumn, text);
  } else if (rel.colon) {
    edits.splice(rel.line, rel.colon.endColumn, rel.colon.endColumn, ` ${text}`);
  } else {
    edits.splice(rel.line, rel.to.range.endColumn, rel.to.range.endColumn, `: ${text}`);
  }
  return edits.result();
}

/** Deletes a relationship; a table first written there keeps a declaration so it doesn't vanish or move. */
export function deleteRelationship(source: string, id: string): EditResult {
  const found = findRelationship(source, id);
  if (!('doc' in found)) return found;
  const { doc, rel } = found;
  const edits = new LineEdits(doc);
  edits.replaceLine(rel.line, keepAlive(doc, rel, new Set()));
  return edits.result();
}

// --- Columns ----------------------------------------------------------------
// A column line is `name [type] [meta…]`: the first word after the name is its
// type, the rest are flags (`pk`, `fk`, `unique`, …). A column only named in a
// relationship (`orders.userId > users.id`) has no line until it gets one.

/** Flags the toolbar toggles on a column (written as words after the type). */
export const ERD_COLUMN_KEYS = ['pk', 'fk', 'unique', 'nullable'] as const;

/** Why a column can't be called `name` (undefined when it can). */
export function erdColumnNameProblem(name: string): string | undefined {
  if (!name) return 'A name cannot be blank';
  if (/\s/.test(name)) return "Column names can't contain spaces (relationships write them as 'table.column')";
  if (/["<>[\]{}:]|\/\//.test(name)) return 'Column names can\'t contain " < > [ ] { } : or //';
  return undefined;
}

/** A column type as written: quoted when it has spaces; undefined when it can't be written. */
function formatColumnType(type: string): string | undefined {
  if (type.includes('"') || /[\r\n]/.test(type)) return undefined;
  return /\s|\/\//.test(type) ? `"${type}"` : type;
}

const columnLines = (doc: Doc, entity: string, column: string) => doc.spans.columns.filter((c) => c.entity === entity && c.name.text === column);
const columnRefs = (doc: Doc, entity: string, column: string) =>
  doc.spans.relationships.flatMap((r) => [r.from, r.to].filter((end) => end.entity.name === entity && end.column?.name === column).map((end) => ({ rel: r, end })));

function findColumn(source: string, entity: string, column: string): { doc: Doc } | EditResult {
  const doc = load(source);
  const table = doc.diagram.entities.get(entity);
  if (!table) return refuse(source, `There is no table '${entity}' in the code`);
  if (!table.attributes.some((a) => a.name === column)) return refuse(source, `'${entity}' has no column '${column}'`);
  return { doc };
}

/** Renames a column: its line and every relationship that names it (`users.email`). */
export function renameColumn(source: string, entity: string, column: string, newName: string): EditResult {
  const found = findColumn(source, entity, column);
  if (!('doc' in found)) return found;
  const { doc } = found;
  const name = newName.trim();
  if (name === column) return unchanged(source);
  const problem = erdColumnNameProblem(name);
  if (problem) return refuse(source, problem);
  if (doc.diagram.entities.get(entity)!.attributes.some((a) => a.name === name)) return refuse(source, `'${entity}' already has a column '${name}'`);
  const edits = new LineEdits(doc);
  for (const c of columnLines(doc, entity, column)) edits.splice(c.line, c.name.column, c.name.endColumn, name);
  for (const { rel, end } of columnRefs(doc, entity, column)) {
    if (hasError(doc, rel.line)) return refuse(source, `Line ${rel.line} has an error`);
    edits.splice(rel.line, end.column!.column, end.column!.endColumn, name);
  }
  return edits.result();
}

/** Sets a column's type; a column only named in relationships gets a line in its table. */
export function setColumnType(source: string, entity: string, column: string, type: string): EditResult {
  const found = findColumn(source, entity, column);
  if (!('doc' in found)) return found;
  const { doc } = found;
  const text = type.trim();
  if (!text) return refuse(source, 'A type cannot be blank');
  const written = formatColumnType(text);
  if (written === undefined) return refuse(source, 'Types cannot contain double quotes or line breaks');
  const lines = columnLines(doc, entity, column);
  if (lines.length === 0) return addColumnLine(doc, entity, undefined, `${column} ${written}`);
  const edits = new LineEdits(doc);
  for (const c of lines) {
    if (c.type?.text === text) continue;
    if (c.type) edits.splice(c.line, c.type.column, c.type.endColumn, written);
    else edits.splice(c.line, c.name.endColumn, c.name.endColumn, ` ${written}`);
  }
  return edits.result();
}

/** Turns a flag (`pk`, `fk`, `unique`, `nullable`, …) on or off on a column; it needs a type first. */
export function setColumnKey(source: string, entity: string, column: string, key: string, on: boolean): EditResult {
  const found = findColumn(source, entity, column);
  if (!('doc' in found)) return found;
  const { doc } = found;
  if (!/^[A-Za-z][\w-]*$/.test(key)) return refuse(source, `'${key}' isn't a column flag`);
  const lines = columnLines(doc, entity, column);
  if (lines.length === 0 || lines.some((c) => !c.type)) {
    if (!on) return unchanged(source);
    return refuse(source, `Give '${column}' a type first (the word after a column's name is its type)`);
  }
  const edits = new LineEdits(doc);
  const lower = key.toLowerCase();
  for (const c of lines) {
    const has = c.meta.filter((m) => !m.quoted && m.text.toLowerCase() === lower);
    if (on && !has.length) edits.splice(c.line, c.range.endColumn, c.range.endColumn, ` ${key}`);
    if (!on) for (const m of has) edits.splice(c.line, startOfSpace(doc, c.line, m.column), m.endColumn, '', false);
  }
  return edits.result();
}

/** Adds a column line after `after` (or at the end of the table), giving the table a `{ }` body when it has none. */
export function addColumn(source: string, entity: string, name: string, type: string, after?: string): EditResult {
  const doc = load(source);
  const table = doc.diagram.entities.get(entity);
  if (!table) return refuse(source, `There is no table '${entity}' in the code`);
  const problem = erdColumnNameProblem(name.trim());
  if (problem) return refuse(source, problem);
  if (table.attributes.some((a) => a.name === name.trim())) return refuse(source, `'${entity}' already has a column '${name.trim()}'`);
  const written = formatColumnType(type.trim());
  if (!type.trim() || written === undefined) return refuse(source, "That type can't be written");
  return addColumnLine(doc, entity, after, `${name.trim()} ${written}`);
}

/** Deletes a column line; refused while a relationship uses the column. */
export function deleteColumn(source: string, entity: string, column: string): EditResult {
  const found = findColumn(source, entity, column);
  if (!('doc' in found)) return found;
  const { doc } = found;
  const refs = columnRefs(doc, entity, column).length;
  if (refs) return refuse(source, `${refs === 1 ? 'A relationship uses' : `${refs} relationships use`} '${entity}.${column}'; delete ${refs === 1 ? 'it' : 'them'} first`);
  const edits = new LineEdits(doc);
  for (const c of columnLines(doc, entity, column)) edits.removeLine(c.line);
  return edits.result();
}

/** Writes a column line into a table: after a column, at the end of its body, or in a new body / declaration. */
function addColumnLine(doc: Doc, entity: string, after: string | undefined, text: string): EditResult {
  const source = doc.source;
  const edits = new LineEdits(doc);
  const own = doc.spans.columns.filter((c) => c.entity === entity);
  const anchor = after ? own.filter((c) => c.name.text === after).at(-1) : undefined;
  if (anchor) {
    edits.insertAfter(anchor.line, `${indentOf(doc, anchor.line)}${text}`);
    return edits.result();
  }
  const decls = doc.spans.entities.filter((d) => d.entity === entity);
  if (decls.length > 1) return refuse(source, `'${entity}' is defined in ${decls.length} places`);
  const decl = decls[0];
  if (decl) {
    if (hasError(doc, decl.line)) return refuse(source, `Line ${decl.line} has an error`);
    const outer = indentOf(doc, decl.line);
    const inner = own.length ? indentOf(doc, own.at(-1)!.line) : `${outer}  `;
    if (decl.open && !decl.close) return refuse(source, `'${entity}' is missing its closing '}'`);
    if (decl.open && decl.close && decl.close.line > decl.line) edits.insertBefore(decl.close.line, `${inner}${text}`);
    else if (decl.open && decl.close) edits.splice(decl.line, decl.open.column, decl.close.endColumn, `{\n${inner}${text}\n${outer}}`);
    else edits.splice(decl.line, decl.range.endColumn, decl.range.endColumn, ` {\n${inner}${text}\n${outer}}`);
    return edits.result();
  }
  // Only used in relationships: declare it with a body next to where it is first used.
  const rel = doc.spans.relationships.find((r) => r.from.entity.name === entity || r.to.entity.name === entity);
  if (!rel) return refuse(source, `Couldn't find where '${entity}' is used`);
  if (hasError(doc, rel.line)) return refuse(source, `Line ${rel.line} has an error`);
  const end = rel.from.entity.name === entity ? rel.from : rel.to;
  const outer = indentOf(doc, rel.line);
  const block = [`${outer}${rawAt(doc, rel.line, end.entity)} {`, `${outer}  ${text}`, `${outer}}`];
  const otherFirst = end === rel.to && rel.from.entity.name !== entity && firstLine(doc, rel.from.entity.name) === rel.line;
  for (const line of block) {
    if (otherFirst) edits.insertAfter(rel.line, line);
    else edits.insertBefore(rel.line, line);
  }
  return edits.result();
}

/**
 * Applies edits in order, re-reading the code between them, as one change. If any
 * edit is refused nothing is applied. Deleting a relationship renumbers the ones
 * after it, and renames change table names.
 */
export function applyErdEdits(source: string, edits: readonly ErdEdit[]): EditResult {
  let current = source;
  for (const edit of edits) {
    const result = applyErdEdit(current, edit);
    if (result.reason) return { source, changed: false, reason: result.reason };
    current = result.source;
  }
  return { source: current, changed: current !== source };
}

function applyErdEdit(source: string, edit: ErdEdit): EditResult {
  switch (edit.type) {
    case 'setEntityProperty':
      return setEntityProperty(source, edit.entity, edit.key, edit.value);
    case 'renameEntity':
      return renameEntity(source, edit.entity, edit.name);
    case 'deleteEntity':
      return deleteEntity(source, edit.entity);
    case 'setRelationshipConnector':
      return setRelationshipConnector(source, edit.relationship, edit.connector);
    case 'setRelationshipProperty':
      return setRelationshipProperty(source, edit.relationship, edit.key, edit.value);
    case 'setRelationshipLabel':
      return setRelationshipLabel(source, edit.relationship, edit.label);
    case 'deleteRelationship':
      return deleteRelationship(source, edit.relationship);
    case 'renameColumn':
      return renameColumn(source, edit.entity, edit.column, edit.name);
    case 'setColumnType':
      return setColumnType(source, edit.entity, edit.column, edit.columnType);
    case 'setColumnKey':
      return setColumnKey(source, edit.entity, edit.column, edit.key, edit.on);
    case 'addColumn':
      return addColumn(source, edit.entity, edit.name, edit.columnType, edit.after);
    case 'deleteColumn':
      return deleteColumn(source, edit.entity, edit.column);
  }
}

// ---------------------------------------------------------------------------

/**
 * The connector written in place of the old one, keeping its spacing
 * (`a.id<b.id` stays unspaced); `-` gets a space on any side that has none,
 * because it is only a connector between whitespace.
 */
function spacedConnector(doc: Doc, rel: ErdRelationshipSpan, connector: ErdConnector): string {
  if (connector !== '-') return connector;
  const line = doc.lines[rel.line - 1] ?? '';
  const before = /\s/.test(line[rel.connector.column - 2] ?? '') ? '' : ' ';
  const after = /\s/.test(line[rel.connector.endColumn - 1] ?? '') ? '' : ' ';
  return `${before}-${after}`;
}

function findRelationship(source: string, id: string): { doc: Doc; rel: ErdRelationshipSpan } | EditResult {
  const doc = load(source);
  const rel = doc.spans.relationships.find((r) => r.id === id);
  if (!rel) return refuse(source, `There is no relationship '${id}' in the code`);
  if (hasError(doc, rel.line)) return refuse(source, `Line ${rel.line} has an error`);
  return { doc, rel };
}

/** The line a table is first written on (declaration or relationship). */
function firstLine(doc: Doc, entity: string): number {
  const lines = [
    ...doc.spans.entities.filter((d) => d.entity === entity).map((d) => d.line),
    ...doc.spans.relationships.filter((r) => r.from.entity.name === entity || r.to.entity.name === entity).map((r) => r.line),
  ];
  return Math.min(...lines);
}

/** Declarations for undeclared tables first written on a relationship line that is going away. */
function keepAlive(doc: Doc, rel: ErdRelationshipSpan, deleted: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const end of [rel.from, rel.to] as ErdEndSpan[]) {
    const name = end.entity.name;
    if (deleted.has(name) || seen.has(name)) continue;
    seen.add(name);
    if (doc.diagram.entities.get(name)?.implicit && firstLine(doc, name) === rel.line) out.push(rawAt(doc, rel.line, end.entity));
  }
  return out;
}
