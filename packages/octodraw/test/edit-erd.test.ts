import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../../apps/octodraw-playground/src/examples';
import {
  applyErdEdits,
  deleteEntity,
  deleteRelationship,
  parseErd,
  parseErdWithSpans,
  renameEntity,
  setEntityProperty,
  setRelationshipConnector,
  setRelationshipLabel,
  setRelationshipProperty,
  type EditResult,
} from '../src';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';

/** The edited source, after checking the edit applied and added no diagnostics. */
function edited(before: string, result: EditResult): string {
  expect(result.reason).toBeUndefined();
  expect(result.changed).toBe(true);
  const messages = (source: string) => parseErd(source).diagnostics.map((d) => d.message).sort();
  const old = messages(before);
  const added = messages(result.source).filter((m) => {
    const i = old.indexOf(m);
    if (i < 0) return true;
    old.splice(i, 1);
    return false;
  });
  expect(added).toEqual([]);
  return result.source;
}

const tables = (source: string) => [...parseErd(source).entities.keys()];
const rels = (source: string) =>
  parseErd(source).relationships.map((r) => `${r.from.entity}${r.from.attribute ? `.${r.from.attribute}` : ''}${r.connector}${r.to.entity}${r.to.attribute ? `.${r.to.attribute}` : ''}${r.label ? `:${r.label}` : ''}${Object.keys(r.properties).length ? JSON.stringify(r.properties) : ''}`);

const SCHEMA = `notation crows-feet
users [icon: user] {
  id string pk
}
teams {
  id string pk
}
users.teamId > teams.id
`;

describe('parseErdWithSpans', () => {
  it('records names, props, braces, connectors, labels and column parts', () => {
    const src = 'users [icon: user] {\n  id string\n}\n  users.teamId  -  teams.id: belongs to [color: red]';
    const { spans } = parseErdWithSpans(src);
    const lines = src.split('\n');
    const at = (line: number, s: { column: number; endColumn: number } | undefined) => (s ? lines[line - 1]!.slice(s.column - 1, s.endColumn - 1) : undefined);
    const e = spans.entities[0]!;
    expect(at(1, e.name)).toBe('users');
    expect(at(1, e.props)).toBe('[icon: user]');
    expect(at(1, e.open)).toBe('{');
    expect(e.close).toEqual({ line: 3, column: 1, endColumn: 2 });
    const r = spans.relationships[0]!;
    expect(r.id).toBe('r0');
    expect(at(4, r.from.entity)).toBe('users');
    expect(at(4, r.from.column)).toBe('teamId');
    expect(at(4, r.to.range)).toBe('teams.id');
    expect(at(4, r.connector)).toBe('-');
    expect(at(4, r.colon)).toBe(':');
    expect(at(4, r.label)).toBe('belongs to');
    expect(at(4, r.props)).toBe('[color: red]');
    expect(r.props!.entries[0]!.value).toBe('red');
  });

  it('gives the same diagram as parseErd', () => {
    const src = EXAMPLES['ERD: e-commerce']!;
    expect(parseErdWithSpans(src).diagram).toEqual(parseErd(src));
  });
});

describe('setEntityProperty', () => {
  it('adds, replaces and removes properties on a declaration', () => {
    const a = edited(SCHEMA, setEntityProperty(SCHEMA, 'users', 'color', 'blue'));
    expect(a).toContain('users [icon: user, color: blue] {');
    expect(setEntityProperty(a, 'users', 'color', 'red').source).toContain('users [icon: user, color: red] {');
    expect(setEntityProperty(a, 'users', 'icon', null).source).toContain('users [color: blue] {');
    const b = edited(SCHEMA, setEntityProperty(SCHEMA, 'teams', 'color', 'green'));
    expect(b).toContain('teams [color: green] {');
    expect(setEntityProperty(b, 'teams', 'color', null).source).toBe(SCHEMA);
  });

  it('declares a table only used in relationships, before its first use', () => {
    const src = 'a {\n  id int\n}\na.bId > b.id\n';
    const out = edited(src, setEntityProperty(src, 'b', 'color', 'red'));
    expect(out).toBe('a {\n  id int\n}\nb [color: red]\na.bId > b.id\n');
    expect(parseErd(out).entities.get('b')!.properties.color).toBe('red');
  });

  it('declares after the line when the other table is new there too, keeping table order', () => {
    const src = 'a.bId > b.id';
    const out = edited(src, setEntityProperty(src, 'b', 'color', 'red'));
    expect(out).toBe('a.bId > b.id\nb [color: red]');
    expect(tables(out)).toEqual(['a', 'b']);
    expect(setEntityProperty(src, 'a', 'color', 'red').source).toBe('a [color: red]\na.bId > b.id');
  });

  it('is a no-op for an unchanged value and refuses repeats and bad input', () => {
    expect(setEntityProperty(SCHEMA, 'users', 'icon', 'user')).toEqual({ source: SCHEMA, changed: false });
    expect(setEntityProperty(SCHEMA, 'users', 'color', null)).toEqual({ source: SCHEMA, changed: false });
    expect(setEntityProperty('a {\n}\na {\n}', 'a', 'color', 'red').reason).toMatch(/2 places/);
    expect(setEntityProperty(SCHEMA, 'nope', 'color', 'red').reason).toMatch(/no table/);
    expect(setEntityProperty(SCHEMA, 'users', 'color', 'a"b').reason).toMatch(/quotes/);
  });

  it('quotes values with commas', () => {
    expect(setEntityProperty('t', 't', 'label', 'a, b').source).toBe('t [label: "a, b"]');
  });
});

describe('renameEntity', () => {
  it('renames the declaration and every reference, keeping columns', () => {
    const out = edited(SCHEMA, renameEntity(SCHEMA, 'teams', 'groups'));
    expect(out).toContain('groups {');
    expect(out).toContain('users.teamId > groups.id');
    expect(rels(out)).toEqual(['users.teamId>groups.id']);
  });

  it('quotes names that need it when the table has no column references', () => {
    const src = 'a > b';
    const out = edited(src, renameEntity(src, 'b', 'Big table'));
    expect(out).toBe('a > "Big table"');
    expect(tables(out)).toEqual(['a', 'Big table']);
  });

  it('refuses names a column reference can not carry, dots, keywords and taken names', () => {
    expect(renameEntity(SCHEMA, 'teams', 'my teams').reason).toMatch(/table\.column/);
    expect(renameEntity(SCHEMA, 'teams', 'a.b').reason).toMatch(/'\.'/);
    expect(renameEntity(SCHEMA, 'teams', 'notation x').reason).toMatch(/setting/);
    expect(renameEntity(SCHEMA, 'teams', 'title').reason).toMatch(/setting/);
    expect(renameEntity(SCHEMA, 'teams', 'users').reason).toMatch(/already exists/);
    expect(renameEntity(SCHEMA, 'teams', ' ').reason).toMatch(/blank/);
    expect(renameEntity(SCHEMA, 'teams', 'teams')).toEqual({ source: SCHEMA, changed: false });
  });
});

describe('deleteEntity', () => {
  it('removes the table body and its relationships', () => {
    const out = edited(SCHEMA, deleteEntity(SCHEMA, 'teams'));
    expect(out).toBe('notation crows-feet\nusers [icon: user] {\n  id string pk\n}\n');
  });

  it('keeps a table first written in a removed relationship', () => {
    const src = 'a.x > b.y\nb.z > c.w';
    expect(edited(src, deleteEntity(src, 'a'))).toBe('b\nb.z > c.w');
    expect(tables(deleteEntity(src, 'a').source)).toEqual(['b', 'c']);
  });

  it('refuses a table missing its closing brace', () => {
    expect(deleteEntity('a {\n  id int', 'a').reason).toMatch(/closing/);
  });
});

describe('relationships', () => {
  it('changes cardinality, keeping the spacing (`-` always gets spaces)', () => {
    const src = 'a.id<b.aId';
    expect(edited(src, setRelationshipConnector(src, 'r0', '-'))).toBe('a.id - b.aId');
    expect(setRelationshipConnector(src, 'r0', '<')).toEqual({ source: src, changed: false });
    expect(edited(src, setRelationshipConnector(src, 'r0', '<>'))).toBe('a.id<>b.aId');
    expect(edited('a.id < b.aId', setRelationshipConnector('a.id < b.aId', 'r0', '>'))).toBe('a.id > b.aId');
    expect(edited('a.id <b.aId', setRelationshipConnector('a.id <b.aId', 'r0', '-'))).toBe('a.id - b.aId');
    expect(edited('a.id - b.aId', setRelationshipConnector('a.id - b.aId', 'r0', '<'))).toBe('a.id < b.aId');
    expect(setRelationshipConnector(src, 'r0', '>>' as never).reason).toMatch(/isn't a relationship/);
    expect(setRelationshipConnector(src, 'r9', '>').reason).toMatch(/no relationship/);
  });

  it('colours and un-colours a relationship', () => {
    const src = 'a.id < b.aId: has';
    const out = edited(src, setRelationshipProperty(src, 'r0', 'color', 'red'));
    expect(out).toBe('a.id < b.aId: has [color: red]');
    expect(rels(out)).toEqual(['a.id<b.aId:has{"color":"red"}']);
    expect(setRelationshipProperty(out, 'r0', 'color', null).source).toBe(src);
    expect(edited('a < b', setRelationshipProperty('a < b', 'r0', 'color', 'blue'))).toBe('a < b [color: blue]');
  });

  it('sets, replaces and removes labels', () => {
    expect(edited('a < b', setRelationshipLabel('a < b', 'r0', 'owns'))).toBe('a < b: owns');
    expect(setRelationshipLabel('a < b: owns', 'r0', 'has').source).toBe('a < b: has');
    expect(setRelationshipLabel('a < b: owns [color: red]', 'r0', null).source).toBe('a < b [color: red]');
    expect(setRelationshipLabel('a < b [color: red]', 'r0', 'x').source).toBe('a < b: x [color: red]');
    expect(setRelationshipLabel('a < b', 'r0', 'a [b]').reason).toMatch(/'\['/);
    expect(setRelationshipLabel('a < b', 'r0', 'a // b').reason).toMatch(/comment/);
  });

  it('deletes a relationship, keeping tables first written there', () => {
    const src = 'a {\n  id int\n}\na.id < b.aId\nb.cId > c.id\n';
    expect(edited(src, deleteRelationship(src, 'r0'))).toBe('a {\n  id int\n}\nb\nb.cId > c.id\n');
    expect(edited(src, deleteRelationship(src, 'r1'))).toBe('a {\n  id int\n}\na.id < b.aId\nc\n');
  });

  it('applies a batch as one change, or nothing', () => {
    const src = 'a < b\nb < c';
    const out = applyErdEdits(src, [
      { type: 'deleteRelationship', relationship: 'r1' },
      { type: 'setRelationshipProperty', relationship: 'r0', key: 'color', value: 'red' },
    ]);
    expect(out.source).toBe('a < b [color: red]\nc');
    expect(applyErdEdits(src, [{ type: 'deleteRelationship', relationship: 'r0' }, { type: 'renameEntity', entity: 'c', name: 'a' }])).toEqual({ source: src, changed: false, reason: "'a' already exists" });
  });
});

describe('round trip over the templates and examples', () => {
  const sources = [FIGURE_TEMPLATES.find((t) => t.id === 'erd')!.source, EXAMPLES['ERD: e-commerce']!];
  it.each(sources.map((s, i) => [i, s] as const))('every table and relationship edit parses cleanly (%i)', (_, src) => {
    const diagram = parseErd(src);
    for (const name of diagram.entities.keys()) {
      const coloured = edited(src, setEntityProperty(src, name, 'color', 'purple'));
      expect(parseErd(coloured).entities.get(name)!.properties.color).toBe('purple');
      edited(src, setEntityProperty(src, name, 'icon', 'database'));
      const renamed = edited(src, renameEntity(src, name, `${name}_x`));
      expect(parseErd(renamed).relationships.length).toBe(diagram.relationships.length);
      const gone = edited(src, deleteEntity(src, name));
      expect(parseErd(gone).entities.has(name)).toBe(false);
    }
    for (const r of diagram.relationships) {
      for (const c of ['<', '>', '-', '<>'] as const) {
        const out = setRelationshipConnector(src, r.id, c);
        if (out.changed) expect(parseErd(edited(src, out)).relationships.find((x) => x.id === r.id)!.connector).toBe(c);
      }
      expect(parseErd(edited(src, setRelationshipProperty(src, r.id, 'color', 'red'))).relationships.find((x) => x.id === r.id)!.properties.color).toBe('red');
      expect(parseErd(edited(src, setRelationshipLabel(src, r.id, 'links to'))).relationships.find((x) => x.id === r.id)!.label).toBe('links to');
      expect(parseErd(edited(src, deleteRelationship(src, r.id))).relationships.length).toBe(diagram.relationships.length - 1);
    }
  });
});
