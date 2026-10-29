import { describe, expect, it } from 'vitest';
import { buildView, canDrillInto, parseDiagram } from '../src';

const source = `
User [icon: user]
Company {
  VPC [icon: aws-vpc] {
    API [icon: aws-ec2] {
      Router
      Auth
    }
    Data [icon: aws-rds]
  }
  Billing
}
User > Router: HTTPS
User > Auth: login
Router > Data
Auth --> Billing
`;
const diagram = parseDiagram(source);
const kinds = (view: ReturnType<typeof buildView>) => Object.fromEntries([...view.nodes].map(([id, n]) => [id, n.kind]));
const edges = (view: ReturnType<typeof buildView>) => view.edges.map((e) => `${e.from}->${e.to}${e.sources.length > 1 ? `(${e.sources.length})` : ''}`);

describe('buildView', () => {
  it('shows everything expanded by default', () => {
    const view = buildView(diagram, { focus: null });
    expect(view.roots).toEqual(['User', 'Company']);
    expect(kinds(view)).toMatchObject({ Company: 'group', VPC: 'group', API: 'group', Router: 'node' });
    expect(edges(view)).toEqual(['User->Router', 'User->Auth', 'Router->Data', 'Auth->Billing']);
  });

  it('collapses groups below expandDepth and merges their edges', () => {
    const view = buildView(diagram, { focus: null, expandDepth: 1 });
    expect(kinds(view)).toEqual({ User: 'node', Company: 'group', VPC: 'collapsed', Billing: 'node' });
    expect(view.nodes.get('VPC')?.hiddenCount).toBe(4);
    expect(edges(view)).toEqual(['User->VPC(2)', 'VPC->Billing']);
    const merged = view.edges[0]!;
    expect(merged.label).toBeUndefined();
  });

  it('drills into a group and shows outside endpoints as externals', () => {
    const view = buildView(diagram, { focus: 'VPC' });
    expect(view.path).toEqual(['VPC', 'Company']);
    expect(view.roots).toEqual(['API', 'Data', 'User', 'Billing']);
    expect(kinds(view)).toMatchObject({ API: 'group', User: 'external', Billing: 'external' });
    expect(edges(view)).toEqual(['User->Router', 'User->Auth', 'Router->Data', 'Auth->Billing']);
  });

  it('drills recursively', () => {
    const view = buildView(diagram, { focus: 'API' });
    expect(view.path).toEqual(['API', 'VPC', 'Company']);
    expect(view.roots).toEqual(['Router', 'Auth', 'User', 'Data', 'Billing']);
    expect(view.nodes.get('Data')?.kind).toBe('external');
  });

  it('drops edges that are entirely outside or inside a single visible node', () => {
    const d = parseDiagram('A > B\nG { X > Y }');
    expect(buildView(d, { focus: 'G' }).edges.map((e) => e.from)).toEqual(['X']);
    expect(buildView(d, { focus: null, expandDepth: 0 }).edges.map((e) => e.from)).toEqual(['A']);
  });

  it('honours the collapsed property', () => {
    const d = parseDiagram('G [collapsed: true] { A }\nH [collapsed: false] { I [collapsed: false] { J } }');
    expect(kinds(buildView(d, { focus: null, expandDepth: 0 }))).toEqual({ G: 'collapsed', H: 'group', I: 'group', J: 'node' });
  });

  it('falls back to the top level for unknown or non-group focus', () => {
    expect(buildView(diagram, { focus: 'Nope' }).focus).toBeNull();
    expect(buildView(diagram, { focus: 'Router' }).focus).toBeNull();
  });

  it('reports drillable groups', () => {
    const view = buildView(diagram, { focus: null, expandDepth: 1 });
    expect(canDrillInto(view, 'VPC')).toBe(true);
    expect(canDrillInto(view, 'User')).toBe(false);
  });

  describe('merging group fan-in and fan-out', () => {
    const merged = (source: string) => edges(buildView(parseDiagram(source), { focus: null }));

    it('replaces identical edges from every child with one group edge', () => {
      expect(merged('Apps { A\n B\n C }\nA, B, C > GW')).toEqual(['Apps->GW(3)']);
    });

    it('merges fan-out into a group too', () => {
      expect(merged('Svc { A\n B }\nGW > A, B')).toEqual(['GW->Svc(2)']);
    });

    it('keeps edges when a child is missing, labeled, or styled differently', () => {
      expect(merged('G { A\n B\n C }\nA, B > X')).toEqual(['A->X', 'B->X']);
      expect(merged('G { A\n B }\nA > X: one\nB > X: two')).toEqual(['A->X', 'B->X']);
      expect(merged('G { A\n B }\nA > X\nB --> X')).toEqual(['A->X', 'B->X']);
    });

    it('can be turned off', () => {
      const view = buildView(parseDiagram('G { A\n B }\nA, B > X'), { focus: null, mergeGroupEdges: false });
      expect(edges(view)).toEqual(['A->X', 'B->X']);
    });
  });

  it('collapses groups the user collapsed, at any depth', () => {
    const view = buildView(diagram, { focus: null, collapsedGroups: new Set(['VPC']) });
    expect(kinds(view)).toMatchObject({ Company: 'group', VPC: 'collapsed', Billing: 'node' });
    expect(view.nodes.has('Router')).toBe(false);
    expect(edges(view)).toEqual(['User->VPC(2)', 'VPC->Billing']);
  });
});
