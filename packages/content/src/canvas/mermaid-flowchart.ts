/**
 * Parses the flowchart subset of Mermaid into a plain graph — the input for
 * laying out a real canvas (boxes + bound arrows). Pure; no Mermaid runtime.
 *
 * Supported:
 *   graph|flowchart TD|TB|BT|LR|RL
 *   nodes   A  A[box]  A(round)  A([stadium])  A((circle))  A{diamond}
 *           A[(database)]  A[[subroutine]]  A>flag]  A{{hexagon}}  A["quoted"]
 *   edges   -->  ---  -.->  ==>  --o  --x  <-->, chains (A --> B --> C),
 *           labels (A -->|yes| B, A -- yes --> B), & (A & B --> C)
 *   subgraph id [title] … end  (drawn as a dashed group)
 *   ignored: %% comments, classDef, class, style, linkStyle, click
 * Other diagram types (sequence, gantt, …) are rejected with a clear error:
 * those stay mermaid blocks in a note.
 */

export type Direction = "TB" | "BT" | "LR" | "RL";
export type NodeShape =
  | "rectangle"
  | "round"
  | "stadium"
  | "circle"
  | "diamond"
  | "database"
  | "subroutine"
  | "flag"
  | "hexagon";

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Innermost subgraph the node was declared in. */
  group: string | null;
}

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
  dashed: boolean;
  thick: boolean;
  /** Arrowheads at each end. */
  start: boolean;
  end: boolean;
}

export interface FlowGroup {
  id: string;
  title: string;
  parent: string | null;
}

export interface Flowchart {
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
}

export class MermaidParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line ? `Line ${line}: ${message}` : message);
    this.name = "MermaidParseError";
  }
}

const HEADER_RE = /^(graph|flowchart)(?:\s+(TD|TB|BT|LR|RL))?\s*;?$/i;
const IGNORED_RE = /^(classDef|class|style|linkStyle|click|direction)\b/;
// Opening → [shape, closing]. Longest openers first.
const SHAPES: [string, NodeShape, string][] = [
  ["([", "stadium", "])"],
  ["[(", "database", ")]"],
  ["[[", "subroutine", "]]"],
  ["((", "circle", "))"],
  ["{{", "hexagon", "}}"],
  ["[", "rectangle", "]"],
  ["(", "round", ")"],
  ["{", "diamond", "}"],
  [">", "flag", "]"],
];
// "A -- label --> B": tried first, or the plain arrow below would read "label" as a node.
// Exactly "--" / "==" opens a label (Mermaid's rule), so "A --- B --> C" stays a chain.
const LABELED_EDGE_RE = /^\s*(<)?(--|==)(?![-=.>ox])\s+([^|]+?)\s+(-{2,}|-\.+-|={2,})([>ox])\s*/;
// "-->", "---", "-.->", "==>", "--o", "--x", "<-->", with an optional |label|.
const EDGE_RE = /^\s*(<)?(-{2,}|-\.+-|={2,})([>ox])?(?:\|([^|]*)\|)?\s*/;

export function parseMermaidFlowchart(source: string): Flowchart {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let direction: Direction | null = null;
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const groups: FlowGroup[] = [];
  const stack: string[] = [];

  const node = (id: string, label: string | null, shape: NodeShape | null) => {
    const existing = nodes.get(id);
    if (existing) {
      if (label !== null) existing.label = label;
      if (shape !== null) existing.shape = shape;
      return existing;
    }
    const created: FlowNode = {
      id,
      label: label ?? id,
      shape: shape ?? "rectangle",
      group: stack.at(-1) ?? null,
    };
    nodes.set(id, created);
    return created;
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    // Statements may be separated by ';' on one line.
    for (const stmt of raw.replace(/%%.*$/, "").split(";")) {
      const line = stmt.trim();
      if (!line) continue;

      if (direction === null) {
        const header = line.match(HEADER_RE);
        if (!header) {
          const kind = line.split(/\s+/)[0];
          throw new MermaidParseError(
            `Only flowcharts ("graph TD" / "flowchart LR") can become canvases; "${kind}" diagrams stay as mermaid blocks in a note.`,
            lineNo,
          );
        }
        direction = normalizeDirection(header[2]);
        continue;
      }
      if (IGNORED_RE.test(line)) continue;

      const sub = line.match(/^subgraph\s+(.+)$/);
      if (sub) {
        const { id, title } = parseSubgraphHead(sub[1]!.trim());
        groups.push({ id, title, parent: stack.at(-1) ?? null });
        stack.push(id);
        continue;
      }
      if (line === "end") {
        if (!stack.length) throw new MermaidParseError('"end" without a subgraph', lineNo);
        stack.pop();
        continue;
      }
      parseStatement(line, lineNo, node, edges);
    }
  });

  if (direction === null) throw new MermaidParseError('Expected "graph TD" or "flowchart LR" first.');
  if (stack.length) throw new MermaidParseError(`subgraph "${stack.at(-1)}" is missing its "end"`);
  // A group id that's also used as a node would draw twice: keep it as a group.
  for (const g of groups) nodes.delete(g.id);
  if (nodes.size === 0) throw new MermaidParseError("The flowchart has no nodes.");
  return { direction, nodes: [...nodes.values()], edges, groups };
}

function normalizeDirection(d: string | undefined): Direction {
  switch ((d ?? "TB").toUpperCase()) {
    case "LR":
      return "LR";
    case "RL":
      return "RL";
    case "BT":
      return "BT";
    default:
      return "TB";
  }
}

function parseSubgraphHead(head: string): { id: string; title: string } {
  const bracket = head.match(/^([\w.-]+)\s*\[\s*"?([^\]"]*)"?\s*\]$/);
  if (bracket) return { id: bracket[1]!, title: bracket[2]!.trim() };
  const quoted = head.match(/^"([^"]*)"$/);
  if (quoted) return { id: quoted[1]!, title: quoted[1]! };
  return { id: head.split(/\s+/)[0]!, title: head };
}

/** One statement: a node list, optionally chained by edges (A & B --> C -->|x| D). */
function parseStatement(
  line: string,
  lineNo: number,
  node: (id: string, label: string | null, shape: NodeShape | null) => FlowNode,
  edges: FlowEdge[],
) {
  let rest = line;
  let previous: FlowNode[] | null = null;
  let pending: Omit<FlowEdge, "from" | "to"> | null = null;

  while (rest.length) {
    // A group of nodes joined by '&'.
    const group: FlowNode[] = [];
    for (;;) {
      const parsed = readNode(rest, lineNo);
      group.push(node(parsed.id, parsed.label, parsed.shape));
      rest = parsed.rest.trimStart();
      if (rest.startsWith("&")) {
        rest = rest.slice(1).trimStart();
        continue;
      }
      break;
    }
    if (previous && pending) {
      for (const from of previous) for (const to of group) edges.push({ from: from.id, to: to.id, ...pending });
    }
    previous = group;
    pending = null;
    if (!rest.length) break;

    const labeled = rest.match(LABELED_EDGE_RE);
    const plain = labeled ? null : rest.match(EDGE_RE);
    if (!labeled && !plain) throw new MermaidParseError(`Couldn't read "${rest}"`, lineNo);
    const whole = (labeled ?? plain)![0];
    pending = labeled
      ? edgeStyle(labeled[1] === "<", labeled[4]!, labeled[5], labeled[3]!.trim(), labeled[2])
      : edgeStyle(plain![1] === "<", plain![2]!, plain![3], (plain![4] ?? "").trim());
    rest = rest.slice(whole.length);
    if (!rest.trim()) throw new MermaidParseError("An arrow needs a node after it", lineNo);
  }
}

function edgeStyle(
  backwards: boolean,
  op: string,
  head: string | undefined,
  label: string,
  opener?: string,
): Omit<FlowEdge, "from" | "to"> {
  const ops = `${opener ?? ""}${op}`;
  return {
    label: unquote(label),
    dashed: ops.includes("."),
    thick: ops.includes("="),
    start: backwards,
    end: head !== undefined,
  };
}

function readNode(text: string, lineNo: number) {
  const idMatch = text.match(/^\s*([\w.:-]+)/);
  if (!idMatch) throw new MermaidParseError(`Expected a node id at "${text}"`, lineNo);
  const id = idMatch[1]!;
  let rest = text.slice(idMatch[0].length);
  for (const [open, shape, close] of SHAPES) {
    if (!rest.startsWith(open)) continue;
    const end = rest.indexOf(close, open.length);
    if (end === -1) throw new MermaidParseError(`Unclosed "${open}" after ${id}`, lineNo);
    const label = unquote(rest.slice(open.length, end).trim());
    rest = rest.slice(end + close.length);
    return { id, label, shape, rest };
  }
  return { id, label: null, shape: null, rest };
}

function unquote(s: string) {
  const t = s.trim();
  const quoted = t.match(/^"([\s\S]*)"$/);
  return (quoted ? quoted[1]! : t).replace(/<br\s*\/?>/gi, "\n");
}
