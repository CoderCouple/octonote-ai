import { describe, expect, it } from 'vitest';
import { arrangeLayout, buildView, layoutView, parseDiagram } from '../src/index';

const SOURCE = `direction right
User
Cloud {
  API
  DB
}
User > API
API > DB
`;

async function setup() {
  const diagram = parseDiagram(SOURCE);
  const view = buildView(diagram, { focus: null });
  const auto = await layoutView(view, { direction: 'right' });
  const node = (layout: typeof auto, id: string) => layout.nodes.find((n) => n.id === id)!;
  return { view, auto, node };
}

describe('arrangeLayout', () => {
  it('returns the automatic layout when nothing is placed', async () => {
    const { view, auto } = await setup();
    expect(arrangeLayout(view, auto, undefined, {})).toBe(auto);
    expect(arrangeLayout(view, auto, { Missing: { x: 0, y: 0 } }, {})).toBe(auto);
  });

  it('moves a node and re-routes its edges', async () => {
    const { view, auto, node } = await setup();
    const user = node(auto, 'User');
    const next = arrangeLayout(view, auto, { User: { x: user.x, y: user.y + 300 } }, {});
    expect(node(next, 'User').y).toBe(user.y + 300);
    expect(node(next, 'API')).toMatchObject({ x: node(auto, 'API').x, y: node(auto, 'API').y });
    const edge = next.edges.find((e) => e.from === 'User')!;
    // The edge now starts near the moved node.
    const start = edge.points[0]!;
    const moved = node(next, 'User');
    expect(start.y).toBeGreaterThan(moved.y - 20);
    expect(start.y).toBeLessThan(moved.y + moved.height + 40);
  });

  it('moves a group together with its children', async () => {
    const { view, auto, node } = await setup();
    const cloud = node(auto, 'Cloud');
    const next = arrangeLayout(view, auto, { Cloud: { x: cloud.x + 100, y: cloud.y + 50 } }, {});
    expect(node(next, 'API').x - node(auto, 'API').x).toBe(100);
    expect(node(next, 'DB').y - node(auto, 'DB').y).toBe(50);
  });

  it('grows a group to keep a child that was dragged out of it', async () => {
    const { view, auto, node } = await setup();
    const cloud = node(auto, 'Cloud');
    const db = node(auto, 'DB');
    const next = arrangeLayout(view, auto, { DB: { x: db.x, y: cloud.y + cloud.height + 200 } }, {});
    const grown = node(next, 'Cloud');
    expect(grown.y + grown.height).toBeGreaterThan(node(next, 'DB').y + node(next, 'DB').height);
  });

  it('shifts everything back into view when a node moves past the top-left', async () => {
    const { view, auto, node } = await setup();
    const next = arrangeLayout(view, auto, { User: { x: -400, y: -300 } }, {});
    expect(next.offset!.x).toBeGreaterThan(0);
    expect(Math.min(...next.nodes.map((n) => n.x))).toBeGreaterThanOrEqual(24);
    expect(node(next, 'User').x).toBe(-400 + next.offset!.x);
  });

  it('resizes groups and cards but not icon nodes', async () => {
    const { view, auto, node } = await setup();
    const cloud = node(auto, 'Cloud');
    const next = arrangeLayout(view, auto, { Cloud: { x: cloud.x, y: cloud.y, width: cloud.width + 120, height: cloud.height + 40 } }, {});
    expect(node(next, 'Cloud').width).toBe(cloud.width + 120);
  });
});
