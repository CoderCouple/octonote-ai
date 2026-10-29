import { describe, expect, it } from 'vitest';
import { detectDiagramType } from '../src/dsl/detect';
import { parseErd } from '../src/dsl/erd';
import { parseSequence } from '../src/dsl/sequence';

describe('detectDiagramType', () => {
  it('recognizes each kind', () => {
    expect(detectDiagramType('users {\n  id string pk\n}')).toBe('erd');
    expect(detectDiagramType('orders.userId > users.id')).toBe('erd');
    expect(detectDiagramType('notation crows-feet\nusers')).toBe('erd');
    expect(detectDiagramType('Client > Server: hi\nactivate Server')).toBe('sequence');
    expect(detectDiagramType('A > B: x\nalt [label: ok] {\n  B > A: y\n}')).toBe('sequence');
    expect(detectDiagramType('VPC {\n  API [icon: server]\n}\nUser > API')).toBe('flow');
    expect(detectDiagramType('Group {\n  Server\n  DB\n}')).toBe('flow');
  });
});

describe('parseErd', () => {
  const d = parseErd(`notation crows-feet
users [icon: user, color: blue] {
  id string pk
  email string unique
}
orders {
  id uuid pk
  userId uuid fk
  total "decimal(10,2)"
}
orders.userId > users.id
orders > line_items [color: green]
`);

  it('parses entities, attributes and settings', () => {
    expect(d.diagnostics).toEqual([]);
    expect(d.settings.notation).toBe('crows-feet');
    expect(d.entities.get('users')).toMatchObject({ properties: { icon: 'user', color: 'blue' }, attributes: [{ name: 'id', type: 'string', meta: ['pk'] }, { name: 'email', type: 'string', meta: ['unique'] }] });
    expect(d.entities.get('orders')!.attributes.map((a) => a.type)).toEqual(['uuid', 'uuid', 'decimal(10,2)']);
  });

  it('parses relationships and creates implicit entities', () => {
    expect(d.relationships.map((r) => [r.from, r.to, r.connector])).toEqual([
      [{ entity: 'orders', attribute: 'userId' }, { entity: 'users', attribute: 'id' }, '>'],
      [{ entity: 'orders', attribute: undefined }, { entity: 'line_items', attribute: undefined }, '>'],
    ]);
    expect(d.relationships[1]!.properties).toEqual({ color: 'green' });
    expect(d.entities.get('line_items')).toMatchObject({ implicit: true, attributes: [] });
  });

  it('reports errors and unknown settings', () => {
    expect(parseErd('notation fancy').diagnostics[0]?.message).toMatch(/Unknown notation/);
    expect(parseErd('users {\n  id string').diagnostics[0]?.message).toBe("Missing closing '}'");
  });
});

describe('parseSequence', () => {
  const d = parseSequence(`autoNumber on
Web App [icon: monitor, color: blue] > DB [icon: database]: Start transaction
activate DB
alt [label: if complete] {
  DB > Web App: Success [color: green]
}
else [label: if failed] {
  DB --> Web App: Failure
}
deactivate DB
loop [label: retry] {
  Web App > Web App: wait
}
`);

  it('parses participants in order with their properties', () => {
    expect(d.diagnostics).toEqual([]);
    expect([...d.participants.keys()]).toEqual(['Web App', 'DB']);
    expect(d.participants.get('Web App')!.properties).toEqual({ icon: 'monitor', color: 'blue' });
    expect(d.settings.autoNumber).toBe('on');
  });

  it('parses messages, activations and blocks with sections', () => {
    expect(d.events.map((e) => e.type)).toEqual(['message', 'activate', 'block-start', 'message', 'block-section', 'message', 'block-end', 'deactivate', 'block-start', 'message', 'block-end']);
    expect(d.events[0]).toMatchObject({ from: 'Web App', to: 'DB', connector: '>', label: 'Start transaction' });
    expect(d.events[3]).toMatchObject({ label: 'Success', properties: { color: 'green' } });
    expect(d.events[4]).toMatchObject({ type: 'block-section', label: 'if failed' });
    expect(d.events[5]).toMatchObject({ connector: '-->' });
  });

  it('rejects a stray else', () => {
    expect(parseSequence('A > B\nelse {\n  B > A\n}').diagnostics[0]?.message).toMatch(/must directly follow a closed 'alt'/);
  });
});

import { layoutErd } from '../src/erd/erd';
import { layoutSequence } from '../src/sequence/sequence';
import { lightTheme } from '../src';

describe('layoutErd', () => {
  it('sizes tables to their columns and anchors links on column rows', async () => {
    const d = parseErd('users {\n  id uuid pk\n  email varchar\n}\norders {\n  id uuid pk\n  user_id uuid fk\n}\nusers.id < orders.user_id');
    const l = await layoutErd(d, { theme: lightTheme });
    const users = l.tables.find((t) => t.entity.name === 'users')!;
    const orders = l.tables.find((t) => t.entity.name === 'orders')!;
    expect(users.height).toBeGreaterThan(38 + 26);
    const link = l.links[0]!;
    expect(link).toMatchObject({ startMany: false, endMany: true });
    // Starts on the users.id row and ends on the orders.user_id row.
    expect(link.points[0]!.y).toBeCloseTo(users.y + 38 + 13, 0);
    expect(link.points.at(-1)!.y).toBeCloseTo(orders.y + 38 + 26 + 13, 0);
  });
});

describe('layoutSequence', () => {
  it('orders columns by appearance, stacks messages and frames blocks', () => {
    const d = parseSequence('A > B: one\nloop [label: again] {\n  B > C: two\n}\nC --> A: three');
    const l = layoutSequence(d);
    expect(l.participants.map((p) => p.participant.name)).toEqual(['A', 'B', 'C']);
    const ys = l.messages.map((m) => m.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const block = l.blocks[0]!;
    expect(block.y1).toBeLessThan(ys[1]!);
    expect(block.y2).toBeGreaterThan(ys[1]!);
    // The loop frames B and C but not A.
    expect(block.x1).toBeGreaterThan(l.participants[0]!.x);
    expect(l.messages[2]).toMatchObject({ dashed: true, endArrow: true });
  });

  it('numbers messages when autoNumber is on or nested', () => {
    const on = layoutSequence(parseSequence('autoNumber on\nA > B: x\nopt {\n  B > A: y\n}'));
    expect(on.messages.map((m) => m.number)).toEqual(['1', '2']);
    const nested = layoutSequence(parseSequence('autoNumber nested\nA > B: x\nopt {\n  B > A: y\n  A > B: z\n}'));
    expect(nested.messages.map((m) => m.number)).toEqual(['1', '1.1', '1.2']);
  });
});

describe('sequence participant order', () => {
  it('follows a dragged order, appending participants it does not name', async () => {
    const { parseSequence } = await import('../src/dsl/sequence');
    const { layoutSequence } = await import('../src/sequence/sequence');
    const seq = parseSequence('A > B: x\nB > C: y');
    const names = (order?: string[]) => [...layoutSequence(seq, { order }).participants].sort((a, b) => a.x - b.x).map((p) => p.participant.name);
    expect(names()).toEqual(['A', 'B', 'C']);
    expect(names(['C', 'A'])).toEqual(['C', 'A', 'B']);
  });
});
