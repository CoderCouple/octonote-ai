import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { readCanvas, writeCanvas } from '../src/collab/sync';
import { diffDocuments } from '../src/canvas/versions';
import {
  addItems,
  bendThrough,
  cloneItems,
  duplicateItems,
  emptyDocument,
  isCanvasDocument,
  itemAt,
  itemsInBox,
  lightTheme,
  darkTheme,
  lineBetween,
  lineGeometry,
  moveItems,
  renderCanvasSvg,
  resizeItems,
  resolveLines,
  type CanvasDocument,
  type LineItem,
  type ShapeItem,
} from '../src/index';

const shape = (id: string, x: number, y: number, extra: Partial<ShapeItem> = {}): ShapeItem => ({ id, type: 'shape', shape: 'rectangle', x, y, w: 100, h: 50, ...extra });
const close = (a: number, b: number, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('bent lines', () => {
  // Horizontal free line (0,0) → (200,0): n = (−dy, dx)/len = (0, 1), so a positive bend curves downwards (+y).
  const line: LineItem = { ...lineBetween({ x: 0, y: 0 }, { x: 200, y: 0 }, { bend: 40 }), id: 'l' };
  const doc = addItems(emptyDocument(), [line]);

  it('puts the control point at mid + 2·bend·n and the curve midpoint at mid + bend·n', () => {
    const g = lineGeometry(doc, line);
    expect(g.control).toEqual({ x: 100, y: 80 });
    close(g.mid.x, 100);
    close(g.mid.y, 40);
  });

  it('fits the box around the curve, not just the chord', () => {
    close(line.x, 0);
    close(line.y, 0);
    close(line.w, 200);
    close(line.h, 40);
  });

  it('hit-tests and marquee-selects along the curve', () => {
    expect(itemAt(doc, { x: 100, y: 40 })?.id).toBe('l');
    // On the chord but far from the curve.
    expect(itemAt(doc, { x: 100, y: 0 })).toBeUndefined();
    expect(itemsInBox(doc, { x: -1, y: -1, w: 202, h: 30 })).toHaveLength(0);
    expect(itemsInBox(doc, { x: -1, y: -1, w: 202, h: 42 })).toHaveLength(1);
  });

  it('exports a quadratic path with the label at the curve midpoint', () => {
    const { svg } = renderCanvasSvg(addItems(emptyDocument(), [{ ...line, text: 'curvy' }]), { theme: lightTheme, padding: 0 });
    expect(svg).toMatch(/d="M0 0Q100 80 200 0"/);
    expect(svg).toContain('curvy');
    // Label at mid (100, 40) + 4 baseline offset.
    expect(svg).toMatch(/<text x="100" y="44"/);
  });

  it('straight lines still export M…L', () => {
    const { svg } = renderCanvasSvg(addItems(emptyDocument(), [{ ...line, bend: undefined }]), { theme: lightTheme, padding: 0 });
    expect(svg).toContain('d="M0 0L200 0"');
  });

  it('aims attached ends along the tangent so they sit on the outline', () => {
    const a = shape('a', 0, 0);
    const b = shape('b', 300, 0);
    const l: LineItem = { ...lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b' }, { bend: -60 }), id: 'l' };
    const d = resolveLines(addItems(emptyDocument(), [a, b, l]));
    const g = lineGeometry(d, d.items[2] as LineItem);
    // Start leaves a's box (grown by the 4px gap) through its top or right edge, towards the control point (above: negative bend → −y).
    expect(g.control!.y).toBeLessThan(25);
    const onEdge = (p: { x: number; y: number }, box: ShapeItem) => {
      const gx = Math.min(Math.abs(p.x - (box.x - 4)), Math.abs(p.x - (box.x + box.w + 4)));
      const gy = Math.min(Math.abs(p.y - (box.y - 4)), Math.abs(p.y - (box.y + box.h + 4)));
      return Math.min(gx, gy) < 0.5;
    };
    expect(onEdge(g.start, a)).toBe(true);
    expect(onEdge(g.end, b)).toBe(true);
    // Tangent direction at the start points from the centre's side out towards the control point.
    expect(g.start.y).toBeLessThan(25);
    // The stored box covers the curve.
    const stored = d.items[2] as LineItem;
    expect(stored.y).toBeLessThan(Math.min(g.start.y, g.end.y));
  });

  it('bendThrough measures the drag from the straight line and snaps near it', () => {
    expect(bendThrough(doc, line, { x: 100, y: 30 })).toBe(30);
    expect(bendThrough(doc, line, { x: 100, y: -25 })).toBe(-25);
    expect(bendThrough(doc, line, { x: 100, y: 2 })).toBeUndefined();
  });

  it('keeps bend through move, duplicate, clone and group resize', () => {
    expect((moveItems(doc, ['l'], 10, 10).items[0] as LineItem).bend).toBe(40);
    const dup = duplicateItems(doc, ['l']);
    expect((dup.doc.items[1] as LineItem).bend).toBe(40);
    expect((cloneItems([line])[0] as LineItem).bend).toBe(40);
    const resized = resizeItems(doc, ['l'], { x: 0, y: 0, w: 200, h: 40 }, { x: 0, y: 0, w: 400, h: 80 }).items[0] as LineItem;
    close(resized.bend!, 80);
    close(resized.h, 80);
  });
});

describe('anchored endpoints', () => {
  const a = shape('a', 0, 0, { w: 100, h: 100 });
  const b = shape('b', 300, 0, { w: 100, h: 100 });

  it('clips at the outline where the line toward an inside anchor enters the shape', () => {
    // End aims at b's point (0.25, 0.25) = (325, 25); the start is a free point level with it.
    const l: LineItem = { ...lineBetween({ x: 100, y: 25 }, { x: 0, y: 0, item: 'b', anchor: { x: 0.25, y: 0.25 } }), id: 'l' };
    const d = resolveLines(addItems(emptyDocument(), [b, l]));
    const g = lineGeometry(d, d.items[1] as LineItem);
    close(g.end.x, 296); // left edge minus the 4px gap
    close(g.end.y, 25);
  });

  it('ends at the anchor when it lies outside the grown outline', () => {
    const ellipse = shape('e', 300, 0, { w: 100, h: 100, shape: 'ellipse' });
    // The top-left corner of the box is outside the ellipse.
    const l: LineItem = { ...lineBetween({ x: 100, y: 0 }, { x: 0, y: 0, item: 'e', anchor: { x: 0, y: 0 } }), id: 'l' };
    const g = lineGeometry(addItems(emptyDocument(), [ellipse, l]), l);
    expect(g.end).toEqual({ x: 300, y: 0 });
  });

  it('aims the other end at the anchor and leaves anchor-less ends at the centre', () => {
    const l: LineItem = { ...lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b', anchor: { x: 0.5, y: 0.1 } }), id: 'l' };
    const d = resolveLines(addItems(emptyDocument(), [a, b, l]));
    const g = lineGeometry(d, d.items[2] as LineItem);
    // Start: from a's centre (50, 50) toward (350, 10) — leaves through a's right edge above the centre.
    close(g.start.x, 104);
    expect(g.start.y).toBeLessThan(50);
    // End: on b's grown outline, on the segment toward (350, 10).
    expect(g.end.x).toBeGreaterThan(295);
    expect(g.end.x).toBeLessThan(350);
  });

  it('respects rotation', () => {
    const r = shape('r', 300, 0, { w: 100, h: 100, rotation: 90 });
    // Anchor (0.1, 0.5) sits left of centre; turned 90° clockwise it is above the centre at (350, 10).
    const l: LineItem = { ...lineBetween({ x: 350, y: -200 }, { x: 0, y: 0, item: 'r', anchor: { x: 0.1, y: 0.5 } }), id: 'l' };
    const g = lineGeometry(addItems(emptyDocument(), [r, l]), l);
    close(g.end.x, 350);
    close(g.end.y, -4);
  });

  it('survives duplicate (copied with the item) and is dropped when the item is left behind', () => {
    const l: LineItem = { ...lineBetween({ x: 0, y: 0, item: 'a', anchor: { x: 1, y: 0.5 } }, { x: 0, y: 0, item: 'b', anchor: { x: 0, y: 0.5 } }), id: 'l' };
    const both = cloneItems([a, b, l]);
    expect((both[2] as LineItem).start.anchor).toEqual({ x: 1, y: 0.5 });
    expect((both[2] as LineItem).end.anchor).toEqual({ x: 0, y: 0.5 });
    const alone = cloneItems([l])[0] as LineItem;
    expect(alone.start.anchor).toBeUndefined();
    expect(alone.start.item).toBeUndefined();
  });
});

describe('shape styling in export', () => {
  const render = (extra: Partial<ShapeItem>, theme = lightTheme) => renderCanvasSvg(addItems(emptyDocument(), [shape('s', 0, 0, { w: 200, h: 100, text: 'Hi', ...extra })]), { theme, padding: 0 }).svg;

  it('defaults to a centred label and the tint fill', () => {
    const svg = render({});
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain(`fill="${lightTheme.node.fill}"`);
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('aligns the label left/right and top/bottom', () => {
    const left = render({ align: 'left', valign: 'top' });
    expect(left).toContain('text-anchor="start"');
    expect(left).toMatch(/<text x="8" y="8"/);
    const right = render({ align: 'right', valign: 'bottom' });
    expect(right).toContain('text-anchor="end"');
    const lineHeight = lightTheme.text.node.size * 1.3;
    expect(right).toContain(`<text x="192" y="${100 - 8 - lineHeight}"`);
  });

  it('draws dashed outlines with the line dash', () => {
    expect(render({ dashed: true })).toContain('stroke-dasharray="6 5"');
  });

  it('fills none / solid from theme tokens with readable text', () => {
    expect(render({ fill: 'none' })).toMatch(/<path d="M[^"]*" fill="none"/);
    const blue = render({ fill: 'solid', color: 'blue' });
    expect(blue).toContain(`fill="${lightTheme.palette.blue.solid}"`);
    expect(blue).toContain(`fill="${lightTheme.palette.blue.onSolid}"`);
    const plainDark = render({ fill: 'solid' }, darkTheme);
    expect(plainDark).toContain(`fill="${darkTheme.node.stroke}"`);
    expect(plainDark).toContain(`fill="${darkTheme.color.canvas}"`);
  });
});

describe('new fields in collaboration, versions and validation', () => {
  const doc: CanvasDocument = {
    version: 1,
    items: [
      shape('a', 0, 0, { align: 'left', valign: 'bottom', dashed: true, fill: 'none', text: 'A' }),
      shape('b', 300, 0),
      { ...lineBetween({ x: 0, y: 0, item: 'a', anchor: { x: 0.9, y: 0.2 } }, { x: 0, y: 0, item: 'b' }, { bend: -12.5 }), id: 'l' },
    ],
  };

  it('round-trips through a Y.Doc', () => {
    const ydoc = new Y.Doc();
    writeCanvas(ydoc, doc);
    expect(readCanvas(ydoc)).toEqual(doc);
    // A second client sees per-field updates.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(ydoc));
    const changed = { ...doc, items: doc.items.map((i) => (i.id === 'l' ? { ...i, bend: 30 } : i.id === 'b' ? { ...i, fill: 'solid' as const } : i)) };
    writeCanvas(ydoc, changed);
    Y.applyUpdate(other, Y.encodeStateAsUpdate(ydoc));
    expect(readCanvas(other)).toEqual(changed);
    // Clearing an optional field removes it.
    const cleared = { ...doc, items: doc.items.map((i) => (i.id === 'a' ? { ...i, dashed: undefined } : i)) };
    writeCanvas(ydoc, JSON.parse(JSON.stringify(cleared)));
    expect('dashed' in readCanvas(ydoc).items[0]!).toBe(false);
  });

  it('counts style changes as edits in version diffs', () => {
    const edited = { ...doc, items: doc.items.map((i) => (i.id === 'a' ? { ...i, valign: 'top' as const } : i)) };
    expect(diffDocuments(doc, edited).changed).toEqual(['a']);
  });

  it('accepts valid fields and rejects bad types', () => {
    expect(isCanvasDocument(doc)).toBe(true);
    const bad = (patch: Record<string, unknown>, id = 'a') => ({ ...doc, items: doc.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    expect(isCanvasDocument(bad({ align: 'middle' }))).toBe(false);
    expect(isCanvasDocument(bad({ valign: 'center' }))).toBe(false);
    expect(isCanvasDocument(bad({ dashed: 'yes' }))).toBe(false);
    expect(isCanvasDocument(bad({ fill: 'pattern' }))).toBe(false);
    expect(isCanvasDocument(bad({ bend: '10' }, 'l'))).toBe(false);
    expect(isCanvasDocument(bad({ bend: Number.NaN }, 'l'))).toBe(false);
    expect(isCanvasDocument(bad({ start: { x: 0, y: 0, item: 'a', anchor: { x: 'left', y: 0 } } }, 'l'))).toBe(false);
    expect(isCanvasDocument({ version: 1, items: [null] })).toBe(false);
  });
});
