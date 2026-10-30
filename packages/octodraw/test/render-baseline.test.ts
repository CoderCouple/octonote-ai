import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildView, darkTheme, layoutView, lightTheme, parseDiagram, renderDiagramSvg } from '../src';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';
import { renderSourceSvg } from '../src/export/source';

// Regression guard for per-element styling: diagrams that don't use the new
// properties (textSize, border, line, startArrow, …) must render exactly as
// before. The snapshot holds a hash of the layout and the SVG per example;
// it was recorded with the renderer from before those properties existed.
// Regenerate with `vitest run -u` only after an intended visual change.

const dir = new URL('../corpus/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.eraser')).sort();
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

describe('output is unchanged without the new properties', () => {
  // The corridor router's repair passes stop at a wall-clock deadline, so under
  // load the same input can route differently. A frozen clock never reaches it.
  beforeAll(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it.each(files)('%s', async (file) => {
    const diagram = parseDiagram(readFileSync(new URL(file, dir), 'utf8'));
    const view = buildView(diagram, { focus: null });
    const out: Record<string, string> = {};
    for (const engine of ['eraser', 'elk'] as const) {
      const layout = await layoutView(view, { direction: diagram.settings.direction, engine });
      out[`${engine} layout`] = hash(JSON.stringify(layout));
      out[`${engine} light`] = hash(renderDiagramSvg({ layout, settings: diagram.settings, theme: lightTheme, iconSet: 'open' }).svg);
    }
    const layout = await layoutView(view, { direction: diagram.settings.direction, typography: darkTheme.text });
    out['eraser dark'] = hash(renderDiagramSvg({ layout, settings: diagram.settings, theme: darkTheme, iconSet: 'open' }).svg);
    expect(out).toMatchSnapshot();
  });

  it('figure templates', async () => {
    const out: Record<string, string> = {};
    for (const t of FIGURE_TEMPLATES) out[t.id] = hash((await renderSourceSvg(t.source, { theme: lightTheme, iconSet: 'open' })).svg);
    expect(out).toMatchSnapshot();
  });
});
