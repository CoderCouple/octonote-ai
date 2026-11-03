import { describe, expect, it } from 'vitest';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';
import { renderSourceSvg } from '../src/export/source';
import { lightTheme } from '../src/theme/tokens';

describe('renderSourceSvg', () => {
  it('renders every diagram type from code alone', async () => {
    for (const t of FIGURE_TEMPLATES) {
      const { svg, width, height } = await renderSourceSvg(t.source, { theme: lightTheme, iconSet: 'open' });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(width).toBeGreaterThan(100);
      expect(height).toBeGreaterThan(50);
    }
  });

  it('applies top-level hand placements', async () => {
    const a = await renderSourceSvg('A > B', { theme: lightTheme, iconSet: 'open' });
    const b = await renderSourceSvg('A > B', { theme: lightTheme, iconSet: 'open', placements: { '': { B: { x: 600, y: 24 } } } });
    expect(b.width).toBeGreaterThan(a.width);
  });

  it('styleMode watercolor paints washes', async () => {
    const plain = await renderSourceSvg('A [color: blue] > B', { theme: lightTheme, iconSet: 'open' });
    const wc = await renderSourceSvg('styleMode watercolor\nA [color: blue] > B', { theme: lightTheme, iconSet: 'open' });
    expect(plain.svg).not.toContain('od-watercolor');
    expect(wc.svg).toContain('filter="url(#od-watercolor-a)"');
  });

  it('widens the picture to fit a long title', async () => {
    const short = await renderSourceSvg('A > B', { theme: lightTheme, title: true });
    const title = 'A very long title that is much wider than the little diagram underneath it';
    const long = await renderSourceSvg(`title ${title}\nA > B`, { theme: lightTheme, title: true, measureText: (text, font) => text.length * font.size * 0.6 });
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.width).toBeGreaterThanOrEqual(title.length * lightTheme.text.title.size * 0.6);
  });
});
