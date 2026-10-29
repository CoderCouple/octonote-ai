import type { Diagram, DiagramNode, Flow } from '../dsl/types';
import type { DiagramView } from '../view/view';

// "Maps" behaviour on top of a view: filtering by team / technology / tags and
// stepping through flows. Pure functions; OctoDiagram turns the results into
// emphasis for the renderer.

export type FacetName = 'team' | 'tech' | 'tags';
export const FACETS: { name: FacetName; label: string }[] = [
  { name: 'team', label: 'Team' },
  { name: 'tech', label: 'Technology' },
  { name: 'tags', label: 'Tag' },
];

/** Active filter: at most one value per facet; a node must match all of them. */
export type MapFilter = Partial<Record<FacetName, string>>;

/** What to highlight: everything outside `nodes` / `edges` is dimmed; `current` is accented. */
export interface Emphasis {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  current?: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> };
}

const valuesOf = (node: DiagramNode, facet: FacetName): string[] => {
  const raw = node.properties[facet];
  if (!raw) return [];
  return facet === 'tags' ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [raw.trim()];
};

/** Every value used per facet, sorted, for building a filter menu. */
export function facetValues(diagram: Diagram): Record<FacetName, string[]> {
  const out: Record<FacetName, Set<string>> = { team: new Set(), tech: new Set(), tags: new Set() };
  for (const node of diagram.nodes.values()) for (const f of FACETS) for (const v of valuesOf(node, f.name)) out[f.name].add(v);
  return { team: [...out.team].sort(), tech: [...out.tech].sort(), tags: [...out.tags].sort() };
}

export function isFilterActive(filter: MapFilter): boolean {
  return Object.values(filter).some(Boolean);
}

/** The view node standing in for a diagram node: itself, or the nearest visible ancestor (e.g. a collapsed group). */
export function visibleRepresentative(view: DiagramView, diagram: Diagram, id: string): string | undefined {
  for (let cur: string | null | undefined = id; cur; cur = diagram.nodes.get(cur)?.parent) {
    if (view.nodes.has(cur)) return cur;
  }
  return undefined;
}

/**
 * Emphasis for a filter: visible nodes matching every active facet (directly or,
 * for collapsed groups, through a descendant) and edges between them.
 */
export function filterEmphasis(view: DiagramView, diagram: Diagram, filter: MapFilter): Emphasis | undefined {
  if (!isFilterActive(filter)) return undefined;
  const matches = (node: DiagramNode) => FACETS.every((f) => !filter[f.name] || valuesOf(node, f.name).includes(filter[f.name]!));
  const nodes = new Set<string>();
  for (const node of diagram.nodes.values()) {
    if (node.kind === 'group' || !matches(node)) continue;
    const rep = visibleRepresentative(view, diagram, node.id);
    if (rep) nodes.add(rep);
  }
  const edges = new Set(view.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => e.id));
  return { nodes, edges };
}

/**
 * Emphasis for a flow at `step` (0-based): every node the flow touches stays
 * lit, steps so far keep their edges lit, and the current step is accented.
 */
export function flowEmphasis(view: DiagramView, diagram: Diagram, flow: Flow, step: number): Emphasis {
  const rep = (id: string) => visibleRepresentative(view, diagram, id);
  const edgeBetween = (a: string | undefined, b: string | undefined) =>
    a && b ? view.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))?.id : undefined;

  const nodes = new Set<string>();
  for (const s of flow.steps) for (const id of [rep(s.from), rep(s.to)]) if (id) nodes.add(id);
  const edges = new Set<string>();
  flow.steps.slice(0, step + 1).forEach((s) => {
    const e = edgeBetween(rep(s.from), rep(s.to));
    if (e) edges.add(e);
  });
  const current = flow.steps[step];
  const currentNodes = new Set(current ? [rep(current.from), rep(current.to)].filter((x): x is string => !!x) : []);
  const currentEdge = current ? edgeBetween(rep(current.from), rep(current.to)) : undefined;
  return { nodes, edges, current: { nodes: currentNodes, edges: new Set(currentEdge ? [currentEdge] : []) } };
}

/** Incoming and outgoing connections of a node in the diagram, for a details panel. */
export function connectionsOf(diagram: Diagram, id: string): { incoming: { node: string; label?: string }[]; outgoing: { node: string; label?: string }[] } {
  return {
    incoming: diagram.edges.filter((e) => e.to === id).map((e) => ({ node: e.from, label: e.label })),
    outgoing: diagram.edges.filter((e) => e.from === id).map((e) => ({ node: e.to, label: e.label })),
  };
}

/** Group ancestry, outermost first. */
export function ancestorsOf(diagram: Diagram, id: string): string[] {
  const out: string[] = [];
  for (let cur = diagram.nodes.get(id)?.parent; cur; cur = diagram.nodes.get(cur)?.parent) out.unshift(cur);
  return out;
}
