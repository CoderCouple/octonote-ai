import type { DiagramEdit } from '../../dsl/edit';
import type { Diagram, DiagramEdge, DiagramNode } from '../../dsl/types';
import {
  actionToEdits,
  lineOf,
  selectedEdges,
  selectedNodes,
  type DiagramSelection,
  type PlannedEdits,
  type ToolbarAction,
  type ToolbarContext,
  type ToolbarControl,
  type ToolbarValue,
} from './actions';

// The element toolbar for BPMN (swimlane) diagrams. BPMN is the flow syntax with
// `type:` on flow objects, so the flow edits apply unchanged; this file adds what
// is BPMN-only: the element type, gateway kind, event trigger and boundary
// events, and keeps the code valid when one of them changes (a gateway's
// `gateway:` goes when it stops being a gateway, an event's `event:` and
// `attached:` when it stops being an event). Pure, like actions.ts.

export const BPMN_TYPES = ['activity', 'event', 'gateway', 'subprocess', 'data', 'store'] as const;
export type BpmnType = (typeof BPMN_TYPES)[number];
export const GATEWAY_KINDS = ['exclusive', 'parallel', 'inclusive', 'event'] as const;
export type GatewayKind = (typeof GATEWAY_KINDS)[number];
export const EVENT_TRIGGERS = ['none', 'message', 'timer', 'error', 'signal'] as const;
export type EventTrigger = (typeof EVENT_TRIGGERS)[number];

export type BpmnControl =
  /** Element type ▾ (activity / event / gateway / subprocess / data object / data store). */
  | 'bpmnType'
  /** Gateway kind ▾, gateways only. */
  | 'gatewayKind'
  /** Event trigger ▾, events only. */
  | 'eventTrigger'
  /** Connection line ▾: solid sequence flow or dashed. */
  | 'bpmnLine'
  /** A fixed tag for connections whose look is set by BPMN (message flows between pools, data associations). */
  | 'connectionKind';

export type BpmnAction =
  | { type: 'bpmnType'; value: BpmnType }
  /** Boundary event: sits on this task's edge (null detaches it). */
  | { type: 'attach'; task: string | null };

/** What a BPMN connection is: a sequence flow, a message flow (between pools) or a data association. */
export type ConnectionKind = 'sequence' | 'message' | 'association';

export const bpmnTypeOf = (node: DiagramNode): BpmnType => BPMN_TYPES.find((t) => t === node.properties.type?.trim().toLowerCase()) ?? 'activity';
const boxed = (t: BpmnType) => t === 'activity' || t === 'subprocess';
const isElement = (node: DiagramNode) => node.kind === 'node';

/** The pool an element is in: its top-level group (a boundary event: its task's pool). */
export function poolOf(diagram: Diagram, id: string): string | null {
  const node = diagram.nodes.get(id);
  if (!node) return null;
  const host = node.kind === 'node' && bpmnTypeOf(node) === 'event' && node.properties.attached ? diagram.nodes.get(node.properties.attached) : undefined;
  let cur: DiagramNode | undefined = host ?? node;
  let top: DiagramNode | undefined;
  while (cur) {
    top = cur;
    cur = cur.parent ? diagram.nodes.get(cur.parent) : undefined;
  }
  return top && top.kind === 'group' && top.id !== id ? top.id : null;
}

export function connectionKind(diagram: Diagram, edge: DiagramEdge): ConnectionKind {
  const type = (id: string) => {
    const n = diagram.nodes.get(id);
    return n && n.kind === 'node' ? bpmnTypeOf(n) : undefined;
  };
  const data = (id: string) => type(id) === 'data' || type(id) === 'store';
  if (data(edge.from) || data(edge.to)) return 'association';
  return poolOf(diagram, edge.from) !== poolOf(diagram, edge.to) ? 'message' : 'sequence';
}

/** Pools are top-level groups; groups inside them are lanes. */
export function bandKind(diagram: Diagram, id: string): 'pool' | 'lane' | null {
  const node = diagram.nodes.get(id);
  if (!node || node.kind !== 'group') return null;
  return node.parent ? 'lane' : 'pool';
}

/** The controls for a BPMN selection, left to right. */
export function bpmnControls(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarControl[] {
  if (!selection || selection.ids.length === 0 || selection.kind === 'label') return [];
  if (selection.kind === 'edge') {
    const edges = selectedEdges(selection, ctx);
    if (!edges.length) return [];
    const kinds = new Set(edges.map((e) => connectionKind(ctx.diagram, e)));
    const style: ToolbarControl[] = kinds.size === 1 && kinds.has('sequence') ? ['bpmnLine'] : kinds.size === 1 ? ['connectionKind'] : [];
    if (selection.ids.length > 1) return ['count', 'color', ...style, 'reverse', 'delete'];
    return ['editText', 'color', ...style, 'reverse', 'more'];
  }
  const nodes = selectedNodes(selection, ctx);
  if (!nodes.length) return [];
  const elements = nodes.filter(isElement);
  const types = new Set(elements.map(bpmnTypeOf));
  const kindControls: ToolbarControl[] = [];
  if (elements.length === nodes.length) {
    kindControls.push('bpmnType');
    if (types.size === 1 && types.has('gateway')) kindControls.push('gatewayKind');
    if (types.size === 1 && types.has('event')) kindControls.push('eventTrigger');
  }
  if (nodes.length > 1) return ['count', ...kindControls, 'color', 'delete'];
  if (!elements.length) return ['editText', 'color', 'more'];
  return ['editText', ...kindControls, 'color', 'more'];
}

const common = (values: string[]): ToolbarValue => {
  if (!values.length) return { value: undefined, mixed: false };
  return values.every((v) => v === values[0]) ? { value: values[0], mixed: false } : { value: undefined, mixed: true };
};

export function bpmnTypeValue(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarValue {
  return selection ? common(selectedNodes(selection, ctx).filter(isElement).map(bpmnTypeOf)) : { value: undefined, mixed: false };
}

export function gatewayKindValue(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarValue {
  if (!selection) return { value: undefined, mixed: false };
  return common(selectedNodes(selection, ctx).map((n) => GATEWAY_KINDS.find((k) => k === n.properties.gateway?.trim().toLowerCase()) ?? 'exclusive'));
}

export function eventTriggerValue(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarValue {
  if (!selection) return { value: undefined, mixed: false };
  return common(selectedNodes(selection, ctx).map((n) => EVENT_TRIGGERS.find((k) => k === n.properties.event?.trim().toLowerCase()) ?? 'none'));
}

/** Solid or dashed across the selected sequence flows. */
export function bpmnLineValue(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarValue {
  return selection ? common(selectedEdges(selection, ctx).map((e) => (lineOf(e) === 'solid' ? 'solid' : 'dashed'))) : { value: undefined, mixed: false };
}

export function connectionKindValue(selection: DiagramSelection | null, ctx: ToolbarContext): ConnectionKind | undefined {
  if (!selection) return undefined;
  const v = common(selectedEdges(selection, ctx).map((e) => connectionKind(ctx.diagram, e)));
  return v.value as ConnectionKind | undefined;
}

/** Tasks (activities and subprocesses) an event can be attached to. */
export function attachableTasks(ctx: ToolbarContext): string[] {
  return [...ctx.diagram.nodes.values()].filter((n) => isElement(n) && boxed(bpmnTypeOf(n))).map((n) => n.id);
}

/** The code edits for a BPMN-only action, or undefined to use the flow behaviour. */
export function bpmnActionToEdits(action: ToolbarAction, selection: DiagramSelection | null, ctx: ToolbarContext): PlannedEdits | { reason: string } | undefined {
  if (!selection || selection.ids.length === 0 || selection.kind === 'edge') return undefined;
  const diagram = ctx.diagram;
  const nodes = selectedNodes(selection, ctx);
  if (!nodes.length) return undefined;
  switch (action.type) {
    case 'bpmnType': {
      const elements = nodes.filter(isElement);
      if (elements.length !== nodes.length) return { reason: 'Pools and lanes have no type' };
      const target = action.value;
      const edits: DiagramEdit[] = [];
      const selected = new Set(elements.map((n) => n.id));
      // Detection needs one activity, event or gateway written as such; keep one if this would remove the last.
      const typedElsewhere = [...diagram.nodes.values()].some((n) => isElement(n) && !selected.has(n.id) && /^(activity|event|gateway)$/i.test(n.properties.type?.trim() ?? ''));
      const keepsBpmn = typedElsewhere || target === 'event' || target === 'gateway';
      for (const n of elements) {
        const before = bpmnTypeOf(n);
        // Activity is the default, so it is written as "no property" (unless it has to stay to keep this a BPMN diagram).
        const explicit = target === 'activity' && !keepsBpmn && n === elements[0];
        edits.push({ type: 'setNodeProperty', nodeId: n.id, key: 'type', value: target === 'activity' && !explicit ? null : target });
        if (target !== 'gateway' && n.properties.gateway !== undefined) edits.push({ type: 'setNodeProperty', nodeId: n.id, key: 'gateway', value: null });
        if (target !== 'event' && n.properties.event !== undefined) edits.push({ type: 'setNodeProperty', nodeId: n.id, key: 'event', value: null });
        if (target !== 'event' && n.properties.attached !== undefined) edits.push({ type: 'setNodeProperty', nodeId: n.id, key: 'attached', value: null });
        // A task that stops being a task lets go of its boundary events.
        if (boxed(before) && !boxed(target)) edits.push(...detachFrom(diagram, new Set([n.id]), new Set()));
      }
      if (!keepsBpmn && target !== 'activity') {
        // Everything typed is being turned into an extension type: write another element's activity type out.
        const other = [...diagram.nodes.values()].find((n) => isElement(n) && !selected.has(n.id) && bpmnTypeOf(n) === 'activity');
        if (!other) return { reason: 'A process needs at least one activity, event or gateway' };
        edits.push({ type: 'setNodeProperty', nodeId: other.id, key: 'type', value: 'activity' });
      }
      return { edits, label: 'Type', selection };
    }
    case 'attach': {
      const events = nodes.filter((n) => isElement(n) && bpmnTypeOf(n) === 'event');
      if (events.length !== nodes.length) return { reason: 'Only events can sit on a task' };
      if (action.task !== null) {
        const host = diagram.nodes.get(action.task);
        if (!host || !isElement(host) || !boxed(bpmnTypeOf(host))) return { reason: `'${action.task}' isn't a task` };
        if (events.some((e) => e.id === action.task)) return { reason: 'An event cannot sit on itself' };
      }
      return { edits: events.map((n) => ({ type: 'setNodeProperty', nodeId: n.id, key: 'attached', value: action.task })), label: action.task ? 'Attach to task' : 'Detach from task', selection };
    }
    case 'set': {
      const key = action.key;
      if (key !== 'gateway' && key !== 'event') return undefined;
      const v = action.value?.trim().toLowerCase() || null;
      // Defaults are written as "no property": exclusive gateways, events without a trigger.
      const value = v === null || (key === 'gateway' && v === 'exclusive') || (key === 'event' && v === 'none') ? null : v;
      const wanted = key === 'gateway' ? 'gateway' : 'event';
      if (nodes.some((n) => !isElement(n) || bpmnTypeOf(n) !== wanted)) return { reason: key === 'gateway' ? 'Gateway kind is for gateways' : 'Triggers are for events' };
      return { edits: nodes.map((n) => ({ type: 'setNodeProperty', nodeId: n.id, key, value })), label: key === 'gateway' ? 'Gateway kind' : 'Event trigger', selection };
    }
    case 'delete': {
      const base = actionToEdits(action, selection, { ...ctx, bpmn: false });
      if ('reason' in base) return base;
      // Boundary events on deleted tasks become ordinary events (their `attached:` would point at nothing).
      const deleted = new Set<string>();
      const walk = (id: string) => {
        deleted.add(id);
        if (!action.keepContents) for (const c of diagram.nodes.get(id)?.children ?? []) walk(c);
      };
      for (const n of nodes) walk(n.id);
      return { ...base, edits: [...detachFrom(diagram, deleted, deleted), ...base.edits] };
    }
    default:
      return undefined;
  }
}

/** Drops `attached:` from events sitting on any of `hosts` (except events in `skip`, which are handled already). */
function detachFrom(diagram: Diagram, hosts: ReadonlySet<string>, skip: ReadonlySet<string>): DiagramEdit[] {
  const edits: DiagramEdit[] = [];
  for (const n of diagram.nodes.values()) {
    const host = n.properties.attached;
    if (host && hosts.has(host) && !skip.has(n.id)) edits.push({ type: 'setNodeProperty', nodeId: n.id, key: 'attached', value: null });
  }
  return edits;
}
