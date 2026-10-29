import type {
  Connector,
  Diagnostic,
  Diagram,
  DiagramEdge,
  DiagramNode,
  Direction,
  Flow,
  GlobalSettings,
  Legend,
  Properties,
  Severity,
  SourceRange,
} from './types';

// Parser for the architecture / flowchart diagram-as-code syntax:
//
//   direction down
//   VPC [icon: aws-vpc] {
//     API [icon: aws-ec2]
//   }
//   User > API, Cache: HTTPS [color: blue]
//
// The grammar is line oriented. Every problem becomes a Diagnostic and the
// offending line is skipped, so a half-typed document still yields a diagram.

const DIRECTIONS: readonly Direction[] = ['right', 'left', 'down', 'up'];

const SETTING_VALUES = {
  colorMode: ['pastel', 'bold', 'outline'],
  styleMode: ['shadow', 'plain', 'watercolor'],
  typeface: ['rough', 'clean', 'mono'],
  wrap: ['on', 'off'],
} as const satisfies Record<string, readonly string[]>;

type EnumSetting = keyof typeof SETTING_VALUES;

const NODE_PROPERTIES = new Set([
  'icon',
  'color',
  'label',
  'link',
  'shape',
  'colorMode',
  'styleMode',
  'typeface',
  'wrap',
  'type', // BPMN: activity | event | gateway
  'gateway', // BPMN (octodraw extension): exclusive | parallel | inclusive | event
  'event', // BPMN (octodraw extension): message | timer | error | signal
  'attached', // BPMN (octodraw extension): a boundary event sits on this task's edge
  // octodraw extensions.
  'collapsed', // show a group expanded/collapsed regardless of the view's expand depth
  'description', // secondary line under the label
  'team', // owning team, for filtering
  'tech', // technology, for filtering
  'tags', // comma-separated tags, for filtering
]);
const EDGE_PROPERTIES = new Set(['color', 'wrap']);

/** Allowed values per property (Eraser's flow chart syntax); others get a warning. */
const PROPERTY_VALUES: Record<string, readonly string[]> = {
  shape: ['rectangle', 'cylinder', 'diamond', 'document', 'ellipse', 'hexagon', 'oval', 'parallelogram', 'star', 'trapezoid', 'triangle', 'circle'],
  colorMode: SETTING_VALUES.colorMode,
  styleMode: SETTING_VALUES.styleMode,
  typeface: SETTING_VALUES.typeface,
  wrap: SETTING_VALUES.wrap,
  type: ['activity', 'event', 'gateway', 'subprocess', 'data', 'store'],
  gateway: ['exclusive', 'parallel', 'inclusive', 'event'],
  event: ['message', 'timer', 'error', 'signal'],
};

const CONNECTOR_STYLE: Record<Connector, Pick<DiagramEdge, 'startArrow' | 'endArrow' | 'dashed'>> = {
  '>': { startArrow: false, endArrow: true, dashed: false },
  '<': { startArrow: true, endArrow: false, dashed: false },
  '<>': { startArrow: true, endArrow: true, dashed: false },
  '-': { startArrow: false, endArrow: false, dashed: false },
  '--': { startArrow: false, endArrow: false, dashed: true },
  '-->': { startArrow: false, endArrow: true, dashed: true },
};

type Token =
  | { type: 'name'; value: string; start: number; end: number }
  | { type: 'connector'; value: Connector; start: number; end: number }
  | { type: 'comma' | 'lbrace' | 'rbrace'; start: number; end: number }
  | { type: 'colon'; start: number; end: number; rest: string; restStart: number }
  | { type: 'props'; raw: string; start: number; end: number };

interface NameRef {
  name: string;
  start: number;
  end: number;
}

interface PendingEdge {
  from: NameRef;
  to: NameRef;
  connector: Connector;
  label?: string;
  properties: Properties;
  line: number;
  /** Group the connection was written in; undeclared endpoints are created there. */
  group: string | null;
}

type Scope =
  | { kind: 'group'; id: string; line: number; column: number }
  | { kind: 'legend'; line: number; column: number }
  | { kind: 'flow'; flow: Flow; line: number; column: number };

export function parseDiagram(source: string): Diagram {
  return new Parser(source).parse();
}

class Parser {
  private readonly lines: string[];
  private readonly diagnostics: Diagnostic[] = [];
  private readonly nodes = new Map<string, DiagramNode>();
  private readonly roots: string[] = [];
  private readonly pendingEdges: PendingEdge[] = [];
  private readonly scopes: Scope[] = [];
  private readonly settings: GlobalSettings = {
    direction: 'right',
    colorMode: 'pastel',
    styleMode: 'shadow',
    // Eraser documents `rough` as the default, but its renders use clean text.
    typeface: 'clean',
    wrap: 'on',
  };
  private legend?: Legend;
  private readonly flows: Flow[] = [];
  private line = 0;

  constructor(source: string) {
    this.lines = source.split(/\r?\n/);
  }

  parse(): Diagram {
    for (let i = 0; i < this.lines.length; i++) {
      this.line = i + 1;
      const text = stripComment(this.lines[i] ?? '');
      this.parseSegment(text, 0);
    }
    for (const scope of this.scopes) {
      this.report('error', "Missing closing '}'", { line: scope.line, column: scope.column, endColumn: scope.column + 1 });
    }
    const edges = this.resolveEdges();
    this.checkFlows();
    return {
      settings: this.settings,
      nodes: this.nodes,
      roots: this.roots,
      edges,
      legend: this.legend,
      flows: this.flows,
      diagnostics: this.diagnostics,
    };
  }

  /** Parses `text`, which starts at 0-based column `offset` of the current line. */
  private parseSegment(text: string, offset: number): void {
    const leading = text.length - text.trimStart().length;
    const trimmed = text.trim();
    if (!trimmed) return;
    const at = offset + leading;

    if (trimmed.startsWith('}')) {
      this.closeScope(at);
      this.parseSegment(text.slice(leading + 1), at + 1);
      return;
    }

    const scope = this.scopes.at(-1);
    if (scope?.kind === 'legend') {
      this.parseLegendItems(trimmed, at);
      return;
    }

    // `flow Name {` opens a flow; its lines are steps (connections), not edges.
    const flowMatch = /^flow\s+(.+?)\s*\{\s*$/.exec(trimmed);
    if (flowMatch && scope?.kind !== 'flow') {
      const flow: Flow = { name: unquote(flowMatch[1]!), steps: [], range: this.range(at, at + trimmed.length) };
      this.flows.push(flow);
      this.scopes.push({ kind: 'flow', flow, line: this.line, column: at + 1 });
      return;
    }

    if (this.parseSetting(trimmed, at)) return;

    const tokens = tokenize(text, offset, (message, start, end) => this.report('error', message, this.range(start, end)));
    if (!tokens) return;
    this.parseStatement(tokens, text, offset);
  }

  private parseSetting(text: string, at: number): boolean {
    const match = /^(direction|colorMode|styleMode|typeface|wrap|title)\s+(.+)$/.exec(text);
    if (!match) return false;
    const key = match[1] as 'direction' | EnumSetting | 'title';
    const value = match[2]!.trim();
    if (key === 'title') {
      this.settings.title = unquote(value);
      return true;
    }
    // `wrap off` is a setting, but `direction > Server` is a connection to a node called "direction".
    if (/[\[\]{}<>:,]/.test(value) || /\s/.test(value)) return false;
    const range = this.range(at + text.length - value.length, at + text.length);
    if (key === 'direction') {
      if (isDirection(value)) this.settings.direction = value;
      else this.report('error', `Unknown direction '${value}'. Use ${DIRECTIONS.join(', ')}`, range);
      return true;
    }
    const allowed: readonly string[] = SETTING_VALUES[key];
    if (allowed.includes(value)) this.settings[key] = value;
    else this.report('warning', `Unknown ${key} '${value}'. Use ${allowed.join(', ')}`, range);
    return true;
  }

  private parseStatement(tokens: Token[], text: string, offset: number): void {
    let i = 0;
    const lists: NameRef[][] = [];
    const connectors: Connector[] = [];
    let label: string | undefined;
    let props: Extract<Token, { type: 'props' }> | undefined;

    const readList = (): NameRef[] | undefined => {
      const list: NameRef[] = [];
      for (;;) {
        const tok = tokens[i];
        if (tok?.type !== 'name') {
          const pos = tok?.start ?? offset + text.trimEnd().length;
          this.report('error', 'Expected a name', this.range(pos, (tok?.end ?? pos) + (tok ? 0 : 1)));
          return undefined;
        }
        list.push({ name: tok.value, start: tok.start, end: tok.end });
        i++;
        if (tokens[i]?.type !== 'comma') return list;
        i++;
      }
    };

    const first = readList();
    if (!first) return;
    lists.push(first);
    while (tokens[i]?.type === 'connector') {
      connectors.push((tokens[i] as Extract<Token, { type: 'connector' }>).value);
      i++;
      const next = readList();
      if (!next) return;
      lists.push(next);
    }

    let tok = tokens[i];
    if (tok?.type === 'colon') {
      if (connectors.length === 0) {
        this.report('error', "Unexpected ':'. Labels are only allowed on connections, e.g. 'A > B: label'", this.range(tok.start, tok.end));
        return;
      }
      const split = splitTrailingProps(tok.rest);
      label = split.label.trim() || undefined;
      if (split.props !== undefined) {
        const start = tok.restStart + split.propsStart;
        props = { type: 'props', raw: split.props, start, end: start + split.props.length + 2 };
      }
      i = tokens.length;
    }

    tok = tokens[i];
    if (tok?.type === 'props') {
      props = tok;
      i++;
    }

    const properties = props ? this.parseProperties(props.raw, props.start + 1) : {};

    const flowScope = this.scopes.at(-1);
    if (flowScope?.kind === 'flow') {
      if (connectors.length === 0) {
        this.report('error', "A flow contains steps like 'A > B: caption'", this.range(first[0]!.start, first.at(-1)!.end));
        return;
      }
      for (let c = 0; c < connectors.length; c++) {
        for (const from of lists[c]!) {
          for (const to of lists[c + 1]!) {
            flowScope.flow.steps.push({ from: from.name, to: to.name, connector: connectors[c]!, label, range: this.range(from.start, to.end) });
          }
        }
      }
      const rest = tokens[i];
      if (rest?.type === 'rbrace') this.parseSegment(text.slice(rest.start - offset), rest.start);
      return;
    }

    if (connectors.length > 0) {
      const rest = tokens[i];
      if (rest && rest.type !== 'rbrace') {
        this.report('error', rest.type === 'lbrace' ? 'A connection cannot open a group' : 'Unexpected text after connection', this.range(rest.start, rest.end));
        return;
      }
      if (props) this.checkKnown(properties, EDGE_PROPERTIES, 'connection', props.start + 1, props.raw);
      for (let c = 0; c < connectors.length; c++) {
        for (const from of lists[c]!) {
          for (const to of lists[c + 1]!) {
            this.pendingEdges.push({ from, to, connector: connectors[c]!, label, properties, line: this.line, group: this.currentGroup() ?? null });
          }
        }
      }
      if (rest) this.parseSegment(text.slice(rest.start - offset), rest.start);
      return;
    }

    // Declaration: `Name [props]`, optionally opening a group with `{`.
    const opens = tokens[i]?.type === 'lbrace';
    const isLegend = opens && first.length === 1 && first[0]!.name === 'legend';
    if (props && !isLegend) this.checkKnown(properties, NODE_PROPERTIES, 'node', props.start + 1, props.raw);
    if (opens) {
      if (first.length > 1) {
        this.report('error', 'Only one group can be opened per line', this.range(first[1]!.start, first.at(-1)!.end));
        return;
      }
      i++;
    }
    for (const ref of first) this.declare(ref, properties, opens);

    const rest = tokens[i];
    if (opens) {
      const brace = tokens[i - 1]!;
      if (!isLegend) this.scopes.push({ kind: 'group', id: first[0]!.name, line: this.line, column: brace.start + 1 });
      this.parseSegment(text.slice(brace.end - offset), brace.end);
    } else if (rest?.type === 'rbrace') {
      this.parseSegment(text.slice(rest.start - offset), rest.start);
    } else if (rest) {
      this.report('error', 'Unexpected text after declaration', this.range(rest.start, rest.end));
    }
  }

  private declare(ref: NameRef, properties: Properties, isGroup: boolean): void {
    const range = this.range(ref.start, ref.end);
    const parentScope = this.currentGroup();
    if (ref.name === 'legend' && isGroup) {
      this.legend = { properties, items: [], range };
      this.scopes.push({ kind: 'legend', line: range.line, column: range.column });
      return;
    }
    const existing = this.nodes.get(ref.name);
    if (existing) {
      if (!existing.implicit) this.report('warning', `'${ref.name}' is already defined on line ${existing.range.line}; properties are merged`, range);
      Object.assign(existing.properties, properties);
      if (properties.label !== undefined) existing.label = properties.label;
      if (isGroup) existing.kind = 'group';
      return;
    }
    const node: DiagramNode = {
      id: ref.name,
      kind: isGroup ? 'group' : 'node',
      label: properties.label ?? ref.name,
      parent: parentScope ?? null,
      children: [],
      properties,
      implicit: false,
      range,
    };
    this.nodes.set(node.id, node);
    if (node.parent) this.nodes.get(node.parent)!.children.push(node.id);
    else this.roots.push(node.id);
  }

  private parseLegendItems(text: string, at: number): void {
    let pos = 0;
    while (pos < text.length) {
      while (pos < text.length && /[\s,]/.test(text[pos]!)) pos++;
      if (pos >= text.length) return;
      if (text[pos] === '}') {
        this.parseSegment(text.slice(pos), at + pos);
        return;
      }
      if (text[pos] !== '[') {
        this.report('error', "Legend items look like '[color: red, label: Error]'", this.range(at + pos, at + text.length));
        return;
      }
      const close = findClosingBracket(text, pos);
      if (close < 0) {
        this.report('error', "Missing closing ']'", this.range(at + pos, at + pos + 1));
        return;
      }
      const raw = text.slice(pos + 1, close);
      const properties = this.parseProperties(raw, at + pos + 1);
      const range = this.range(at + pos, at + close + 1);
      if (properties.label === undefined) this.report('warning', 'Legend item needs a label', range);
      this.legend!.items.push({ properties, range });
      pos = close + 1;
    }
  }

  private parseProperties(raw: string, start: number): Properties {
    const properties: Properties = {};
    for (const part of splitOutsideQuotes(raw, ',')) {
      const text = part.text.trim();
      if (!text) continue;
      const partStart = start + part.start + (part.text.length - part.text.trimStart().length);
      const colon = text.indexOf(':');
      if (colon < 0) {
        this.report('error', `Property '${text}' needs a value, e.g. '${text}: value'`, this.range(partStart, partStart + text.length));
        continue;
      }
      const key = text.slice(0, colon).trim();
      properties[key] = unquote(text.slice(colon + 1).trim());
    }
    return properties;
  }

  private checkKnown(properties: Properties, known: Set<string>, what: string, start: number, raw: string): void {
    for (const [key, value] of Object.entries(properties)) {
      const idx = raw.indexOf(key);
      const range = idx >= 0 ? this.range(start + idx, start + idx + key.length) : this.range(start, start + raw.length);
      if (!known.has(key)) {
        this.report('warning', `Unknown ${what} property '${key}'`, range);
        continue;
      }
      const allowed = PROPERTY_VALUES[key];
      if (allowed && !allowed.includes(value)) this.report('warning', `Unknown ${key} '${value}'. Use ${allowed.join(', ')}`, range);
    }
  }

  private closeScope(at: number): void {
    if (!this.scopes.pop()) this.report('error', "Unexpected '}'", this.range(at, at + 1));
  }

  private currentGroup(): string | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i]!;
      if (scope.kind === 'group') return scope.id;
    }
    return undefined;
  }

  /** Flow steps must name existing nodes; unknown ones are dropped with a warning. */
  private checkFlows(): void {
    for (const flow of this.flows) {
      flow.steps = flow.steps.filter((step) => {
        const missing = [step.from, step.to].filter((n) => !this.nodes.has(n));
        if (missing.length) this.report('warning', `Flow '${flow.name}': unknown ${missing.map((m) => `'${m}'`).join(' and ')}`, step.range);
        return missing.length === 0;
      });
    }
  }

  private resolveEdges(): DiagramEdge[] {
    return this.pendingEdges.map((pending, index) => {
      for (const ref of [pending.from, pending.to]) {
        if (this.nodes.has(ref.name)) continue;
        // Referencing an undeclared name creates a blank node in the enclosing group.
        this.nodes.set(ref.name, {
          id: ref.name,
          kind: 'node',
          label: ref.name,
          parent: pending.group,
          children: [],
          properties: {},
          implicit: true,
          range: { line: pending.line, column: ref.start + 1, endColumn: ref.end + 1 },
        });
        if (pending.group) this.nodes.get(pending.group)!.children.push(ref.name);
        else this.roots.push(ref.name);
      }
      return {
        id: `e${index}`,
        from: pending.from.name,
        to: pending.to.name,
        connector: pending.connector,
        ...CONNECTOR_STYLE[pending.connector],
        label: pending.label,
        properties: pending.properties,
        range: { line: pending.line, column: pending.from.start + 1, endColumn: pending.to.end + 1 },
      };
    });
  }

  private range(start: number, end: number): SourceRange {
    return { line: this.line, column: start + 1, endColumn: Math.max(end, start + 1) + 1 };
  }

  private report(severity: Severity, message: string, range: SourceRange): void {
    this.diagnostics.push({ severity, message, ...range });
  }
}

/** Splits a line into tokens. Columns in tokens are 0-based and include `offset`. */
function tokenize(text: string, offset: number, error: (message: string, start: number, end: number) => void): Token[] | undefined {
  const tokens: Token[] = [];
  let i = 0;
  const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

  const connectorAt = (pos: number): Connector | undefined => {
    if (text.startsWith('<>', pos)) return '<>';
    if (text[pos] === '>' || text[pos] === '<') return text[pos] as Connector;
    // Dashes are only connectors when surrounded by whitespace, so `web-01` stays a name.
    if (text[pos] !== '-' || !isSpace(text[pos - 1])) return undefined;
    for (const c of ['-->', '--', '-'] as const) {
      if (text.startsWith(c, pos) && isSpace(text[pos + c.length])) return c;
    }
    return undefined;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = offset + i;
    if (ch === ',') {
      tokens.push({ type: 'comma', start, end: start + 1 });
      i++;
      continue;
    }
    if (ch === '{' || ch === '}') {
      // Text after a brace is parsed as its own segment by the caller.
      tokens.push({ type: ch === '{' ? 'lbrace' : 'rbrace', start, end: start + 1 });
      return tokens;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', start, end: start + 1, rest: text.slice(i + 1), restStart: offset + i + 1 });
      return tokens;
    }
    if (ch === '[') {
      const close = findClosingBracket(text, i);
      if (close < 0) {
        error("Missing closing ']'", start, start + 1);
        return undefined;
      }
      tokens.push({ type: 'props', raw: text.slice(i + 1, close), start, end: offset + close + 1 });
      i = close + 1;
      continue;
    }
    if (ch === ']') {
      error("Unexpected ']'", start, start + 1);
      return undefined;
    }
    const connector = connectorAt(i);
    if (connector) {
      tokens.push({ type: 'connector', value: connector, start, end: start + connector.length });
      i += connector.length;
      continue;
    }
    if (ch === '"') {
      const close = text.indexOf('"', i + 1);
      if (close < 0) {
        error('Missing closing quote', start, offset + text.length);
        return undefined;
      }
      tokens.push({ type: 'name', value: text.slice(i + 1, close), start, end: offset + close + 1 });
      i = close + 1;
      continue;
    }
    // Unquoted name: runs until a delimiter or connector; inner spaces are kept ("Main Server").
    let j = i;
    while (j < text.length && !/[,{}:\[\]"]/.test(text[j]!) && !connectorAt(j)) j++;
    const value = text.slice(i, j).trimEnd();
    tokens.push({ type: 'name', value, start, end: start + value.length });
    i = j;
  }
  return tokens;
}

export function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (!inQuote && line[i] === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

export function findClosingBracket(text: string, open: number): number {
  let inQuote = false;
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '"') inQuote = !inQuote;
    else if (!inQuote && text[i] === ']') return i;
  }
  return -1;
}

export function splitOutsideQuotes(text: string, separator: string): { text: string; start: number }[] {
  const parts: { text: string; start: number }[] = [];
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') inQuote = !inQuote;
    else if (!inQuote && text[i] === separator) {
      parts.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  parts.push({ text: text.slice(start), start });
  return parts;
}

/** Splits `label [props]` at a trailing bracket group, if any. */
function splitTrailingProps(rest: string): { label: string; props?: string; propsStart: number } {
  const trimmed = rest.trimEnd();
  if (!trimmed.endsWith(']')) return { label: rest, propsStart: -1 };
  let inQuote = false;
  for (let i = trimmed.length - 2; i >= 0; i--) {
    if (trimmed[i] === '"') inQuote = !inQuote;
    else if (!inQuote && trimmed[i] === '[') {
      return { label: trimmed.slice(0, i), props: trimmed.slice(i + 1, -1), propsStart: i };
    }
  }
  return { label: rest, propsStart: -1 };
}

export function unquote(value: string): string {
  const unwrapped = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  return unwrapped.replace(/\\n/g, '\n');
}

function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}
