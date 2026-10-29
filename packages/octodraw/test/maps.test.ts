import { describe, expect, it } from 'vitest';
import { buildView, parseDiagram } from '../src';
import { ancestorsOf, connectionsOf, facetValues, filterEmphasis, flowEmphasis } from '../src/maps/maps';

const source = `
Diner [team: Consumer]
Platform {
  App [team: Consumer, tech: React Native, tags: "mobile, public"]
  Orders {
    API [team: Orders, tech: Kotlin, tags: core]
    DB [team: Orders, tech: Postgres, shape: cylinder]
  }
}
Diner > App: opens
App > API: POST /orders
API > DB

flow Place an order {
  Diner > App: opens the app
  App > API: places the order
  API > DB
}
`;
const diagram = parseDiagram(source);

describe('parsing maps extensions', () => {
  it('parses flows and facet properties without warnings', () => {
    expect(diagram.diagnostics).toEqual([]);
    expect(diagram.flows).toHaveLength(1);
    expect(diagram.flows[0]!.name).toBe('Place an order');
    expect(diagram.flows[0]!.steps.map((s) => [s.from, s.to, s.label])).toEqual([
      ['Diner', 'App', 'opens the app'],
      ['App', 'API', 'places the order'],
      ['API', 'DB', undefined],
    ]);
    // Flow steps don't become edges.
    expect(diagram.edges).toHaveLength(3);
  });

  it('warns about flow steps that name unknown nodes', () => {
    const d = parseDiagram('A > B\nflow F {\n  A > Nope\n  A > B\n}');
    expect(d.diagnostics.map((x) => x.message)).toEqual(["Flow 'F': unknown 'Nope'"]);
    expect(d.flows[0]!.steps).toHaveLength(1);
  });

  it('rejects declarations inside a flow', () => {
    const d = parseDiagram('A > B\nflow F {\n  A [icon: x]\n}');
    expect(d.diagnostics[0]?.message).toMatch(/A flow contains steps/);
  });
});

describe('filters', () => {
  it('lists facet values', () => {
    expect(facetValues(diagram)).toEqual({ team: ['Consumer', 'Orders'], tech: ['Kotlin', 'Postgres', 'React Native'], tags: ['core', 'mobile', 'public'] });
  });

  it('emphasizes matching nodes and the edges between them', () => {
    const view = buildView(diagram, { focus: null });
    const e = filterEmphasis(view, diagram, { team: 'Orders' })!;
    expect([...e.nodes].sort()).toEqual(['API', 'DB']);
    expect(e.edges.size).toBe(1);
    expect(filterEmphasis(view, diagram, {})).toBeUndefined();
    expect([...filterEmphasis(view, diagram, { tags: 'mobile' })!.nodes]).toEqual(['App']);
  });

  it('maps matches inside collapsed groups to the group box', () => {
    const view = buildView(diagram, { focus: null, collapsedGroups: new Set(['Orders']) });
    expect([...filterEmphasis(view, diagram, { tech: 'Kotlin' })!.nodes]).toEqual(['Orders']);
  });
});

describe('flows', () => {
  it('accents the current step and keeps the walked path lit', () => {
    const view = buildView(diagram, { focus: null });
    const step1 = flowEmphasis(view, diagram, diagram.flows[0]!, 1);
    expect([...step1.nodes].sort()).toEqual(['API', 'App', 'DB', 'Diner']);
    expect(step1.edges.size).toBe(2);
    expect([...step1.current!.nodes].sort()).toEqual(['API', 'App']);
    expect(step1.current!.edges.size).toBe(1);
  });

  it('follows the flow into collapsed groups', () => {
    const view = buildView(diagram, { focus: null, collapsedGroups: new Set(['Platform']) });
    const e = flowEmphasis(view, diagram, diagram.flows[0]!, 0);
    expect([...e.current!.nodes].sort()).toEqual(['Diner', 'Platform']);
  });
});

describe('details helpers', () => {
  it('lists connections and ancestry', () => {
    expect(connectionsOf(diagram, 'API')).toEqual({ incoming: [{ node: 'App', label: 'POST /orders' }], outgoing: [{ node: 'DB', label: undefined }] });
    expect(ancestorsOf(diagram, 'DB')).toEqual(['Platform', 'Orders']);
  });
});
