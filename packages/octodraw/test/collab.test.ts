import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { replyToComment, moveItems, updateItem, type CanvasDocument, type CanvasItem } from '../src/canvas/model';
import { assignZ, CanvasSync, readCanvas, seedCanvas, updateText, writeCanvas } from '../src/collab/sync';

const shape = (id: string, x = 0): CanvasItem => ({ id, type: 'shape', shape: 'rectangle', x, y: 0, w: 100, h: 50 });
const figure = (id: string, source: string): CanvasItem => ({ id, type: 'figure', x: 0, y: 0, w: 300, h: 200, source });
const doc = (...items: CanvasItem[]): CanvasDocument => ({ version: 1, items });

/** Two peers that exchange updates on demand. */
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  return { a, b, sync };
}

describe('collaboration (Yjs)', () => {
  it('round-trips a document, including order, comments and optional fields', () => {
    const ydoc = new Y.Doc();
    const d: CanvasDocument = { ...doc(shape('a'), figure('f', 'A > B'), { ...shape('b'), rotation: 30 }), comments: [{ id: 't', x: 1, y: 2, messages: [] }] };
    writeCanvas(ydoc, d);
    expect(readCanvas(ydoc)).toEqual(d);
    // Removing a field and reordering.
    const next = doc({ ...shape('b') }, shape('a'));
    writeCanvas(ydoc, next);
    expect(readCanvas(ydoc)).toEqual(next);
  });

  it('merges concurrent edits to different items and different fields', () => {
    const { a, b, sync } = pair();
    writeCanvas(a, doc(shape('s1'), shape('s2', 200)));
    sync();
    writeCanvas(a, moveItems(readCanvas(a), ['s1'], 10, 0));
    writeCanvas(b, updateItem(readCanvas(b), 's1', { color: 'blue' }));
    writeCanvas(b, updateItem(readCanvas(b), 's2', { text: 'hi' }));
    sync();
    const merged = readCanvas(a);
    expect(merged).toEqual(readCanvas(b));
    expect(merged.items[0]).toMatchObject({ id: 's1', x: 10, color: 'blue' });
    expect(merged.items[1]).toMatchObject({ id: 's2', text: 'hi' });
  });

  it('keeps both inserts made at the same time', () => {
    const { a, b, sync } = pair();
    writeCanvas(a, doc(shape('base')));
    sync();
    writeCanvas(a, doc(...readCanvas(a).items, shape('fromA')));
    writeCanvas(b, doc(...readCanvas(b).items, shape('fromB')));
    sync();
    expect(readCanvas(a).items.map((i) => i.id).sort()).toEqual(['base', 'fromA', 'fromB']);
    expect(readCanvas(a)).toEqual(readCanvas(b));
  });

  it('merges two people typing in the same figure code', () => {
    const { a, b, sync } = pair();
    writeCanvas(a, doc(figure('f', 'A > B\n')));
    sync();
    writeCanvas(a, updateItem(readCanvas(a), 'f', { source: 'Start > A > B\n' }));
    writeCanvas(b, updateItem(readCanvas(b), 'f', { source: 'A > B\nB > C\n' }));
    sync();
    expect((readCanvas(a).items[0] as { source: string }).source).toBe('Start > A > B\nB > C\n');
    expect(readCanvas(b)).toEqual(readCanvas(a));
  });

  it('updateText only touches the changed middle', () => {
    const t = new Y.Doc().getText('t');
    t.insert(0, 'hello world');
    updateText(t, 'hello brave world');
    expect(t.toString()).toBe('hello brave world');
    updateText(t, 'hello');
    expect(t.toString()).toBe('hello');
  });

  it('assignZ keeps numbers that are still in order', () => {
    const z: Record<string, number> = { a: 0, b: 1, c: 2 };
    expect(assignZ(['a', 'b', 'c'], (id) => z[id])).toEqual([0, 1, 2]);
    expect(assignZ(['b', 'c', 'a'], (id) => z[id])).toEqual([1, 2, 3]);
    expect(assignZ(['a', 'new', 'b'], (id) => z[id])).toEqual([0, 0.5, 1]);
    expect(assignZ(['x', 'a'], (id) => z[id])).toEqual([-1, 0]);
  });

  it('CanvasSync: live doc, stable identity, local-only undo', () => {
    const { a, b, sync } = pair();
    const local = new CanvasSync(a, { captureTimeout: 0 });
    let notified = 0;
    local.subscribe(() => notified++);
    local.apply(doc(shape('s1'), shape('s2', 200)));
    expect(local.doc.items).toHaveLength(2);
    expect(notified).toBeGreaterThan(0);
    const s2 = local.doc.items[1];
    local.apply(moveItems(local.doc, ['s1'], 5, 0));
    expect(local.doc.items[1]).toBe(s2); // untouched item keeps its object
    sync();
    // A peer's edit arrives; undo must not revert it.
    writeCanvas(b, updateItem(readCanvas(b), 's2', { color: 'red' }));
    sync();
    expect(local.doc.items[1]).toMatchObject({ color: 'red' });
    local.undo();
    expect(local.doc.items[0]).toMatchObject({ x: 0 });
    expect(local.doc.items[1]).toMatchObject({ color: 'red' });
    local.redo();
    expect(local.doc.items[0]).toMatchObject({ x: 5 });
    // Silent edits aren't undo steps.
    local.apply(updateItem(local.doc, 's1', { w: 300 }), { silent: true });
    local.undo();
    expect(local.doc.items[0]).toMatchObject({ x: 0, w: 300 });
    local.destroy();
  });

  it('CanvasSync resumes after destroy (React StrictMode) and catches up', () => {
    const ydoc = new Y.Doc();
    const sync = new CanvasSync(ydoc);
    sync.destroy();
    writeCanvas(ydoc, doc(shape('a')));
    expect(sync.doc.items).toHaveLength(0);
    let notified = 0;
    sync.subscribe(() => notified++);
    sync.connect();
    expect(sync.doc.items).toHaveLength(1);
    expect(notified).toBe(1);
    writeCanvas(ydoc, doc(shape('a'), shape('b')));
    expect(sync.doc.items).toHaveLength(2);
  });

  it('keeps both replies sent to a thread at the same time', () => {
    const { a, b, sync } = pair();
    const author = { id: 'u', name: 'U' };
    writeCanvas(a, { ...doc(shape('s')), comments: [{ id: 't', item: 's', x: 1, y: 1, messages: [{ id: 'm1', author, text: 'first', at: 1 }] }] });
    sync();
    writeCanvas(a, replyToComment(readCanvas(a), 't', { id: 'm2', author, text: 'from A', at: 2 }));
    writeCanvas(b, replyToComment(readCanvas(b), 't', { id: 'm3', author, text: 'from B', at: 3 }));
    sync();
    expect(readCanvas(a).comments![0]!.messages.map((m) => m.text)).toEqual(['first', 'from A', 'from B']);
    expect(readCanvas(b)).toEqual(readCanvas(a));
  });

  it('merges concurrent edits to a sticky note text', () => {
    const { a, b, sync } = pair();
    writeCanvas(a, doc({ id: 'n', type: 'sticky', x: 0, y: 0, w: 200, h: 200, text: 'Buy milk' }));
    sync();
    writeCanvas(a, updateItem(readCanvas(a), 'n', { text: 'Buy oat milk' }));
    writeCanvas(b, updateItem(readCanvas(b), 'n', { text: 'Buy milk today' }));
    sync();
    expect(readCanvas(a).items[0]).toMatchObject({ text: 'Buy oat milk today' });
  });

  it('assignZ renumbers when neighbours run out of precision', () => {
    const z: Record<string, number> = { a: 0, b: Number.MIN_VALUE };
    expect(assignZ(['a', 'new', 'b'], (id) => z[id])).toEqual([0, 1, 2]);
  });

  it('round-trips the style fields and merges two people styling one item', () => {
    const styled = doc(
      { ...shape('s'), strokeColor: 'blue', fillColor: '#ffeecc', textColor: 'red', strokeWidth: 2.5, strokeStyle: 'dotted', opacity: 0.5, fontSize: 18, bold: true, italic: true, font: 'serif' } as CanvasItem,
      { id: 'n', type: 'sticky', x: 0, y: 0, w: 200, h: 200, text: 'N', textColor: 'gray', fontSize: 20, font: 'hand' },
      { id: 'l', type: 'line', x: 0, y: 0, w: 200, h: 100, start: { x: 0, y: 0 }, end: { x: 200, y: 100 }, startHead: 'dot', endHead: 'diamond', route: 'elbow', strokeWidth: 4, opacity: 0.25 },
    );
    const ydoc = new Y.Doc();
    writeCanvas(ydoc, styled);
    expect(readCanvas(ydoc)).toEqual(styled);
    const { a, b, sync } = pair();
    writeCanvas(a, styled);
    sync();
    writeCanvas(a, updateItem(readCanvas(a), 's', { opacity: 0.8 }));
    writeCanvas(b, updateItem(readCanvas(b), 's', { strokeStyle: 'dashed', font: 'mono' }));
    writeCanvas(b, updateItem(readCanvas(b), 'l', { endHead: 'open', route: undefined }));
    sync();
    expect(readCanvas(a)).toEqual(readCanvas(b));
    expect(readCanvas(a).items[0]).toMatchObject({ opacity: 0.8, strokeStyle: 'dashed', font: 'mono', fillColor: '#ffeecc' });
    expect(readCanvas(a).items[2]).toMatchObject({ endHead: 'open', startHead: 'dot' });
    expect('route' in readCanvas(a).items[2]!).toBe(false);
  });

  it('seedCanvas fills only an empty doc', () => {
    const ydoc = new Y.Doc();
    expect(seedCanvas(ydoc, doc(shape('a')))).toBe(true);
    expect(seedCanvas(ydoc, doc(shape('b')))).toBe(false);
    expect(readCanvas(ydoc).items.map((i) => i.id)).toEqual(['a']);
  });
});
