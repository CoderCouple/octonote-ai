import { findClosingBracket, splitOutsideQuotes, stripComment, unquote } from './parse';
import type { Diagnostic, Legend, Properties, Severity, SourceRange } from './types';

// Parser for Eraser's entity relationship diagram syntax:
//
//   notation crows-feet
//   users [icon: user, color: blue] {
//     id string pk
//     email string
//   }
//   orders.userId > users.id
//
// Like the architecture parser it is line oriented and error tolerant.

export interface ErdAttribute {
  name: string;
  type?: string;
  /** Remaining words, e.g. ['pk'] or ['fk', 'unique']. */
  meta: string[];
  range: SourceRange;
}

export interface ErdEntity {
  name: string;
  label: string;
  properties: Properties;
  attributes: ErdAttribute[];
  /** Created by a relationship reference rather than declared. */
  implicit: boolean;
  range: SourceRange;
}

/** `<` one-to-many, `>` many-to-one, `-` one-to-one, `<>` many-to-many (read left to right). */
export type ErdConnector = '<' | '>' | '-' | '<>';

export interface ErdEnd {
  entity: string;
  attribute?: string;
}

export interface ErdRelationship {
  id: string;
  from: ErdEnd;
  to: ErdEnd;
  connector: ErdConnector;
  label?: string;
  properties: Properties;
  range: SourceRange;
}

export interface ErdSettings {
  title?: string;
  colorMode: string;
  styleMode: string;
  typeface: string;
  notation: 'chen' | 'crows-feet';
}

export interface ErdDiagram {
  kind: 'erd';
  settings: ErdSettings;
  entities: Map<string, ErdEntity>;
  relationships: ErdRelationship[];
  legend?: Legend;
  diagnostics: Diagnostic[];
}

const SETTINGS = {
  colorMode: ['pastel', 'bold', 'outline'],
  styleMode: ['shadow', 'plain', 'watercolor'],
  typeface: ['rough', 'clean', 'mono'],
  notation: ['chen', 'crows-feet'],
} as const;
const ENTITY_PROPERTIES = new Set(['icon', 'color', 'label', 'colorMode', 'styleMode', 'typeface', 'link']);

export function parseErd(source: string): ErdDiagram {
  const diagnostics: Diagnostic[] = [];
  const entities = new Map<string, ErdEntity>();
  const relationships: ErdRelationship[] = [];
  const settings: ErdSettings = { colorMode: 'pastel', styleMode: 'shadow', typeface: 'clean', notation: 'chen' };
  let legend: Legend | undefined;
  let open: { kind: 'entity'; entity: ErdEntity } | { kind: 'legend' } | undefined;
  let openLine = 0;

  const report = (severity: Severity, message: string, line: number, column: number, endColumn: number) =>
    diagnostics.push({ severity, message, line, column, endColumn: Math.max(endColumn, column + 1) });

  const properties = (raw: string, line: number, column: number, known?: Set<string>): Properties => {
    const props: Properties = {};
    for (const part of splitOutsideQuotes(raw, ',')) {
      const text = part.text.trim();
      if (!text) continue;
      const colon = text.indexOf(':');
      const at = column + part.start + (part.text.length - part.text.trimStart().length);
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

  const entity = (name: string, line: number, column: number, implicit: boolean): ErdEntity => {
    let e = entities.get(name);
    if (!e) {
      e = { name, label: name, properties: {}, attributes: [], implicit, range: { line, column, endColumn: column + name.length } };
      entities.set(name, e);
    }
    return e;
  };

  const lines = source.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const text = stripComment(rawLine);
    const trimmed = text.trim();
    if (!trimmed) return;
    const column = text.length - text.trimStart().length + 1;

    if (trimmed === '}') {
      if (!open) report('error', "Unexpected '}'", line, column, column + 1);
      open = undefined;
      return;
    }

    if (open?.kind === 'legend') {
      let pos = 0;
      while (pos < trimmed.length) {
        const start = trimmed.indexOf('[', pos);
        if (start < 0) break;
        const end = findClosingBracket(trimmed, start);
        if (end < 0) break;
        legend!.items.push({ properties: properties(trimmed.slice(start + 1, end), line, column + start + 1), range: { line, column: column + start, endColumn: column + end + 1 } });
        pos = end + 1;
      }
      return;
    }

    if (open?.kind === 'entity') {
      // Attribute: name [type] [metadata…]
      const words = trimmed.match(/"[^"]*"|\S+/g) ?? [];
      const [name, type, ...meta] = words.map(unquote);
      if (name) open.entity.attributes.push({ name, type, meta, range: { line, column, endColumn: column + trimmed.length } });
      return;
    }

    const setting = /^(title|colorMode|styleMode|typeface|notation)\s+(.+)$/.exec(trimmed);
    if (setting) {
      const [, key, value] = setting as unknown as [string, keyof ErdSettings, string];
      if (key === 'title') settings.title = unquote(value.trim());
      else if ((SETTINGS[key as keyof typeof SETTINGS] as readonly string[]).includes(value.trim())) (settings as unknown as Record<string, string>)[key] = value.trim();
      else report('warning', `Unknown ${key} '${value.trim()}'. Use ${SETTINGS[key as keyof typeof SETTINGS].join(', ')}`, line, column, column + trimmed.length);
      return;
    }

    // Relationship: ref <connector> ref [: label] [props]
    const rel = /^("[^"]+"|[^\s<>[\]{}:-][^\s<>[\]{}:]*)\s*(<>|<|>|\s-\s)\s*("[^"]+"|[^\s<>[\]{}:]+)\s*(?::\s*([^[]*))?(?:\[(.*)\])?\s*$/.exec(trimmed);
    if (rel) {
      const end = (ref: string): ErdEnd => {
        const r = unquote(ref);
        const dot = ref.startsWith('"') ? -1 : r.indexOf('.');
        const e = entity(dot < 0 ? r : r.slice(0, dot), line, column, true);
        const attribute = dot < 0 ? undefined : r.slice(dot + 1);
        if (attribute && !e.attributes.some((a) => a.name === attribute)) e.attributes.push({ name: attribute, meta: [], range: { line, column, endColumn: column + ref.length } });
        return { entity: e.name, attribute };
      };
      const connector = rel[2]!.trim() as ErdConnector;
      relationships.push({
        id: `r${relationships.length}`,
        from: end(rel[1]!),
        to: end(rel[3]!),
        connector,
        label: rel[4]?.trim() || undefined,
        properties: rel[5] !== undefined ? properties(rel[5], line, column, new Set(['color'])) : {},
        range: { line, column, endColumn: column + trimmed.length },
      });
      return;
    }

    // Entity: name [props] [{ … }]
    const decl = /^("[^"]+"|[^\s[{]+)\s*(?:\[(.*)\])?\s*(\{\s*(\})?)?\s*$/.exec(trimmed);
    if (decl) {
      const name = unquote(decl[1]!);
      if (name === 'legend' && decl[3]) {
        legend = { properties: decl[2] !== undefined ? properties(decl[2], line, column) : {}, items: [], range: { line, column, endColumn: column + trimmed.length } };
        if (!decl[4]) open = { kind: 'legend' };
        return;
      }
      const e = entity(name, line, column, false);
      if (!e.implicit && e.range.line !== line) report('warning', `'${name}' is already defined on line ${e.range.line}`, line, column, column + name.length);
      e.implicit = false;
      e.range = { line, column, endColumn: column + name.length };
      if (decl[2] !== undefined) {
        Object.assign(e.properties, properties(decl[2], line, column + trimmed.indexOf('[') + 1, ENTITY_PROPERTIES));
        if (e.properties.label) e.label = e.properties.label;
      }
      if (decl[3] && !decl[4]) {
        open = { kind: 'entity', entity: e };
        openLine = line;
      }
      return;
    }

    report('error', "Expected an entity ('name { … }'), an attribute, or a relationship ('a.id > b.aId')", line, column, column + trimmed.length);
  });

  if (open) report('error', "Missing closing '}'", openLine || 1, 1, 2);
  return { kind: 'erd', settings, entities, relationships, legend, diagnostics };
}
