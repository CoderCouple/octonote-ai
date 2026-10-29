// Resolved model produced by the architecture/flowchart DSL parser.
// The syntax mirrors Eraser's public diagram-as-code reference.

export type Direction = 'right' | 'left' | 'down' | 'up';

export type Severity = 'error' | 'warning';

/** 1-based line, 1-based columns; endColumn is exclusive. */
export interface SourceRange {
  line: number;
  column: number;
  endColumn: number;
}

export interface Diagnostic extends SourceRange {
  severity: Severity;
  message: string;
}

export type Properties = Record<string, string>;

export interface DiagramNode {
  /** Unique name as written in the source; also the display label unless `label` is set. */
  id: string;
  kind: 'node' | 'group';
  label: string;
  /** Parent group id, or null for top level. */
  parent: string | null;
  /** Child ids in declaration order (groups only). */
  children: string[];
  properties: Properties;
  /** True when the node was only referenced by a connection, never declared. */
  implicit: boolean;
  range: SourceRange;
}

export type Connector = '>' | '<' | '<>' | '-' | '--' | '-->';

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  connector: Connector;
  startArrow: boolean;
  endArrow: boolean;
  dashed: boolean;
  label?: string;
  properties: Properties;
  range: SourceRange;
}

export interface LegendItem {
  properties: Properties;
  range: SourceRange;
}

export interface Legend {
  properties: Properties;
  items: LegendItem[];
  range: SourceRange;
}

/** One step of a flow: a hop between two nodes, with an optional caption. */
export interface FlowStep {
  from: string;
  to: string;
  connector: Connector;
  label?: string;
  range: SourceRange;
}

/** A named walk through the diagram (`flow Name { A > B: caption … }`), an octodraw extension. */
export interface Flow {
  name: string;
  steps: FlowStep[];
  range: SourceRange;
}

export interface GlobalSettings {
  title?: string;
  direction: Direction;
  colorMode: string;
  styleMode: string;
  typeface: string;
  wrap: string;
}

export interface Diagram {
  settings: GlobalSettings;
  /** All nodes and groups keyed by id, in declaration order. */
  nodes: Map<string, DiagramNode>;
  /** Top-level ids in declaration order. */
  roots: string[];
  edges: DiagramEdge[];
  legend?: Legend;
  flows: Flow[];
  diagnostics: Diagnostic[];
}
