import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildView, layoutView, parseDiagram } from '../src';

const dir = new URL('../corpus/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.eraser')).sort();

describe('layout corpus', () => {
  it('has the examples', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it.each(files)('%s parses cleanly and lays out', async (file) => {
    const diagram = parseDiagram(readFileSync(new URL(file, dir), 'utf8'));
    expect(diagram.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(diagram.diagnostics.map((d) => `${d.line}: ${d.message}`)).toEqual([]);
    const layout = await layoutView(buildView(diagram, { focus: null }), { direction: diagram.settings.direction });
    expect(layout.nodes.length).toBeGreaterThan(5);
    expect(layout.edges.every((e) => e.points.length >= 2)).toBe(true);
    // No two boxes in the same container overlap.
    const overlaps: string[] = [];
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.id >= b.id || a.parent !== b.parent) continue;
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps.push(`${a.id} / ${b.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });
});
