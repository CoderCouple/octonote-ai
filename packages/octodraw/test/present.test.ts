import { describe, expect, it } from 'vitest';
import type { CanvasItem } from '../src/canvas/model';
import { moveSlide, presentationSlides, setSlideHidden, setSlideNotes, visibleSlides } from '../src/canvas/present';
import * as Y from 'yjs';
import { readCanvas, writeCanvas } from '../src/collab/sync';

const figure = (id: string, x: number, y: number, title?: string): CanvasItem => ({ id, type: 'figure', x, y, w: 400, h: 300, source: title ? `title ${title}\nA > B` : 'A > B' });

describe('presentation slides', () => {
  it('orders figures and frames in reading order, rows first', () => {
    const slides = presentationSlides({
      version: 1,
      items: [figure('c', 0, 420, 'Third'), figure('b', 500, 20, 'Second'), figure('a', 0, 0, 'First'), { id: 'f', type: 'frame', device: 'phone', x: 1000, y: 0, w: 240, h: 480, title: 'Sign up' }],
    });
    expect(slides.map((s) => s.title)).toEqual(['First', 'Second', 'Sign up', 'Third']);
    expect(slides[0]).toMatchObject({ id: 'a', figure: true });
    expect(slides[2]).toMatchObject({ id: 'f', figure: false });
  });

  it('a figure inside a frame is part of the frame slide', () => {
    const slides = presentationSlides({ version: 1, items: [{ id: 'f', type: 'frame', device: 'desktop', x: 0, y: 0, w: 900, h: 600 }, figure('inner', 50, 50)] });
    expect(slides.map((s) => s.id)).toEqual(['f']);
    expect(slides[0]!.title).toBe('Desktop');
  });

  it('a canvas without figures or frames is one slide; an empty one has none', () => {
    expect(presentationSlides({ version: 1, items: [{ id: 's', type: 'sticky', x: 10, y: 10, w: 200, h: 200, text: 'Hi' }] })).toEqual([{ id: null, title: 'Canvas', box: { x: 10, y: 10, w: 200, h: 200 }, figure: false }]);
    expect(presentationSlides({ version: 1, items: [] })).toEqual([]);
  });

  it('reorders, hides and annotates slides; new figures join at the end', () => {
    let doc = { version: 1 as const, items: [figure('a', 0, 0, 'A'), figure('b', 500, 0, 'B'), figure('c', 1000, 0, 'C')] };
    doc = moveSlide(doc, 'c', 0);
    expect(presentationSlides(doc).map((s) => s.id)).toEqual(['c', 'a', 'b']);
    doc = setSlideHidden(doc, 'a', true);
    doc = setSlideNotes(doc, 'b', 'Say hello');
    expect(visibleSlides(doc).map((s) => s.id)).toEqual(['c', 'b']);
    expect(presentationSlides(doc).find((s) => s.id === 'b')!.notes).toBe('Say hello');
    doc = { ...doc, items: [...doc.items, figure('d', 0, 600, 'D')] };
    expect(presentationSlides(doc).map((s) => s.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(setSlideNotes(doc, 'b', '  ').presentation!.notes).toEqual({});
  });

  it('presentation settings sync through Yjs', () => {
    const ydoc = new Y.Doc();
    const doc = setSlideNotes({ version: 1, items: [figure('a', 0, 0)] }, 'a', 'Notes');
    writeCanvas(ydoc, doc);
    expect(readCanvas(ydoc).presentation).toEqual({ notes: { a: 'Notes' } });
  });
});
