import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { updateItem, type CanvasDocument, type CanvasItem } from '../src/canvas/model';
import { createVersion, diffDocuments, localVersionStore, sameDocument } from '../src/canvas/versions';
import { yjsVersionStore } from '../src/collab/versions';

const shape = (id: string, x = 0): CanvasItem => ({ id, type: 'shape', shape: 'rectangle', x, y: 0, w: 100, h: 50 });
const doc = (...items: CanvasItem[]): CanvasDocument => ({ version: 1, items });

describe('version history', () => {
  it('diffs documents by item', () => {
    const a = doc(shape('keep'), shape('gone'), shape('edit'));
    const b = updateItem(doc(shape('keep'), shape('edit'), shape('new')), 'edit', { x: 9 });
    expect(diffDocuments(a, b)).toEqual({ added: ['new'], removed: ['gone'], changed: ['edit'] });
    expect(sameDocument(a, structuredClone(a))).toBe(true);
    expect(sameDocument(a, b)).toBe(false);
  });

  it('versions are deep copies', () => {
    const d = doc(shape('a'));
    const v = createVersion(d, { name: 'First', author: { id: 'u', name: 'U' } });
    (d.items[0] as { x: number }).x = 50;
    expect(v.doc.items[0]).toMatchObject({ x: 0 });
    expect(v).toMatchObject({ name: 'First', author: { name: 'U' } });
  });

  it('local store keeps named versions and trims old automatic ones', () => {
    const store = localVersionStore(undefined, { limit: 2 });
    let calls = 0;
    store.subscribe(() => calls++);
    store.save(createVersion(doc(), { name: 'Named', at: 1 }));
    for (let i = 2; i <= 5; i++) store.save(createVersion(doc(), { auto: true, at: i }));
    expect(store.list().map((v) => v.name ?? v.at)).toEqual([5, 4, 'Named']);
    const id = store.list()[0]!.id;
    store.rename(id, 'Renamed');
    expect(store.list()[0]!.name).toBe('Renamed');
    store.remove(id);
    expect(store.list()).toHaveLength(2);
    expect(calls).toBe(7);
  });

  it('a Y.Doc store is shared between collaborators', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (u: Uint8Array) => Y.applyUpdate(b, u));
    b.on('update', (u: Uint8Array) => Y.applyUpdate(a, u));
    const sa = yjsVersionStore(a);
    const sb = yjsVersionStore(b);
    let seen = 0;
    sb.subscribe(() => seen++);
    sa.save(createVersion(doc(shape('x')), { name: 'From A' }));
    expect(sb.list().map((v) => v.name)).toEqual(['From A']);
    expect(seen).toBe(1);
    sb.rename(sb.list()[0]!.id, 'Renamed by B');
    expect(sa.list()[0]!.name).toBe('Renamed by B');
  });
});
