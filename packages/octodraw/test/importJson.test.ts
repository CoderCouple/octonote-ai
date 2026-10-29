import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importEraserJson, looksLikeEraserJson } from '../src';

const fixture = readFileSync(new URL('./fixtures/eraser-food-delivery.json', import.meta.url), 'utf8');

describe('importEraserJson', () => {
  const { title, layout, diagnostics } = importEraserJson(fixture);
  const node = (id: string) => layout.nodes.find((n) => n.id === id)!;

  it('detects JSON input', () => {
    expect(looksLikeEraserJson(fixture)).toBe(true);
    expect(looksLikeEraserJson('A > B')).toBe(false);
  });

  it('reads the title, shapes, groups and relationships', () => {
    expect(diagnostics).toEqual([]);
    expect(title).toBe('Food delivery');
    expect(layout.nodes.filter((n) => n.kind === 'group').map((n) => n.id)).toEqual(['forkway', 'apps', 'services', 'ordersvc']);
    expect(layout.edges).toHaveLength(13);
  });

  it('keeps texts, icons, colors and nesting', () => {
    expect(node('diner')).toMatchObject({ lines: ['Diner'], description: ['Person'], properties: { icon: 'user' }, style: { fill: '#f1f5f9', stroke: '#94a3b8' }, parent: null, depth: 0 });
    expect(node('forkway')).toMatchObject({ lines: ['Forkway · software system'], properties: { icon: 'truck', color: 'blue' } });
    expect(node('orderapi')).toMatchObject({ parent: 'ordersvc', depth: 3 });
    expect(node('ordersdb').properties.shape).toBe('cylinder');
  });

  it('orders parents before children and shifts to a padded origin', () => {
    const index = (id: string) => layout.nodes.findIndex((n) => n.id === id);
    expect(index('forkway')).toBeLessThan(index('services'));
    expect(index('services')).toBeLessThan(index('orderapi'));
    expect(Math.min(...layout.nodes.map((n) => n.x))).toBe(24);
  });

  it('converts relative points and label placement to absolute coordinates', () => {
    const r7 = layout.edges.find((e) => e.id === 'r7')!;
    const gw = node('gw');
    const api = node('orderapi');
    expect(r7.points).toHaveLength(4);
    expect(r7.points[0]!.y).toBeCloseTo(gw.y + gw.height, 0);
    expect(r7.points.at(-1)!.y).toBeCloseTo(api.y, 0);
    const r1 = layout.edges.find((e) => e.id === 'r1')!;
    expect(r1.label?.text).toBe('orders food');
    expect(r1.label!.x + r1.label!.width / 2).toBeCloseTo(r1.points[0]!.x, 0);
  });

  it('maps line styles and colors', () => {
    const r11 = layout.edges.find((e) => e.id === 'r11')!;
    expect(r11).toMatchObject({ dashed: true, endArrow: true, startArrow: false, color: undefined });
    expect(layout.edges.find((e) => e.id === 'r14')?.color).toBe('green');
  });

  it('reports invalid JSON as a diagnostic', () => {
    expect(importEraserJson('{ "elements": [').diagnostics[0]).toMatchObject({ severity: 'error' });
  });
});
