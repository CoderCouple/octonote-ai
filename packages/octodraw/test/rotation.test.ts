import { describe, expect, it } from 'vitest';
import { CANVAS_TEMPLATES } from '../src/canvas/templates';
import { boundsOf, commentPosition, itemAt, itemsInBox, lineBetween, offsetInItem, outlinePoint, resizeRotatedBox, resolveLines, rotateItems, rotatedBounds, type CanvasDocument, type CanvasItem } from '../src/canvas/model';

const box = (id: string, x: number, y: number, w: number, h: number, rotation?: number): CanvasItem => ({ id, type: 'shape', shape: 'rectangle', x, y, w, h, rotation });
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('rotation', () => {
  it('bounds and hit testing follow the turned outline', () => {
    const item = box('a', 0, 0, 200, 20, 90);
    const b = rotatedBounds(item, 90);
    close(b.x, 90);
    close(b.y, -90);
    close(b.w, 20);
    close(b.h, 200);
    const doc: CanvasDocument = { version: 1, items: [item] };
    expect(itemAt(doc, { x: 100, y: -80 }, 0)?.id).toBe('a');
    expect(itemAt(doc, { x: 10, y: 10 }, 0)).toBeUndefined();
    expect(itemsInBox(doc, { x: 85, y: -95, w: 30, h: 210 })).toHaveLength(1);
    expect(boundsOf([item])!.h).toBeCloseTo(200);
  });

  it('turns a single item in place and a group about its centre', () => {
    const doc: CanvasDocument = { version: 1, items: [box('a', 0, 0, 100, 50), box('b', 200, 0, 100, 50)] };
    const one = rotateItems(doc, ['a'], 45);
    expect(one.items[0]).toMatchObject({ x: 0, y: 0, rotation: 45 });
    const both = rotateItems(doc, ['a', 'b'], 90);
    // Centres (50,25) and (250,25) orbit the group centre (150,25).
    expect(both.items[0]!.x + 50).toBeCloseTo(150);
    expect(both.items[0]!.y + 25).toBeCloseTo(-75);
    expect(both.items[1]!.y + 25).toBeCloseTo(125);
    expect(rotateItems(one, ['a'], 315).items[0]!.rotation).toBeUndefined();
  });

  it('attached lines meet the turned outline', () => {
    const a = box('a', 0, 0, 200, 20, 90); // vertical bar centred at (100,10)
    const free = outlinePoint(a, { x: 100, y: -300 }, 0);
    close(free.x, 100);
    close(free.y, -90);
    const line = lineBetween({ x: 100, y: 10, item: 'a' }, { x: 100, y: -300 });
    const doc = resolveLines({ version: 1, items: [a, line] });
    expect((doc.items[1] as { start: { y: number } }).start.y).toBeCloseTo(-94);
  });

  it('resizing a turned item keeps the opposite side in place', () => {
    const b = { x: 0, y: 0, w: 100, h: 50 };
    // Turned 90°: the item's east edge points down on screen; drag it 30 down.
    const next = resizeRotatedBox(b, 90, 'e', 0, 30);
    expect(next.w).toBeCloseTo(130);
    expect(next.h).toBeCloseTo(50);
    // The west edge (top on screen) stays at y = centre.y - w/2 = 25 - 50 = -25.
    expect(next.y + next.h / 2 - next.w / 2).toBeCloseTo(-25);
  });

  it('comments stay pinned to the same spot of a turned item', () => {
    const item = box('a', 0, 0, 100, 50, 30);
    const p = { x: 70, y: 40 };
    const thread = { id: 't', item: 'a', ...offsetInItem(item, p), messages: [] };
    const at = commentPosition({ version: 1, items: [item] }, thread);
    close(at.x, p.x);
    close(at.y, p.y);
  });
});

describe('canvas templates', () => {
  it('build fresh items whose lines point at items in the template', () => {
    for (const t of CANVAS_TEMPLATES) {
      const a = t.build();
      const b = t.build();
      expect(a.length).toBeGreaterThan(2);
      expect(a[0]!.id).not.toBe(b[0]!.id);
      const ids = new Set(a.map((i) => i.id));
      for (const item of a) if (item.type === 'line') for (const end of [item.start, item.end]) if (end.item) expect(ids.has(end.item)).toBe(true);
    }
  });
});
