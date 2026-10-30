import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildView, layoutView, lightTheme, parseDiagram, renderDiagramSvg } from '../src';
import type { DiagramLayout } from '../src';
import { renderSourceSvg } from '../src/export/source';
import { DiagramSvg } from '../src/react/DiagramSvg';

// Per-element style properties: textSize, textAlign, textColor, iconSize,
// border, strokeWidth on boxes and groups; line, strokeWidth, labelSize,
// routing, startArrow, endArrow on arrows. (The parser may still warn about
// them as unknown until it learns them; these tests only look at output.)

const parse = (source: string) => {
  const diagram = parseDiagram(source);
  expect(diagram.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return diagram;
};
const layout = async (source: string, engine: 'eraser' | 'elk' = 'eraser') => {
  const diagram = parse(source);
  return layoutView(buildView(diagram, { focus: null }), { direction: diagram.settings.direction, engine });
};
const node = (l: DiagramLayout, id: string) => l.nodes.find((n) => n.id === id)!;
const edge = (l: DiagramLayout, from: string) => l.edges.find((e) => e.from === from)!;
const svg = async (source: string) => (await renderSourceSvg(source, { theme: lightTheme, iconSet: 'open' })).svg;
const ICONS = 'A [icon: server]\nB [icon: database]\nC [icon: user]\nA > B\nB > C';

describe('per-element layout', () => {
  for (const engine of ['eraser', 'elk'] as const) {
    describe(engine, () => {
      it('textSize grows a card and its text', async () => {
        const name = 'Payment gateway';
        const plain = node(await layout(`${name}\nB`, engine), name);
        const large = node(await layout(`${name} [textSize: 24]\nB`, engine), name);
        expect(large.width).toBeGreaterThan(plain.width);
        expect(node(await layout('API [textSize: 40]', engine), 'API').height).toBeGreaterThan(node(await layout('API', engine), 'API').height);
        // Long text at a large size wraps onto more lines.
        const huge = node(await layout(`${name} [textSize: 48]\nB`, engine), name);
        expect(huge.lines.length).toBeGreaterThan(1);
        const small = node(await layout(`${name} [textSize: small]\nB`, engine), name);
        expect(small.width).toBeLessThanOrEqual(plain.width);
      });

      it('iconSize sizes icon nodes', async () => {
        const plain = node(await layout(ICONS, engine), 'A');
        expect(plain.variant).toBe('icon');
        expect(plain.width).toBe(50);
        const large = node(await layout(ICONS.replace('A [icon: server]', 'A [icon: server, iconSize: large]'), engine), 'A');
        expect(large.width).toBe(72);
        expect(large.height).toBe(72);
        expect(large.labelBox!.y).toBeGreaterThanOrEqual(large.y + 72);
        expect(node(await layout(ICONS.replace('A [icon: server]', 'A [icon: server, iconSize: 90]'), engine), 'A').width).toBe(90);
      });

      it('labelSize changes the label box', async () => {
        const plain = edge(await layout('A > B: some label', engine), 'A').label!;
        const large = edge(await layout('A > B: some label [labelSize: large]', engine), 'A').label!;
        expect(large.width).toBeGreaterThan(plain.width);
        expect(large.height).toBeGreaterThan(plain.height);
        expect(edge(await layout('A > B: some label [labelSize: large]', engine), 'A').labelSize).toBe(16);
      });

      it('routing straight gives a two-point line from outline to outline', async () => {
        const l = await layout('direction down\nA\nB\nC\nA > B\nA > C: go [routing: straight]\nB > C', engine);
        const e = l.edges.find((x) => x.from === 'A' && x.to === 'C')!;
        expect(e.routing).toBe('straight');
        expect(e.points).toHaveLength(2);
        const [p, q] = e.points as [{ x: number; y: number }, { x: number; y: number }];
        const onOutline = (pt: { x: number; y: number }, id: string) => {
          const n = node(l, id);
          const eps = 0.01;
          const inside = pt.x >= n.x - eps && pt.x <= n.x + n.width + eps && pt.y >= n.y - eps && pt.y <= n.y + n.height + eps;
          const onEdge = Math.abs(pt.x - n.x) < eps || Math.abs(pt.x - n.x - n.width) < eps || Math.abs(pt.y - n.y) < eps || Math.abs(pt.y - n.y - n.height) < eps;
          return inside && onEdge;
        };
        expect(onOutline(p, 'A')).toBe(true);
        expect(onOutline(q, 'C')).toBe(true);
        // The label sits on the line's middle.
        const label = e.label!;
        expect(label.x + label.width / 2).toBeCloseTo((p.x + q.x) / 2, 0);
        expect(label.y + label.height / 2).toBeCloseTo((p.y + q.y) / 2, 0);
      });
    });
  }

  it('straight lines meet a diamond on its drawn outline', async () => {
    const l = await layout('A [shape: diamond]\nB\nA > B [routing: straight]');
    const a = node(l, 'A');
    const [p] = edge(l, 'A').points;
    // |dx|/hw + |dy|/hh = 1 on a diamond.
    const r = Math.abs(p!.x - (a.x + a.width / 2)) / (a.width / 2) + Math.abs(p!.y - (a.y + a.height / 2)) / (a.height / 2);
    expect(r).toBeCloseTo(1, 5);
  });

  it('group textSize grows the header', async () => {
    const plain = await layout('G {\n  A\n}');
    const big = await layout('G [textSize: 40] {\n  A\n}');
    expect(node(big, 'G').height).toBeGreaterThan(node(plain, 'G').height);
    expect(node(big, 'A').y - node(big, 'G').y).toBeGreaterThan(node(plain, 'A').y - node(plain, 'G').y);
  });

  it('arrowhead properties override the connector', async () => {
    const l = await layout('A > B [startArrow: dot, endArrow: none]\nC - D [endArrow: open]\nE <> F [line: dotted, strokeWidth: thick]');
    expect(edge(l, 'A')).toMatchObject({ startArrow: true, endArrow: false, startHead: 'dot' });
    expect(edge(l, 'A').endHead).toBeUndefined();
    expect(edge(l, 'C')).toMatchObject({ startArrow: false, endArrow: true, endHead: 'open' });
    expect(edge(l, 'E')).toMatchObject({ startArrow: true, endArrow: true, dotted: true, dashed: false, strokeWidth: 2.5 });
    // `line: solid` turns a dashed connector solid.
    expect(edge(await layout('A --> B [line: solid]'), 'A').dashed).toBe(false);
    expect(edge(await layout('A --> B'), 'A').dashed).toBe(true);
  });

  it('leaves edges without properties untouched', async () => {
    const e = edge(await layout('A > B: x'), 'A');
    for (const key of ['startHead', 'endHead', 'dotted', 'strokeWidth', 'labelSize', 'routing']) expect(e).not.toHaveProperty(key);
  });
});

describe('per-element rendering', () => {
  it('draws card text size, alignment and colour', async () => {
    const out = await svg('A [textSize: 22, textAlign: left, textColor: red]\nB [textAlign: right, textColor: #ff00aa]\nA > B');
    expect(out).toContain('font-size="22"');
    expect(out).toContain('text-anchor="start"');
    expect(out).toContain('text-anchor="end"');
    expect(out).toContain(`fill="${lightTheme.palette.red.ink}"`);
    expect(out).toContain('fill="#ff00aa"');
  });

  it('draws borders: dashed, dotted and width on cards and groups', async () => {
    const out = await svg('G [border: dotted, strokeWidth: 2] {\n  A [border: dashed]\n  B [strokeWidth: thick, shape: diamond]\n}\nA > B');
    expect(out).toContain('stroke-dasharray="5 4"');
    expect(out).toMatch(/stroke-width="2" [^>]*stroke-dasharray="1 7" stroke-linecap="round"/);
    expect(out).toContain('stroke-width="2.5"');
  });

  it('draws arrow width, dots and every arrowhead', async () => {
    const plain = await svg('A > B');
    expect(plain).toContain('<polygon');
    expect(plain).not.toContain('<circle');

    const out = await svg('A > B [startArrow: dot, endArrow: open, strokeWidth: 2, line: dotted]\nC > D [endArrow: none]');
    expect(out).toMatch(/stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/);
    expect(out).toMatch(/<circle[^>]+r="/);
    expect(out).toMatch(/<polyline[^>]+stroke-width="2"/);
    // C > D has no head at all: only one filled triangle would come from it otherwise.
    const heads = (s: string) => (s.match(/<polygon/g) ?? []).length;
    expect(heads(await svg('C > D [endArrow: none]'))).toBe(0);
  });

  it('dashed arrows grow their dashes with strokeWidth; defaults stay 6 5', async () => {
    expect(await svg('A --> B')).toContain('stroke-dasharray="6 5"');
    expect(await svg('A --> B [strokeWidth: 2]')).toContain('stroke-dasharray="12 10"');
  });

  it('draws the arrow label at its labelSize', async () => {
    expect(await svg('A > B: hello [labelSize: 20]')).toMatch(/font-size="20"[^>]*>hello</);
  });

  it('trims the line to each head', async () => {
    const l = await layout('direction down\nA\nB\nA > B [routing: straight, endArrow: dot]');
    const e = edge(l, 'A');
    const body = renderToStaticMarkup(createElement(DiagramSvg, { layout: l, settings: parse('A').settings, theme: lightTheme, drillable: new Set<string>(), animation: 'none', iconSet: 'open' }));
    const d = body.match(/<path d="([^"]+)" fill="none"/)![1]!;
    const lastY = Number(d.trim().split(/[ ,L]+/).at(-1));
    const tip = e.points[1]!;
    const circle = body.match(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/)!;
    // The line ends at the dot's centre; the dot touches the outline.
    expect(lastY).toBeCloseTo(Number(circle[2]), 5);
    expect(Number(circle[2]) + Number(circle[3])).toBeCloseTo(tip.y, 5);
  });
});

describe('clickable edges', () => {
  const render = (l: DiagramLayout, props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(DiagramSvg, { layout: l, settings: parse('A').settings, theme: lightTheme, drillable: new Set<string>(), animation: 'none', iconSet: 'open', ...props }));

  it('adds hit paths with data-edge-id only when selectable', async () => {
    const l = await layout('A > B\nB > C');
    expect(render(l, {})).not.toContain('data-edge-id');
    const out = render(l, { onSelectEdge: () => {}, zoom: 2 });
    for (const e of l.edges) expect(out).toContain(`data-edge-id="${e.id}"`);
    // 12px on screen at zoom 2.
    expect(out).toMatch(/class="od-edge-hit" data-edge-id="[^"]+" d="[^"]+" fill="none" stroke="transparent" stroke-width="6"/);
    expect(out).toContain('.od-edge:hover .od-edge-hover');
  });

  it('draws the selected edge in the accent colour with end handles', async () => {
    const l = await layout('A > B');
    const out = render(l, { onSelectEdge: () => {}, selectedEdge: l.edges[0]!.id });
    expect(out).toContain(`stroke="${lightTheme.color.accent}"`);
    expect(out).toContain('data-edge-handle="start"');
    expect(out).toContain('data-edge-handle="end"');
  });

  it('exports never carry hit paths', async () => {
    const diagram = parse('A > B');
    const l = await layout('A > B');
    expect(renderDiagramSvg({ layout: l, settings: diagram.settings, theme: lightTheme, iconSet: 'open' }).svg).not.toContain('od-edge');
  });

  it('marks icon-node labels and outlines a selected one', async () => {
    const l = await layout(ICONS);
    expect(render(l, {})).not.toContain('data-node-label-id');
    const out = render(l, { onSelect: () => {}, onSelectLabel: () => {}, selectedLabel: 'A' });
    expect(out).toContain('data-node-label-id="A"');
    expect(out).toContain('od-label-selected');
  });
});
