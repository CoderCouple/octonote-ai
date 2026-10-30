import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../../apps/octodraw-playground/src/examples';
import { addColumn, applyErdEdits, deleteColumn, parseErd, parseErdWithSpans, renameColumn, setColumnKey, setColumnType, type EditResult } from '../src';
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
const rels = (source: string) => parseErd(source).relationships.map((r) => `${r.from.entity}.${r.from.attribute}${r.connector}${r.to.entity}.${r.to.attribute}`);
const cols = (source: string, table: string) => parseErd(source).entities.get(table)!.attributes.map((a) => [a.name, a.type, ...a.meta].filter(Boolean).join(' '));

const SRC = `users {
  id string pk
  email string
  "first name" varchar
}
orders {
  id uuid pk
}
orders.userId > users.id
orders.email - users.email
`;

describe('ERD column spans', () => {
  it('records column lines with name, type and flag positions', () => {
    const { spans } = parseErdWithSpans(SRC);
    const lines = SRC.split('\n');
    const at = (line: number, s: { column: number; endColumn: number } | undefined) => (s ? lines[line - 1]!.slice(s.column - 1, s.endColumn - 1) : undefined);
    const id = spans.columns[0]!;
    expect(id).toMatchObject({ entity: 'users', line: 2 });
    expect([at(2, id.name), at(2, id.type), id.meta.map((m) => at(2, m))]).toEqual(['id', 'string', ['pk']]);
    expect(spans.columns[2]!.name).toMatchObject({ text: 'first name', quoted: true });
    expect(spans.columns.map((c) => c.entity)).toEqual(['users', 'users', 'users', 'orders']);
  });
});

describe('renameColumn', () => {
  it('renames a column and every relationship that names it', () => {
    const out = edited(SRC, renameColumn(SRC, 'users', 'email', 'mail'));
    expect(out).toContain('  mail string\n');
    expect(rels(out)).toEqual(['orders.userId>users.id', 'orders.email-users.mail']);
    // A column only named in a relationship is renamed there.
    expect(edited(SRC, renameColumn(SRC, 'orders', 'userId', 'user_id'))).toContain('orders.user_id > users.id');
  });

  it('refuses names a relationship can not carry, and taken ones', () => {
    expect(renameColumn(SRC, 'users', 'email', 'e mail').reason).toMatch(/spaces/);
    expect(renameColumn(SRC, 'users', 'email', 'a:b').reason).toMatch(/can't contain/);
    expect(renameColumn(SRC, 'users', 'email', 'id').reason).toMatch(/already has/);
    expect(renameColumn(SRC, 'users', 'nope', 'x').reason).toMatch(/no column/);
    expect(renameColumn(SRC, 'users', 'email', 'email')).toEqual({ source: SRC, changed: false });
  });
});

describe('setColumnType', () => {
  it('replaces or adds the type, quoting one with spaces', () => {
    expect(cols(edited(SRC, setColumnType(SRC, 'users', 'email', 'text')), 'users')[1]).toBe('email text');
    expect(edited(SRC, setColumnType(SRC, 'users', 'email', 'character varying'))).toContain('  email "character varying"\n');
    expect(edited('t {\n  id\n}', setColumnType('t {\n  id\n}', 't', 'id', 'int'))).toBe('t {\n  id int\n}');
    expect(setColumnType(SRC, 'users', 'email', ' ').reason).toMatch(/blank/);
    expect(setColumnType(SRC, 'users', 'email', 'string')).toEqual({ source: SRC, changed: false });
  });

  it('writes a line for a column only named in relationships', () => {
    const out = edited(SRC, setColumnType(SRC, 'orders', 'userId', 'uuid'));
    expect(out).toContain('orders {\n  id uuid pk\n  userId uuid\n}');
    expect(cols(out, 'orders')).toEqual(['id uuid pk', 'userId uuid', 'email']);
  });
});

describe('setColumnKey', () => {
  it('toggles flags after the type', () => {
    const on = edited(SRC, setColumnKey(SRC, 'users', 'email', 'unique', true));
    expect(on).toContain('  email string unique\n');
    expect(edited(on, setColumnKey(on, 'users', 'email', 'unique', false))).toBe(SRC);
    expect(edited(SRC, setColumnKey(SRC, 'users', 'id', 'pk', false))).toContain('  id string\n');
    expect(setColumnKey(SRC, 'users', 'id', 'pk', true)).toEqual({ source: SRC, changed: false });
    // Case-insensitive: `PK` counts as pk.
    expect(setColumnKey('t {\n  id int PK\n}', 't', 'id', 'pk', false).source).toBe('t {\n  id int\n}');
  });

  it('refuses a flag on a column without a type (the word after the name is the type)', () => {
    expect(setColumnKey('t {\n  id\n}', 't', 'id', 'pk', true).reason).toMatch(/type first/);
    expect(setColumnKey(SRC, 'orders', 'userId', 'fk', true).reason).toMatch(/type first/);
    expect(setColumnKey(SRC, 'orders', 'userId', 'fk', false)).toEqual({ source: SRC, changed: false });
  });
});

describe('addColumn', () => {
  it('adds below a column, at the end of the body, or in a new body', () => {
    expect(edited(SRC, addColumn(SRC, 'users', 'age', 'int', 'id'))).toContain('  id string pk\n  age int\n  email string');
    expect(cols(edited(SRC, addColumn(SRC, 'orders', 'total', 'float')), 'orders')).toEqual(['id uuid pk', 'total float', 'userId', 'email']);
    expect(edited('t [color: red]', addColumn('t [color: red]', 't', 'id', 'int'))).toBe('t [color: red] {\n  id int\n}');
    expect(edited('t { }', addColumn('t { }', 't', 'id', 'int'))).toBe('t {\n  id int\n}');
  });

  it('declares a table only used in relationships with a body, keeping table order', () => {
    const src = 'a.bId > b.id';
    const out = edited(src, addColumn(src, 'b', 'name', 'string'));
    expect(out).toBe('a.bId > b.id\nb {\n  name string\n}');
    expect(tables(out)).toEqual(['a', 'b']);
    expect(edited(src, addColumn(src, 'a', 'name', 'string'))).toBe('a {\n  name string\n}\na.bId > b.id');
  });

  it('refuses taken names and tables defined twice', () => {
    expect(addColumn(SRC, 'users', 'email', 'int').reason).toMatch(/already has/);
    expect(addColumn('a {\n}\na {\n}', 'a', 'x', 'int').reason).toMatch(/2 places/);
    expect(addColumn(SRC, 'users', 'x y', 'int').reason).toMatch(/spaces/);
  });
});

describe('deleteColumn', () => {
  it('deletes a column line', () => {
    const out = edited(SRC, deleteColumn(SRC, 'users', 'first name'));
    expect(cols(out, 'users')).toEqual(['id string pk', 'email string']);
  });

  it('refuses while a relationship uses it, with how many', () => {
    expect(deleteColumn(SRC, 'users', 'email').reason).toBe("A relationship uses 'users.email'; delete it first");
    expect(deleteColumn('a {\n  id int\n}\nb.x > a.id\nc.y > a.id', 'a', 'id').reason).toBe("2 relationships use 'a.id'; delete them first");
  });

  it('runs in a batch with other edits, all or nothing', () => {
    const out = applyErdEdits(SRC, [
      { type: 'renameColumn', entity: 'users', column: 'first name', name: 'first_name' },
      { type: 'setColumnKey', entity: 'users', column: 'first_name', key: 'nullable', on: true },
    ]);
    expect(out.source).toContain('  first_name varchar nullable\n');
    expect(applyErdEdits(SRC, [{ type: 'deleteColumn', entity: 'users', column: 'first name' }, { type: 'deleteColumn', entity: 'users', column: 'id' }]).changed).toBe(false);
  });
});

describe('column edits over the templates and examples', () => {
  const sources = [FIGURE_TEMPLATES.find((t) => t.id === 'erd')!.source, EXAMPLES['ERD: e-commerce']!];
  it.each(sources.map((s, i) => [i, s] as const))('every column edit parses cleanly (%i)', (_, src) => {
    const diagram = parseErd(src);
    for (const table of diagram.entities.values()) {
      for (const a of table.attributes) {
        const used = diagram.relationships.some((r) => [r.from, r.to].some((e) => e.entity === table.name && e.attribute === a.name));
        const renamed = edited(src, renameColumn(src, table.name, a.name, `${a.name}_x`));
        expect(parseErd(renamed).relationships.length).toBe(diagram.relationships.length);
        expect(parseErd(renamed).entities.get(table.name)!.attributes.map((x) => x.name)).toEqual(table.attributes.map((x) => (x.name === a.name ? `${a.name}_x` : x.name)));
        for (const type of ['int', 'json']) {
          const out = setColumnType(src, table.name, a.name, type);
          if (out.changed) expect(parseErd(edited(src, out)).entities.get(table.name)!.attributes.find((x) => x.name === a.name)!.type).toBe(type);
        }
        for (const key of ['pk', 'unique']) {
          const out = setColumnKey(src, table.name, a.name, key, !a.meta.includes(key));
          if (out.changed) edited(src, out);
        }
        edited(src, addColumn(src, table.name, 'added', 'string', a.name));
        const gone = deleteColumn(src, table.name, a.name);
        if (used) expect(gone.reason).toMatch(/delete/);
        else expect(parseErd(edited(src, gone)).entities.get(table.name)!.attributes.some((x) => x.name === a.name)).toBe(false);
      }
    }
  });
});
