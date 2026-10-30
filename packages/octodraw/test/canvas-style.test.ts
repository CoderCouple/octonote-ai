import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { SelectionBar, type BarMenu } from '../src/canvas/SelectionBar';
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
  colorPartPatch,
  lineHeads,
  lineRoute,
  patchItems,
  pointOnLine,
  routePatch,
  strokeStyleOf,
  wholeColorPatch,
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

describe('stroke, colour, text and line-end styling', () => {
  const doc: CanvasDocument = {
    version: 1,
    items: [
      shape('a', 0, 0, { strokeColor: 'blue', fillColor: '#ffeecc', textColor: 'red', strokeWidth: 2.5, strokeStyle: 'dotted', opacity: 0.5, fontSize: 18, bold: true, italic: true, font: 'serif' }),
      { id: 'n', type: 'sticky', x: 0, y: 100, w: 200, h: 200, text: 'N', textColor: 'gray', fontSize: 20, font: 'hand' },
      { id: 't', type: 'text', x: 0, y: 400, w: 50, h: 20, text: 'T', fontSize: 20, italic: true, font: 'mono' },
      { ...lineBetween({ x: 0, y: 0 }, { x: 200, y: 100 }, { startHead: 'dot', endHead: 'diamond', route: 'elbow', strokeWidth: 4, strokeStyle: 'dashed' }), id: 'l', opacity: 0.25 },
      { id: 'p', type: 'pen', x: 0, y: 0, w: 10, h: 10, points: [[0, 0], [1, 1]], strokeWidth: 1 },
    ],
  };
  const bad = (patch: Record<string, unknown>, id = 'a') => ({ ...doc, items: doc.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  it('validation accepts the new fields and rejects bad values', () => {
    expect(isCanvasDocument(doc)).toBe(true);
    expect(isCanvasDocument(bad({ opacity: 0 }))).toBe(false);
    expect(isCanvasDocument(bad({ opacity: 1.5 }))).toBe(false);
    expect(isCanvasDocument(bad({ opacity: '0.5' }))).toBe(false);
    expect(isCanvasDocument(bad({ strokeWidth: 'thick' }))).toBe(false);
    expect(isCanvasDocument(bad({ strokeWidth: 0 }))).toBe(false);
    expect(isCanvasDocument(bad({ strokeStyle: 'wavy' }))).toBe(false);
    expect(isCanvasDocument(bad({ font: 'comic' }))).toBe(false);
    expect(isCanvasDocument(bad({ italic: 'yes' }))).toBe(false);
    expect(isCanvasDocument(bad({ fontSize: -4 }))).toBe(false);
    expect(isCanvasDocument(bad({ strokeColor: 'red;background:url(x)' }))).toBe(false);
    expect(isCanvasDocument(bad({ fillColor: '"><script>' }))).toBe(false);
    expect(isCanvasDocument(bad({ textColor: 'rgb(1, 2, 3)' }))).toBe(true);
    expect(isCanvasDocument(bad({ fontSize: 'big' }, 'n'))).toBe(false);
    expect(isCanvasDocument(bad({ startHead: 'triangle' }, 'l'))).toBe(false);
    expect(isCanvasDocument(bad({ endHead: true }, 'l'))).toBe(false);
    expect(isCanvasDocument(bad({ route: 'zigzag' }, 'l'))).toBe(false);
    expect(isCanvasDocument(bad({ startArrow: 'yes' }, 'l'))).toBe(false);
  });

  it('reads the legacy fields', () => {
    const legacy: LineItem = { ...lineBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, { startArrow: true, dashed: true }), id: 'x' };
    expect(lineHeads(legacy)).toEqual({ start: 'arrow', end: 'arrow' });
    expect(strokeStyleOf(legacy)).toBe('dashed');
    expect(strokeStyleOf({ dashed: true, strokeStyle: 'dotted' })).toBe('dotted');
    expect(lineHeads({ ...legacy, startHead: 'none' })).toEqual({ start: 'none', end: 'arrow' });
    expect(lineRoute(legacy)).toBe('straight');
    expect(lineRoute({ bend: 20 })).toBe('curved');
    expect(lineRoute({ bend: 20, route: 'straight' })).toBe('straight');
    expect(lineRoute({ bend: 20, route: 'elbow' })).toBe('elbow');
  });

  it('writes the new fields and drops the legacy ones', () => {
    const legacy: LineItem = { ...lineBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, { startArrow: true, dashed: true }), id: 'x' };
    const d = patchItems(addItems(emptyDocument(), [legacy]), ['x'], () => ({ strokeStyle: 'dotted', startHead: 'open' }));
    const line = d.items[0] as LineItem;
    expect(line).toMatchObject({ strokeStyle: 'dotted', startHead: 'open', endArrow: true });
    expect(line.dashed).toBeUndefined();
    expect(line.startArrow).toBeUndefined();
    expect(JSON.parse(JSON.stringify(line))).not.toHaveProperty('dashed');
  });

  it('draws elbow lines as three orthogonal segments through the midpoint', () => {
    const line: LineItem = { ...lineBetween({ x: 0, y: 0 }, { x: 200, y: 100 }, { route: 'elbow' }), id: 'e' };
    const d = addItems(emptyDocument(), [line]);
    const g = lineGeometry(d, line);
    expect(g.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }]);
    expect(g.mid).toEqual({ x: 100, y: 50 });
    expect(pointOnLine(g, 0.5)).toEqual({ x: 100, y: 50 });
    expect(pointOnLine(g, 1)).toEqual({ x: 200, y: 100 });
    expect({ x: line.x, y: line.y, w: line.w, h: line.h }).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(itemAt(d, { x: 100, y: 50 })?.id).toBe('e');
    expect(itemAt(d, { x: 50, y: 50 })).toBeUndefined();
    // Taller than wide: vertical first.
    const tall = lineGeometry(d, { ...line, end: { x: 100, y: 300 } });
    expect(tall.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 150 }, { x: 100, y: 150 }, { x: 100, y: 300 }]);
    // The bend is ignored (and kept for switching back to curved).
    expect(lineGeometry(d, { ...line, bend: 40 }).control).toBeUndefined();
  });

  it('leaves attached items sideways on an elbow', () => {
    const a = shape('a', 0, 0);
    const b = shape('b', 300, 200);
    const l: LineItem = { ...lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b' }, { route: 'elbow' }), id: 'l' };
    const d = resolveLines(addItems(emptyDocument(), [a, b, l]));
    const g = lineGeometry(d, d.items[2] as LineItem);
    close(g.start.x, 104);
    close(g.start.y, 25);
    close(g.end.x, 296);
    close(g.end.y, 225);
    expect(g.points![1]).toEqual({ x: 200, y: 25 });
    // Anchored ends keep their height.
    const anchored = { ...(d.items[2] as LineItem), start: { x: 0, y: 0, item: 'a', anchor: { x: 0.5, y: 0.2 } } };
    const ga = lineGeometry(d, anchored);
    close(ga.start.x, 104);
    close(ga.start.y, 10);
  });

  it('switches routes with routePatch', () => {
    const line: LineItem = { ...lineBetween({ x: 0, y: 0 }, { x: 200, y: 0 }), id: 'r' };
    const d = addItems(emptyDocument(), [line]);
    const curved = patchItems(d, ['r'], (i) => routePatch(i as LineItem, 'curved')).items[0] as LineItem;
    expect(curved.route).toBe('curved');
    expect(curved.bend).toBe(40);
    close(curved.h, 40);
    const elbow = patchItems({ ...d, items: [curved] }, ['r'], (i) => routePatch(i as LineItem, 'elbow')).items[0] as LineItem;
    expect(lineRoute(elbow)).toBe('elbow');
    expect(elbow.bend).toBe(40);
    close(elbow.h, 0);
    const straight = patchItems({ ...d, items: [elbow] }, ['r'], (i) => routePatch(i as LineItem, 'straight')).items[0] as LineItem;
    expect(straight.route).toBeUndefined();
    expect(straight.bend).toBeUndefined();
  });

  it('splits a shape colour into border and fill before changing one part', () => {
    const s = shape('s', 0, 0, { color: 'blue' });
    const patch = colorPartPatch(s, 'fill', 'green');
    expect(patch).toEqual({ color: undefined, strokeColor: 'blue', fillColor: 'green' });
    const recolored = { ...s, ...patch };
    const svg = renderCanvasSvg(addItems(emptyDocument(), [recolored]), { theme: lightTheme, padding: 0 }).svg;
    expect(svg).toContain(`stroke="${lightTheme.palette.blue.stroke}"`);
    expect(svg).toContain(`fill="${lightTheme.palette.green.nodeFill}"`);
    // Explicit parts keep the original look.
    const same = (item: ShapeItem) => renderCanvasSvg(addItems(emptyDocument(), [item]), { theme: lightTheme, padding: 0 }).svg;
    expect(same({ ...s, ...colorPartPatch(s, 'text', undefined) })).toBe(same(s));
    expect(same({ ...s, fill: 'solid', ...colorPartPatch({ ...s, fill: 'solid' }, 'text', undefined) })).toBe(same({ ...s, fill: 'solid' }));
    expect(colorPartPatch({ id: 'n', type: 'sticky', x: 0, y: 0, w: 1, h: 1, text: '' }, 'fill', 'pink')).toEqual({ color: 'pink' });
    expect(colorPartPatch({ id: 'n', type: 'sticky', x: 0, y: 0, w: 1, h: 1, text: '' }, 'text', 'red')).toEqual({ textColor: 'red' });
    expect(wholeColorPatch({ ...s, ...patch }, 'red')).toEqual({ color: 'red', strokeColor: undefined, fillColor: undefined, textColor: undefined });
  });

  it('the selection bar shows only what the selection can use', () => {
    const bar = (items: CanvasDocument['items'], menu: BarMenu | null = null) =>
      renderToStaticMarkup(
        createElement(SelectionBar, {
          box: { x: 0, y: 200, w: 100, h: 50 },
          cam: { x: 0, y: 0, k: 1 },
          items,
          theme: lightTheme,
          menu,
          onMenu: () => {},
          onStyle: () => {},
          onArrange: () => {},
          onDuplicate: () => {},
          onDelete: () => {},
          onLock: () => {},
          onLink: () => {},
          onCopyStyle: () => {},
        }),
      );
    const [s, n, t, l, p] = doc.items as [ShapeItem, CanvasDocument['items'][number], CanvasDocument['items'][number], LineItem, CanvasDocument['items'][number]];
    const shapes = bar([s]);
    for (const label of ['Shape', 'Colour', 'Stroke and opacity', 'Text', 'Arrange: layer order and rotation', 'More']) expect(shapes).toContain(`aria-label="${label}"`);
    expect(shapes).not.toContain('aria-label="Line route"');
    const lines = bar([l]);
    for (const label of ['Colour', 'Stroke and opacity', 'Line route', 'Start arrowhead', 'End arrowhead']) expect(lines).toContain(`aria-label="${label}"`);
    expect(lines).not.toContain('aria-label="Text"');
    const texts = bar([t]);
    expect(texts).toContain('aria-label="Text"');
    expect(texts).toContain('aria-label="Opacity"');
    expect(texts).not.toContain('aria-label="Shape"');
    // Mixed: only the shared controls.
    const mixed = bar([s, l, p]);
    expect(mixed).toContain('aria-label="Colour"');
    expect(mixed).toContain('aria-label="Stroke and opacity"');
    expect(mixed).not.toContain('aria-label="Text"');
    expect(mixed).not.toContain('aria-label="Line route"');
    // Sub-menus: tabs for shapes, Mixed values, previews.
    const color = bar([s], 'color');
    expect(color).toContain('>Border<');
    expect(color).toContain('>Fill<');
    expect(bar([n], 'color')).toContain('>Paper<');
    const text = bar([s, t], 'text');
    expect(text).toContain('Mixed');
    expect(text).toContain('aria-label="Italic"');
    expect(bar([s], 'text')).toContain('18px');
    expect(bar([l], 'end')).toContain('aria-checked="true"');
    expect(bar([s, l], 'stroke')).toContain('aria-label="Line width"');
    expect(bar([t], 'stroke')).not.toContain('aria-label="Line width"');
  });

  it('keeps old documents drawing exactly as before', () => {
    const old: CanvasDocument = {
      version: 1,
      items: [shape('a', 0, 0, { text: 'A', dashed: true, color: 'blue' }), { ...lineBetween({ x: 0, y: 100 }, { x: 200, y: 100 }, { startArrow: true }), id: 'l' }, { id: 'n', type: 'sticky', x: 0, y: 200, w: 100, h: 100, text: 'N' }],
    };
    const svg = renderCanvasSvg(old, { theme: lightTheme, padding: 0 }).svg;
    expect(svg).toContain('stroke-width="1.25" stroke-dasharray="6 5"');
    expect(svg).toContain('stroke-width="1.5"');
    expect(svg).not.toContain('opacity=');
    expect(svg).not.toContain('font-style');
    expect(svg).toContain('<path d="M0 0L10 5L0 10z"');
    expect(svg.match(/<marker /g)).toHaveLength(2);
  });
});
