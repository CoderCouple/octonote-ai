/**
 * Parses Mermaid class diagrams into the same plain graph flowcharts use, so
 * they become real canvases too: one box per class (stereotype, name, a rule,
 * then members) and UML arrowheads on the relations. Pure; no Mermaid runtime.
 *
 * Supported:
 *   classDiagram, direction TB|BT|LR|RL
 *   class A   class A["Label"]   class A~T~   class A { members }   A : member
 *   <<interface>> A   (or <<interface>> inside the braces)
 *   A <|-- B  A *-- B  A o-- B  A --> B  A -- B  A ..> B  A ..|> B  A .. B
 *   (and the mirrored forms), "1" / "*" cardinalities, ": label"
 *   namespace N { class … }   (drawn as a dashed group)
 *   click A href "https://…"  /  link A "https://…"   (the box links there)
 *   ignored: %% comments, note, style, classDef, cssClass, callback
 */
import type { Direction, FlowEdge, FlowGroup, Flowchart, FlowNode } from "./mermaid-flowchart";
import { MermaidParseError } from "./mermaid-flowchart";
import { parseLinkLine } from "./mermaid-links";

const IGNORED_RE = /^(note|style|classDef|cssClass|callback)\b/;
// Arrow ends: <| or |> inheritance/realization, * composition, o aggregation, < or > association.
const REL_RE =
  /^([\w.-]+)(?:\s+"([^"]*)")?\s*(<\||\*|o|<)?(--|\.\.)(\|>|\*|o|>)?\s*(?:"([^"]*)"\s*)?([\w.-]+)\s*(?::\s*(.+))?$/;

/** UML end → tldraw arrowhead. tldraw has one diamond, so aggregation shares it. */
const HEAD: Record<string, string> = {
  "<|": "triangle",
  "|>": "triangle",
  "*": "diamond",
  o: "diamond",
  "<": "arrow",
  ">": "arrow",
};

interface ClassInfo {
  id: string;
  label: string;
  stereotype: string | null;
  members: string[];
  group: string | null;
}

export function isClassDiagram(source: string): boolean {
  const first = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/%%.*$/, "").trim())
    .find(Boolean);
  return /^classDiagram(-v2)?\b/.test(first ?? "");
}

export function parseMermaidClassDiagram(source: string): Flowchart {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let direction: Direction = "TB";
  let started = false;
  const classes = new Map<string, ClassInfo>();
  const edges: FlowEdge[] = [];
  const groups: FlowGroup[] = [];
  const links = new Map<string, string>();
  let namespace: string | null = null;
  let body: ClassInfo | null = null; // inside `class A {`

  const cls = (rawId: string, label?: string) => {
    const id = rawId.replace(/~[^~]*~$/, "");
    const generic = rawId.match(/~([^~]*)~$/)?.[1];
    let c = classes.get(id);
    if (!c) {
      c = { id, label: id, stereotype: null, members: [], group: namespace };
      classes.set(id, c);
    }
    if (label) c.label = label;
    else if (generic) c.label = `${id}<${generic.replace(/~/g, "")}>`;
    return c;
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/%%.*$/, "").trim();
    if (!line) return;
    if (!started) {
      if (!/^classDiagram(-v2)?\b/.test(line)) throw new MermaidParseError('Expected "classDiagram" first.', lineNo);
      started = true;
      return;
    }

    if (body) {
      if (line === "}") {
        body = null;
        return;
      }
      const stereo = line.match(/^<<(.+)>>$/);
      if (stereo) body.stereotype = stereo[1]!.trim();
      else body.members.push(line);
      return;
    }

    const dir = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/i);
    if (dir) {
      direction = dir[1]!.toUpperCase() === "TD" ? "TB" : (dir[1]!.toUpperCase() as Direction);
      return;
    }
    if (/^(click|link)\b/.test(line)) {
      const link = parseLinkLine(line);
      if (link) links.set(link.id.replace(/~[^~]*~$/, ""), link.url);
      return;
    }
    if (IGNORED_RE.test(line)) return;

    const ns = line.match(/^namespace\s+([\w.-]+)\s*\{$/);
    if (ns) {
      namespace = ns[1]!;
      groups.push({ id: namespace, title: namespace, parent: null });
      return;
    }
    if (line === "}") {
      if (!namespace) throw new MermaidParseError('"}" without a class or namespace', lineNo);
      namespace = null;
      return;
    }

    const annotated = line.match(/^<<(.+)>>\s+([\w.~-]+)$/);
    if (annotated) {
      cls(annotated[2]!).stereotype = annotated[1]!.trim();
      return;
    }

    const decl = line.match(/^class\s+([\w.-]+(?:~[^~]*~)?)(?:\s*\["([^"]*)"\])?\s*(\{)?\s*(?:\{\s*\})?$/);
    if (decl) {
      const c = cls(decl[1]!, decl[2]);
      if (decl[3]) body = c;
      return;
    }

    const member = line.match(/^([\w.-]+(?:~[^~]*~)?)\s*:\s*(.+)$/);
    if (member && !REL_RE.test(line)) {
      cls(member[1]!).members.push(member[2]!.trim());
      return;
    }

    const rel = line.match(REL_RE);
    if (rel) {
      const [, a, cardA, left, op, right, cardB, b, label] = rel;
      cls(a!);
      cls(b!);
      const card = [cardA, cardB].filter(Boolean).join(" → ");
      const text = [label?.trim(), card ? `(${card})` : ""].filter(Boolean).join(" ");
      const startHead = left ? HEAD[left] : undefined;
      const endHead = right ? HEAD[right] : undefined;
      edges.push({
        from: a!,
        to: b!,
        label: text,
        dashed: op === "..",
        thick: false,
        start: Boolean(startHead),
        end: Boolean(endHead),
        ...(startHead ? { startHead } : {}),
        ...(endHead ? { endHead } : {}),
      });
      return;
    }

    throw new MermaidParseError(`Couldn't read "${line}"`, lineNo);
  });

  if (!started) throw new MermaidParseError('Expected "classDiagram" first.');
  if (body) throw new MermaidParseError(`class "${(body as ClassInfo).id}" is missing its "}"`);
  if (classes.size === 0) throw new MermaidParseError("The class diagram has no classes.");

  const nodes: FlowNode[] = [...classes.values()].map((c) => ({
    id: c.id,
    label: [
      ...(c.stereotype ? [`«${c.stereotype}»`] : []),
      c.label,
      ...(c.members.length ? ["───────", ...c.members] : []),
    ].join("\n"),
    shape: "rectangle",
    group: c.group,
    kind: "class",
    ...(links.has(c.id) ? { url: links.get(c.id)! } : {}),
  }));
  return { direction, nodes, edges, groups };
}
