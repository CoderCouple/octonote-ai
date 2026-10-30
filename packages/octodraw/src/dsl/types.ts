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

// ---------------------------------------------------------------------------
// Source positions (`parseDiagramWithSpans`). Kept apart from `Diagram` so the
// parser's normal output doesn't change. Columns are 1-based with an exclusive
// end, like `SourceRange`; the line is on the record that holds the span.

export interface ColumnSpan {
  column: number;
  endColumn: number;
}

/** A name as written: a quoted name's span includes its quotes. */
export interface NameSpan extends ColumnSpan {
  name: string;
  quoted: boolean;
}

/** One `key: value` entry inside `[ … ]`. */
export interface PropertySpan {
  key: string;
  /** Value after unquoting, as the parser stores it. */
  value: string;
  /** The whole entry, trimmed (`key: value`). */
  entry: ColumnSpan;
  keyRange: ColumnSpan;
  /** The value as written (quotes included). */
  valueRange: ColumnSpan;
}

/** A `[ … ]` block, brackets included. */
export interface PropertiesSpan extends ColumnSpan {
  entries: PropertySpan[];
}

/** One declaration, connection or flow-step statement (a line can hold several: `G { A > B }`). */
export interface StatementSpan {
  index: number;
  kind: 'declaration' | 'connection' | 'flow';
  line: number;
  /** From the first name to the end of the label / `[props]` (a group's `{` is not included). */
  range: ColumnSpan;
  /** Comma lists between connectors: `A > B, C` is `[[A], [B, C]]`; a declaration has one list. */
  lists: NameSpan[][];
  connectors: (ColumnSpan & { connector: Connector })[];
  colon?: ColumnSpan;
  /** The label text after `:`, trimmed. */
  label?: ColumnSpan;
  props?: PropertiesSpan;
  /** The `{` when the declaration opens a group. */
  brace?: ColumnSpan;
  /** Group the statement was written in. */
  group: string | null;
  /** Column where more code follows on the same line (a `{` or `}` segment), if any. */
  followedAt?: number;
  /** Edge ids made by this statement, in order (connections only). */
  edges: string[];
}

/** One declaration of a node or group (every one, including repeats). */
export interface NodeDeclarationSpan {
  id: string;
  line: number;
  statement: number;
  /** Position in the statement's comma list (`A, B [props]` declares two). */
  listIndex: number;
  name: NameSpan;
  props?: PropertiesSpan;
  group: string | null;
  opensGroup: boolean;
}

export interface EdgeSpan {
  id: string;
  line: number;
  statement: number;
  /** Connector index in a chain (`A > B > C`: 0 for A>B, 1 for B>C). */
  segment: number;
  /** Index of `from` / `to` in their comma lists. */
  fromIndex: number;
  toIndex: number;
  /** How many edges the statement makes; more than 1 means a chain or multi-target line. */
  count: number;
  from: NameSpan;
  to: NameSpan;
  connector: ColumnSpan & { connector: Connector };
  label?: ColumnSpan;
  props?: PropertiesSpan;
  group: string | null;
}

export interface GroupSpan {
  id: string;
  /** Line of `Name [props] {`. */
  line: number;
  statement: number;
  open: ColumnSpan;
  /** The matching `}`; missing when the group is never closed. */
  close?: SourceRange;
}

export interface DiagramSpans {
  statements: StatementSpan[];
  nodes: NodeDeclarationSpan[];
  edges: EdgeSpan[];
  groups: GroupSpan[];
}
