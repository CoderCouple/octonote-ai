import { describe, expect, it } from 'vitest';
import { buildView, estimateTextWidth, layoutView, parseDiagram, wrapText } from '../src';
import type { DiagramLayout, LayoutNode } from '../src';

const layout = (source: string, focus: string | null = null, expandDepth?: number) => {
  const diagram = parseDiagram(source);
  return layoutView(buildView(diagram, { focus, expandDepth }), { direction: diagram.settings.direction });
};
const byId = (l: DiagramLayout) => new Map(l.nodes.map((n) => [n.id, n]));
const contains = (outer: LayoutNode, inner: LayoutNode) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe('layoutView', () => {
  it('flows left to right by default and top to bottom with direction down', async () => {
    const right = byId(await layout('A > B'));
    expect(right.get('B')!.x).toBeGreaterThan(right.get('A')!.x + right.get('A')!.width);
    const down = byId(await layout('direction down\nA > B'));
    expect(down.get('B')!.y).toBeGreaterThan(down.get('A')!.y + down.get('A')!.height);
  });

  it('places children inside their groups in absolute coordinates', async () => {
    const l = await layout('Outer {\n  Inner {\n    A > B\n  }\n  C\n}\nD > A');
    const n = byId(l);
    expect(contains(n.get('Outer')!, n.get('Inner')!)).toBe(true);
    expect(contains(n.get('Inner')!, n.get('A')!)).toBe(true);
    expect(n.get('Outer')!.depth).toBe(0);
    expect(n.get('A')!.depth).toBe(2);
    // Parents are listed before children.
    expect(l.nodes.findIndex((x) => x.id === 'Outer')).toBeLessThan(l.nodes.findIndex((x) => x.id === 'A'));
  });

  it('routes orthogonal edges that start and end on their nodes', async () => {
    const l = await layout('G {\n  A\n}\nA > B: hello');
    const n = byId(l);
    const edge = l.edges[0]!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < edge.points.length; i++) {
      const [p, q] = [edge.points[i - 1]!, edge.points[i]!];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
    const near = (p: { x: number; y: number }, node: LayoutNode) =>
      p.x >= node.x - 1 && p.x <= node.x + node.width + 1 && p.y >= node.y - 1 && p.y <= node.y + node.height + 1;
    expect(near(edge.points[0]!, n.get('A')!)).toBe(true);
    expect(near(edge.points.at(-1)!, n.get('B')!)).toBe(true);
    expect(edge.label?.text).toBe('hello');
  });

  it('labels merged edges with their count', async () => {
    const l = await layout('G {\n  A\n  B\n}\nU > A\nU > B', null, 0);
    expect(l.edges.find((e) => e.to === 'G')).toMatchObject({ count: 2, label: { text: '×2' } });
  });

  it('lays out a drilled-in view with externals', async () => {
    const l = await layout('G { A > B }\nU > A', 'G');
    expect(l.nodes.map((n) => [n.id, n.kind])).toEqual([
      ['A', 'node'],
      ['B', 'node'],
      ['U', 'external'],
    ]);
  });
});

describe('descriptions', () => {
  it('adds description lines to nodes and collapsed groups', async () => {
    const l = await layout('API [description: "Kotlin, Spring Boot"]\nG [collapsed: true] { A\n B }');
    const n = byId(l);
    expect(n.get('API')!.description).toEqual(['Kotlin, Spring Boot']);
    expect(n.get('G')!.description).toEqual(['2 items inside']);
  });

  it('shows a group description inline in the title, like Eraser', async () => {
    const n = byId(await layout('G [description: software system] { A }'));
    expect(n.get('G')!.lines).toEqual(['G · software system']);
    expect(n.get('G')!.description).toEqual([]);
  });
});

describe('wrapText', () => {
  it('wraps on words and honours explicit newlines', () => {
    const font = { size: 10, weight: 400 };
    expect(wrapText('one two three', font, 50, estimateTextWidth)).toEqual(['one two', 'three']);
    expect(wrapText('a\nb', font, 1000, estimateTextWidth)).toEqual(['a', 'b']);
  });
});

describe('legend and shapes', () => {
  it('places the legend outside the diagram on the requested side', async () => {
    const right = await layout('A > B\nlegend { [color: red, label: Error] }');
    const box = (l: DiagramLayout) => ({ maxX: Math.max(...l.nodes.map((n) => n.x + n.width)), maxY: Math.max(...l.nodes.map((n) => n.y + n.height)), minX: Math.min(...l.nodes.map((n) => n.x)) });
    expect(right.legend?.items).toEqual([{ label: 'Error', color: 'red', connection: undefined, icon: undefined, shape: undefined }]);
    expect(right.legend!.x).toBeGreaterThan(box(right).maxX);
    const below = await layout('A > B\nlegend [position: bottom-left] { [color: red, label: Error] }');
    expect(below.legend!.y).toBeGreaterThan(box(below).maxY);
    const left = await layout('A > B\nlegend [position: left] { [color: red, label: Error] }');
    expect(left.legend!.x + left.legend!.width).toBeLessThan(box(left).minX);
    expect(left.legend!.x).toBeGreaterThanOrEqual(0);
  });

  it('gives decision-style shapes room for their text', async () => {
    const n = byId(await layout('A\nB [shape: diamond]\nC [shape: star]'));
    expect(n.get('B')!.height).toBeGreaterThanOrEqual(96);
    expect(n.get('B')!.width).toBeGreaterThan(n.get('A')!.width);
    expect(n.get('C')!.height).toBeGreaterThanOrEqual(120);
  });
});

describe('column alignment', () => {
  it('never stretches a group over a sibling', async () => {
    const l = await layout('direction down\nOuter {\n  Apps {\n    A\n    B\n    C\n  }\n  Gateway\n  Services {\n    D\n  }\n  Bus\n}\nA, B, C > Gateway > D\nD --> Bus\nBus > B');
    const boxes = l.nodes.filter((n) => n.parent === 'Outer');
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

describe('flowchart "no" branches', () => {
  it('go beside the decision on its row, and the main path stays straight', async () => {
    const l = await layout(`direction down
Start [shape: oval]
Valid input? [shape: diamond]
Save
Show error
End [shape: oval]
Start > Valid input?
Valid input? > Save: yes
Valid input? > Show error: no
Save > End
Show error > Start
`);
    const n = (id: string) => l.nodes.find((x) => x.id === id)!;
    const cx = (id: string) => n(id).x + n(id).width / 2;
    const cy = (id: string) => n(id).y + n(id).height / 2;
    for (const id of ['Valid input?', 'Save', 'End']) expect(cx(id)).toBeCloseTo(cx('Start'));
    expect(cy('Show error')).toBeCloseTo(cy('Valid input?'));
    expect(n('Show error').x).toBeGreaterThan(n('Valid input?').x + n('Valid input?').width);
  });
});
