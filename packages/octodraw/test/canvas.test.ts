import { describe, expect, it } from 'vitest';
import {
  addComment,
  addItems,
  commentPosition,
  renderCanvasSvg,
  replyToComment,
  resizeItems,
  selectionToSource,
  snapBox,
  lightTheme,
  duplicateItems,
  emptyDocument,
  getItem,
  itemAt,
  itemsInBox,
  lineBetween,
  lineEnds,
  moveItems,
  penFromPoints,
  removeItems,
  reorderItems,
  resizeBox,
  resizeItem,
  copyStyle,
  pasteStyle,
  STYLE_KEYS,
  type CanvasDocument,
  type LineItem,
  type ShapeItem,
  type TextItem,
} from '../src/index';

const shape = (id: string, x: number, y: number, w = 100, h = 50, kind: ShapeItem['shape'] = 'rectangle'): ShapeItem => ({ id, type: 'shape', shape: kind, x, y, w, h });
const ids = (doc: CanvasDocument) => doc.items.map((i) => i.id);

describe('canvas model', () => {
  const base = addItems(emptyDocument(), [shape('a', 0, 0), shape('b', 300, 0), shape('c', 0, 200)]);

  it('reorders layers', () => {
    expect(ids(reorderItems(base, ['a'], 'front'))).toEqual(['b', 'c', 'a']);
    expect(ids(reorderItems(base, ['c'], 'back'))).toEqual(['c', 'a', 'b']);
    expect(ids(reorderItems(base, ['a'], 'forward'))).toEqual(['b', 'a', 'c']);
    expect(ids(reorderItems(base, ['a', 'b'], 'forward'))).toEqual(['c', 'a', 'b']);
    expect(ids(reorderItems(base, ['c'], 'backward'))).toEqual(['a', 'c', 'b']);
    expect(ids(reorderItems(base, ['a'], 'backward'))).toEqual(['a', 'b', 'c']);
  });

  it('attaches lines to items and keeps them attached when items move', () => {
    const line = lineBetween({ x: 50, y: 25, item: 'a' }, { x: 350, y: 25, item: 'b' });
    let doc = addItems(base, [line]);
    let ends = lineEnds(doc, getItem(doc, line.id) as LineItem);
    expect(ends.start.x).toBeCloseTo(104); // right edge of a + 4px gap
    expect(ends.end.x).toBeCloseTo(296);
    doc = moveItems(doc, ['b'], 0, 200);
    ends = lineEnds(doc, getItem(doc, line.id) as LineItem);
    expect(ends.end.y).toBeLessThan(225);
    expect(ends.end.y).toBeGreaterThan(190);
    // Deleting an end item leaves a free end where it was.
    doc = removeItems(doc, ['b']);
    const after = getItem(doc, line.id) as LineItem;
    expect(after.end.item).toBeUndefined();
    expect(after.end).toMatchObject({ x: 350, y: 225 });
  });

  it('meets ellipses and diamonds on their outline', () => {
    const doc = addItems(emptyDocument(), [shape('e', 0, 0, 100, 100, 'ellipse'), shape('d', 300, 0, 100, 100, 'diamond')]);
    const line = lineBetween({ x: 0, y: 0, item: 'e' }, { x: 0, y: 0, item: 'd' });
    const ends = lineEnds(addItems(doc, [line]), line);
    expect(ends.start.x).toBeCloseTo(104);
    expect(ends.end.x).toBeCloseTo(296);
  });

  it('duplicates with new ids and remaps links between copies', () => {
    const line = lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b' });
    const doc = addItems(base, [line]);
    const result = duplicateItems(doc, ['a', 'b', line.id]);
    expect(result.ids).toHaveLength(3);
    const copy = getItem(result.doc, result.ids[2]!) as LineItem;
    expect(copy.start.item).toBe(result.ids[0]);
    expect(copy.end.item).toBe(result.ids[1]);
    expect(getItem(result.doc, result.ids[0]!)).toMatchObject({ x: 24, y: 24 });
  });

  it('resizes from any handle, optionally keeping the ratio', () => {
    const box = { x: 0, y: 0, w: 100, h: 50 };
    expect(resizeBox(box, 'se', 20, 10)).toEqual({ x: 0, y: 0, w: 120, h: 60 });
    expect(resizeBox(box, 'nw', 20, 10)).toEqual({ x: 20, y: 10, w: 80, h: 40 });
    expect(resizeBox(box, 'se', 100, 0, true)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(resizeBox(box, 'w', 200, 0)).toMatchObject({ w: 8, x: 92 });
  });

  it('stops auto-sizing a figure the user resized', () => {
    const doc = addItems(emptyDocument(), [{ id: 'f', type: 'figure', x: 0, y: 0, w: 400, h: 300, source: 'A > B', autoSize: true }]);
    expect(getItem(resizeItem(doc, 'f', { x: 0, y: 0, w: 500, h: 300 }), 'f')).toMatchObject({ w: 500, autoSize: false });
  });

  it('hit tests the topmost item, lines by distance, and marquee containment', () => {
    const line = lineBetween({ x: 0, y: 100 }, { x: 400, y: 100 });
    const doc = addItems(base, [shape('top', 20, 10, 40, 20), line]);
    expect(itemAt(doc, { x: 30, y: 15 })?.id).toBe('top');
    expect(itemAt(doc, { x: 200, y: 103 })?.id).toBe(line.id);
    expect(itemAt(doc, { x: 200, y: 160 })).toBeUndefined();
    expect(itemsInBox(doc, { x: -10, y: -10, w: 150, h: 80 }).map((i) => i.id)).toEqual(['a', 'top']);
  });

  it('normalizes pen strokes to their box', () => {
    const pen = penFromPoints([{ x: 10, y: 10 }, { x: 110, y: 60 }]);
    expect(pen).toMatchObject({ x: 10, y: 10, w: 100, h: 50 });
    expect(pen.points).toEqual([[0, 0], [1, 1]]);
  });
});

describe('canvas model, part 2', () => {
  it('snaps edges and centres within the threshold', () => {
    const others = [{ x: 0, y: 0, w: 100, h: 50 }];
    const r = snapBox({ x: 104, y: 200, w: 100, h: 50 }, others, 6);
    expect(r.dx).toBe(-4); // left edge onto the other's right edge
    expect(r.guides.x?.at).toBe(100);
    expect(r.dy).toBe(0);
    expect(snapBox({ x: 300, y: 3, w: 100, h: 50 }, others, 6)).toMatchObject({ dx: 0, dy: -3 });
    expect(snapBox({ x: 300, y: 60, w: 10, h: 10 }, others, 6).guides.y).toBeUndefined();
  });

  it('scales a multi-selection, keeping attached lines attached', () => {
    const doc = addItems(emptyDocument(), [shape('a', 0, 0), shape('b', 200, 0), lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b' })]);
    const next = resizeItems(doc, ['a', 'b'], { x: 0, y: 0, w: 300, h: 50 }, { x: 0, y: 0, w: 600, h: 100 });
    expect(getItem(next, 'b')).toMatchObject({ x: 400, w: 200, h: 100 });
    const line = next.items[2] as LineItem;
    expect(lineEnds(next, line).end.x).toBeCloseTo(396);
  });

  it('turns hand-drawn boxes and arrows into diagram code', () => {
    const doc = addItems(emptyDocument(), [
      { ...shape('a', 0, 0), text: 'Web app', color: 'blue' },
      { ...shape('b', 300, 0, 100, 100, 'ellipse'), text: 'Queue' },
      { id: 'i', type: 'icon', name: 'postgres', x: 0, y: 200, w: 48, h: 48 },
      { ...lineBetween({ x: 0, y: 0, item: 'a' }, { x: 0, y: 0, item: 'b' }), id: 'l1', text: 'jobs' },
      { ...lineBetween({ x: 0, y: 0, item: 'b' }, { x: 0, y: 0, item: 'i' }), id: 'l2', dashed: true },
    ]);
    expect(selectionToSource(doc, ['a', 'b', 'i', 'l1', 'l2'])).toBe('Web app [color: blue]\nQueue [shape: oval]\npostgres [icon: postgres]\n\nWeb app > Queue: jobs\nQueue --> postgres\n');
  });

  it('pins comments to items and drops them with the item', () => {
    let doc = addItems(emptyDocument(), [shape('a', 100, 100)]);
    doc = addComment(doc, { id: 't', item: 'a', x: 100, y: 0, messages: [{ id: 'm1', author: { id: 'u', name: 'Ada' }, text: 'Hi', at: 1 }] });
    doc = replyToComment(doc, 't', { id: 'm2', author: { id: 'v', name: 'Bo' }, text: 'Hello', at: 2 });
    expect(doc.comments![0]!.messages).toHaveLength(2);
    expect(commentPosition(moveItems(doc, ['a'], 50, 0), doc.comments![0]!)).toEqual({ x: 250, y: 100 });
    expect(removeItems(doc, ['a']).comments).toEqual([]);
  });

  it('exports the canvas as one SVG', () => {
    const doc = addItems(emptyDocument(), [
      { ...shape('a', 0, 0), text: 'Hello' },
      { id: 's', type: 'sticky', x: 200, y: 0, w: 120, h: 120, text: 'Note' },
      { id: 'f', type: 'figure', x: 0, y: 200, w: 200, h: 100, source: 'A > B' },
    ]);
    const figureSvgs = new Map([['f', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect/></svg>']]);
    const { svg, width, height } = renderCanvasSvg(doc, { theme: lightTheme, figureSvgs });
    expect(width).toBe(320 + 64);
    expect(height).toBe(300 + 64);
    expect(svg).toContain('Hello');
    expect(svg).toContain('Note');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" x="0" y="200" width="200" height="100" viewBox="0 0 400 200">');
  });
});

describe('comment mentions', () => {
  it('finds the people whose @name is still in the text', async () => {
    const { mentionsIn } = await import('../src/canvas/model');
    const people = [{ id: 'a', name: 'Ada Lovelace' }, { id: 'g', name: 'Grace Hopper' }, { id: 'a', name: 'Ada Lovelace' }];
    expect(mentionsIn('@Ada Lovelace can you check? cc @Grace', people).map((p) => p.id)).toEqual(['a']);
    expect(mentionsIn('thanks @Grace Hopper and @Ada Lovelace', people).map((p) => p.id)).toEqual(['a', 'g']);
  });
});

describe('copy and paste with comments', () => {
  it('clones comment threads pinned to copied items onto the copies', async () => {
    const { cloneWithComments } = await import('../src/canvas/model');
    const author = { id: 'u', name: 'U' };
    const { items, comments } = cloneWithComments(
      {
        version: 1,
        items: [{ id: 'a', type: 'sticky', x: 0, y: 0, w: 100, h: 100, text: 'A' }],
        comments: [
          { id: 't1', item: 'a', x: 10, y: 10, messages: [{ id: 'm1', author, text: 'hi', at: 1 }] },
          { id: 't2', item: 'elsewhere', x: 0, y: 0, messages: [] },
        ],
      },
      24,
      24,
    );
    expect(items[0]!.id).not.toBe('a');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ item: items[0]!.id, x: 10, y: 10 });
    expect(comments[0]!.id).not.toBe('t1');
    expect(comments[0]!.messages[0]).toMatchObject({ text: 'hi' });
    expect(comments[0]!.messages[0]!.id).not.toBe('m1');
  });
});

describe('copy and paste style', () => {
  const styledShape: ShapeItem = { ...shape('a', 0, 0), strokeColor: 'blue', fillColor: 'green', strokeWidth: 4, strokeStyle: 'dotted', fill: 'solid', opacity: 0.5, fontSize: 24, italic: true, font: 'serif', align: 'left' };
  const plain = shape('b', 300, 0);
  const text: TextItem = { id: 't', type: 'text', x: 0, y: 200, w: 40, h: 26, text: 'Hi', fontSize: 20, color: 'red' };
  const line: LineItem = { ...lineBetween({ x: 0, y: 300 }, { x: 200, y: 300 }, { startArrow: true, dashed: true, color: 'purple' }), id: 'l' };
  const base = addItems(emptyDocument(), [styledShape, plain, text, line]);

  it('copies every style field of the type, unset ones included', () => {
    const style = copyStyle(plain);
    expect(Object.keys(style).sort()).toEqual([...STYLE_KEYS.shape].sort());
    expect(Object.values(style).every((v) => v === undefined)).toBe(true);
    // Legacy fields come out under their new names.
    expect(copyStyle(line)).toMatchObject({ strokeStyle: 'dashed', startHead: 'arrow', endHead: 'arrow', color: 'purple' });
  });

  it('pastes a shape style onto a shape and clears what the source lacks', () => {
    const pasted = pasteStyle(base, ['b'], copyStyle(styledShape));
    const { id: _a, x: _ax, ...wanted } = styledShape;
    expect(getItem(pasted, 'b')).toMatchObject({ ...wanted, id: 'b', x: 300 });
    const cleared = pasteStyle(pasted, ['b'], copyStyle(shape('c', 0, 0)));
    expect(JSON.parse(JSON.stringify(getItem(cleared, 'b')))).toEqual({ id: 'b', type: 'shape', shape: 'rectangle', x: 300, y: 0, w: 100, h: 50 });
  });

  it('pastes only the fields the target has', () => {
    // Line → shape: colour, width, dash and opacity; never arrowheads.
    const fromLine = getItem(pasteStyle(base, ['a'], copyStyle(line)), 'a') as ShapeItem & Record<string, unknown>;
    expect(fromLine).toMatchObject({ color: 'purple', strokeStyle: 'dashed', fill: 'solid', fillColor: 'green' });
    expect(fromLine.strokeWidth).toBeUndefined();
    expect(fromLine.startHead).toBeUndefined();
    // Shape → text: the label style; a text item keeps its size when the source has none.
    const toText = getItem(pasteStyle(base, ['t'], copyStyle(styledShape)), 't') as TextItem & Record<string, unknown>;
    expect(toText).toMatchObject({ fontSize: 24, italic: true, font: 'serif', align: 'left', opacity: 0.5 });
    expect(toText.color).toBeUndefined();
    expect(toText.fillColor).toBeUndefined();
    expect((getItem(pasteStyle(base, ['t'], copyStyle(plain)), 't') as TextItem).fontSize).toBe(20);
    // Shape → line: width and dash replace the legacy flag.
    const toLine = getItem(pasteStyle(base, ['l'], copyStyle(styledShape)), 'l') as LineItem;
    expect(toLine).toMatchObject({ strokeWidth: 4, strokeStyle: 'dotted', opacity: 0.5, startArrow: true });
    expect(toLine.dashed).toBeUndefined();
    expect(toLine.color).toBeUndefined();
  });
});

describe('item links', () => {
  it('keeps only http(s) links', async () => {
    const { safeLink } = await import('../src/canvas/model');
    expect(safeLink({ link: 'https://octonote.ai/x' })).toBe('https://octonote.ai/x');
    expect(safeLink({ link: ' http://a.b ' })).toBe('http://a.b');
    expect(safeLink({ link: 'javascript:alert(1)' })).toBeUndefined();
    expect(safeLink({})).toBeUndefined();
  });
});
