import { applyEdits, type DiagramEdit } from '../../dsl/edit';
import type { Connector, Diagram, DiagramEdge, DiagramNode } from '../../dsl/types';
import { iconSizeOf, labelSizeOf, strokeWidthOf, textSizeOf } from '../../layout/style';
import { bpmnActionToEdits, bpmnControls, type BpmnAction, type BpmnControl } from './bpmn';

// The element toolbar's decisions, kept pure so they can be tested without a DOM:
// what a selection is, which controls it gets, what its current values are, and
// which code edits a toolbar action turns into. One action = one call to
// `applyEdits` = one change (one undo step) for the host.

export type SelectionKind = 'node' | 'edge' | 'label';

/** What is selected in a diagram: boxes/groups (`node`), arrows (`edge`, view edge ids) or an icon node's label. */
export interface DiagramSelection {
  kind: SelectionKind;
  ids: string[];
}

/** What the toolbar is editing. */
export type SelectionTarget = 'box' | 'icon' | 'group' | 'arrow' | 'label' | 'boxes' | 'arrows';

export interface ToolbarContext {
  diagram: Diagram;
  /**
   * The source connections behind a drawn arrow. Drawn arrows can stand for
   * several merged connections (collapsed groups); defaults to the connection
   * with that id.
   */
  edgeSources?: (edgeId: string) => readonly DiagramEdge[];
  /** True for nodes drawn as bare icons with their label underneath. */
  isIconNode?: (nodeId: string) => boolean;
  /** A BPMN (swimlane) diagram: BPMN controls and actions (toolbar/bpmn.ts). */
  bpmn?: boolean;
}

export type ToolbarControl =
  | 'count'
  | 'editText'
  | 'shape'
  | 'icon'
  | 'color'
  | 'textColor'
  | 'border'
  | 'text'
  | 'iconSize'
  | 'labelSize'
  | 'routing'
  | 'line'
  | 'startArrow'
  | 'endArrow'
  | 'reverse'
  | 'more'
  | 'delete'
  | BpmnControl;

export type LineValue = 'solid' | 'dashed' | 'dotted';
export type ArrowHeadValue = 'none' | 'arrow' | 'open' | 'dot';

export type ToolbarAction =
  /** Sets (or with null removes) a property on every selected box / arrow. Defaults are written as a removal. */
  | { type: 'set'; key: string; value: string | null }
  /** Arrow line style: solid ↔ dashed through the connector where it has a dashed form, else `line:`. */
  | { type: 'line'; value: LineValue }
  | { type: 'arrowhead'; end: 'start' | 'end'; value: ArrowHeadValue }
  | { type: 'reverse' }
  /** Edit text: renames a box (or sets `label:` when it has one), sets an arrow's label. */
  | { type: 'editText'; text: string }
  | { type: 'delete'; keepContents?: boolean }
  | BpmnAction;

export type ToolbarResult =
  | {
      ok: true;
      source: string;
      /** Short name for the change, e.g. for an undo menu. */
      label: string;
      /** The selection to keep after the change (renames re-target it; deletes clear it). */
      selection: DiagramSelection | null;
      renamed?: { from: string; to: string };
    }
  /** Refused (`reason`), or nothing would change (no reason). */
  | { ok: false; reason?: string };

export const SHAPES = ['rectangle', 'cylinder', 'diamond', 'document', 'ellipse', 'hexagon', 'oval', 'parallelogram', 'star', 'trapezoid', 'triangle', 'circle'] as const;
export const TYPEFACES = ['rough', 'clean', 'mono'] as const;
export const SIZE_NAMES = ['small', 'medium', 'large'] as const;
export const WIDTH_NAMES = ['thin', 'medium', 'thick'] as const;

/** Default text sizes, matching the theme (boxes 14, group titles 15, arrow labels 13). */
export const DEFAULT_TEXT_SIZE = 14;
export const DEFAULT_GROUP_TEXT_SIZE = 15;
export const DEFAULT_LABEL_SIZE = 13;
export const DEFAULT_ICON_SIZE = 50;
export const TEXT_SIZE_MIN = 8;
export const TEXT_SIZE_MAX = 48;

const DASHED_FORM: Partial<Record<Connector, Connector>> = { '>': '-->', '-': '--' };
const SOLID_FORM: Partial<Record<Connector, Connector>> = { '-->': '>', '--': '-' };

const PROPERTY_LABELS: Record<string, string> = {
  color: 'Colour',
  textColor: 'Text colour',
  icon: 'Icon',
  shape: 'Shape',
  border: 'Border',
  strokeWidth: 'Width',
  textSize: 'Text size',
  typeface: 'Typeface',
  textAlign: 'Align',
  iconSize: 'Icon size',
  labelSize: 'Label size',
  routing: 'Routing',
  description: 'Description',
  link: 'Link',
  collapsed: 'Collapsed by default',
  label: 'Label',
};

// --- What is selected -----------------------------------------------------------

export function selectionTarget(selection: DiagramSelection | null, ctx: ToolbarContext): SelectionTarget | null {
  if (!selection || selection.ids.length === 0) return null;
  if (selection.kind === 'edge') return selection.ids.length > 1 ? 'arrows' : 'arrow';
  if (selection.kind === 'label') return ctx.diagram.nodes.has(selection.ids[0]!) ? 'label' : null;
  const nodes = selectedNodes(selection, ctx);
  if (nodes.length === 0) return null;
  if (nodes.length > 1) return 'boxes';
  const node = nodes[0]!;
  if (node.kind === 'group') return 'group';
  return ctx.isIconNode?.(node.id) ? 'icon' : 'box';
}

/** The controls for a selection, left to right (separators are the toolbar's business). */
export function toolbarControls(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarControl[] {
  if (ctx.bpmn) return bpmnControls(selection, ctx);
  switch (selectionTarget(selection, ctx)) {
    case 'box':
      return ['editText', 'shape', 'icon', 'color', 'border', 'text', 'more'];
    case 'icon':
      return ['editText', 'icon', 'color', 'iconSize', 'text', 'more'];
    case 'group':
      return ['editText', 'icon', 'color', 'border', 'text', 'more'];
    case 'arrow':
      return ['editText', 'labelSize', 'routing', 'color', 'line', 'startArrow', 'endArrow', 'reverse', 'more'];
    case 'label':
      return ['editText', 'text', 'textColor', 'more'];
    case 'arrows':
      return ['count', 'labelSize', 'routing', 'color', 'line', 'startArrow', 'endArrow', 'reverse', 'delete'];
    case 'boxes': {
      // Only what they all have: icon size when every one is an icon node, border when none is.
      const nodes = selectedNodes(selection!, ctx);
      const icons = nodes.filter((n) => n.kind !== 'group' && ctx.isIconNode?.(n.id)).length;
      const controls: ToolbarControl[] = ['count', 'icon', 'color'];
      if (icons === nodes.length) controls.push('iconSize');
      if (icons === 0) controls.push('border');
      controls.push('text', 'delete');
      return controls;
    }
    default:
      return [];
  }
}

export function selectedNodes(selection: DiagramSelection, ctx: ToolbarContext): DiagramNode[] {
  if (selection.kind === 'edge') return [];
  return selection.ids.flatMap((id) => {
    const node = ctx.diagram.nodes.get(id);
    return node ? [node] : [];
  });
}

/** The source connections behind the selected arrows (each once). */
export function selectedEdges(selection: DiagramSelection, ctx: ToolbarContext): DiagramEdge[] {
  if (selection.kind !== 'edge') return [];
  const seen = new Set<string>();
  const sources = ctx.edgeSources ?? ((id: string) => ctx.diagram.edges.filter((e) => e.id === id));
  return selection.ids.flatMap((id) => sources(id)).filter((e) => !seen.has(e.id) && (seen.add(e.id), true));
}

// --- Current values ---------------------------------------------------------------

export interface ToolbarValue {
  /** The common value, or undefined when unset (or mixed). */
  value: string | undefined;
  mixed: boolean;
}

function common(values: (string | undefined)[]): ToolbarValue {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  return values.every((v) => v === first) ? { value: first, mixed: false } : { value: undefined, mixed: true };
}

/** A property's value across the selection (`mixed` when the selected elements differ). */
export function propertyValue(selection: DiagramSelection | null, ctx: ToolbarContext, key: string): ToolbarValue {
  if (!selection) return { value: undefined, mixed: false };
  if (selection.kind === 'edge') return common(selectedEdges(selection, ctx).map((e) => e.properties[key]));
  return common(selectedNodes(selection, ctx).map((n) => n.properties[key]));
}

/** An arrow's line style: `line:` wins, else its connector's dash. */
export function lineOf(edge: DiagramEdge): LineValue {
  const line = edge.properties.line?.trim().toLowerCase();
  if (line === 'solid' || line === 'dashed' || line === 'dotted') return line;
  return edge.connector === '-->' || edge.connector === '--' ? 'dashed' : 'solid';
}

/** The arrowhead a connector draws at one end when no property says otherwise. */
export function impliedHead(connector: Connector, end: 'start' | 'end'): ArrowHeadValue {
  const start = connector === '<' || connector === '<>';
  const finish = connector === '>' || connector === '<>' || connector === '-->';
  if (end === 'end') return finish ? 'arrow' : 'none';
  return start ? (finish ? 'open' : 'arrow') : 'none';
}

export function headOf(edge: DiagramEdge, end: 'start' | 'end'): ArrowHeadValue {
  const value = edge.properties[end === 'start' ? 'startArrow' : 'endArrow']?.trim().toLowerCase();
  if (value === 'none' || value === 'arrow' || value === 'open' || value === 'dot') return value;
  return impliedHead(edge.connector, end);
}

export function lineValue(selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarValue {
  return selection ? common(selectedEdges(selection, ctx).map(lineOf)) : { value: undefined, mixed: false };
}

export function headValue(selection: DiagramSelection | null, ctx: ToolbarContext, end: 'start' | 'end'): ToolbarValue {
  return selection ? common(selectedEdges(selection, ctx).map((e) => headOf(e, end))) : { value: undefined, mixed: false };
}

/** The text size in px across the selection (theme defaults filled in). */
export function textSizeValue(selection: DiagramSelection | null, ctx: ToolbarContext): { size: number | undefined; mixed: boolean } {
  if (!selection) return { size: undefined, mixed: false };
  const sizes =
    selection.kind === 'edge'
      ? selectedEdges(selection, ctx).map((e) => labelSizeOf(e.properties.labelSize) ?? DEFAULT_LABEL_SIZE)
      : selectedNodes(selection, ctx).map((n) => textSizeOf(n.properties.textSize) ?? (n.kind === 'group' ? DEFAULT_GROUP_TEXT_SIZE : DEFAULT_TEXT_SIZE));
  const v = common(sizes.map(String));
  return { size: v.value === undefined ? undefined : Number(v.value), mixed: v.mixed };
}

/** Named size for a px value, if it is one of small / medium / large. */
export function sizeName(size: number | undefined, kind: 'text' | 'label' | 'icon'): (typeof SIZE_NAMES)[number] | undefined {
  if (size === undefined) return undefined;
  const of = kind === 'label' ? labelSizeOf : kind === 'icon' ? iconSizeOf : textSizeOf;
  return SIZE_NAMES.find((name) => of(name) === size);
}

export function iconSizeValue(selection: DiagramSelection | null, ctx: ToolbarContext): { size: number | undefined; mixed: boolean } {
  if (!selection) return { size: undefined, mixed: false };
  const v = common(selectedNodes(selection, ctx).map((n) => String(iconSizeOf(n.properties.iconSize) ?? DEFAULT_ICON_SIZE)));
  return { size: v.value === undefined ? undefined : Number(v.value), mixed: v.mixed };
}

/** Named stroke width for a value (thin / medium / thick), or undefined. */
export function widthName(value: string | undefined): (typeof WIDTH_NAMES)[number] | undefined {
  const width = strokeWidthOf(value);
  return width === undefined ? undefined : WIDTH_NAMES.find((name) => strokeWidthOf(name) === width);
}

/** The text an "Edit text" field starts with. */
export function editableText(selection: DiagramSelection | null, ctx: ToolbarContext): string {
  if (!selection || selection.ids.length !== 1) return '';
  if (selection.kind === 'edge') return selectedEdges(selection, ctx)[0]?.label ?? '';
  const node = ctx.diagram.nodes.get(selection.ids[0]!);
  return node ? (node.properties.label ?? node.id) : '';
}

/** Whether Edit text on this selection renames (true) or sets a `label:` / arrow label (false). */
export function editRenames(selection: DiagramSelection | null, ctx: ToolbarContext): boolean {
  if (!selection || selection.kind === 'edge') return false;
  const node = ctx.diagram.nodes.get(selection.ids[0]!);
  return !!node && node.properties.label === undefined;
}

// --- Actions → edits -------------------------------------------------------------

/** A value equal to today's default is written as "no property", so the code stays as plain as it was. */
function normalized(key: string, value: string | null, node: DiagramNode | undefined, ctx: ToolbarContext): string | null {
  if (value === null) return null;
  const v = value.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  switch (key) {
    case 'shape':
      return lower === 'rectangle' ? null : v;
    case 'border':
    case 'line':
      return lower === 'solid' ? null : v;
    case 'textAlign':
      return lower === 'center' ? null : v;
    case 'routing':
      return lower === 'auto' ? null : v;
    case 'typeface':
      return lower === (ctx.diagram.settings.typeface || 'clean').toLowerCase() ? null : v;
    case 'iconSize':
      return iconSizeOf(v) === DEFAULT_ICON_SIZE ? null : v;
    case 'labelSize':
      return labelSizeOf(v) === DEFAULT_LABEL_SIZE ? null : v;
    case 'textSize':
      return textSizeOf(v) === (node?.kind === 'group' ? DEFAULT_GROUP_TEXT_SIZE : DEFAULT_TEXT_SIZE) ? null : v;
    case 'collapsed':
      return lower === 'false' ? null : v;
    case 'strokeWidth':
      // Thin is how boxes, groups and single arrows are drawn already.
      return strokeWidthOf(v) === 1 ? null : v;
    default:
      return v;
  }
}

const edgeNumber = (id: string) => Number(id.replace(/^\D+/, '')) || 0;

export interface PlannedEdits {
  edits: DiagramEdit[];
  label: string;
  selection: DiagramSelection | null;
  renamed?: { from: string; to: string };
}

/** The code edits for a toolbar action on a selection, or a reason it can't be done. */
export function actionToEdits(action: ToolbarAction, selection: DiagramSelection | null, ctx: ToolbarContext): PlannedEdits | { reason: string } {
  if (!selection || selection.ids.length === 0) return { reason: 'Nothing is selected' };
  const bpmnPlan = ctx.bpmn ? bpmnActionToEdits(action, selection, ctx) : undefined;
  if (bpmnPlan) return bpmnPlan;
  const edges = selectedEdges(selection, ctx);
  const nodes = selectedNodes(selection, ctx);
  if (selection.kind === 'edge' ? edges.length === 0 : nodes.length === 0) return { reason: 'The selection is no longer in the code' };

  switch (action.type) {
    case 'set': {
      const label = PROPERTY_LABELS[action.key] ?? action.key;
      if (selection.kind === 'edge') {
        const value = normalized(action.key, action.value, undefined, ctx);
        return { edits: edges.map((e) => ({ type: 'setEdgeProperty', edgeId: e.id, key: action.key, value })), label, selection };
      }
      return {
        edits: nodes.map((n) => ({ type: 'setNodeProperty', nodeId: n.id, key: action.key, value: normalized(action.key, action.value, n, ctx) })),
        label,
        selection,
      };
    }
    case 'line': {
      if (selection.kind !== 'edge') return { reason: 'Line style is for arrows' };
      const edits: DiagramEdit[] = [];
      for (const e of edges) {
        const current = e.properties.line !== undefined;
        if (action.value === 'dotted') {
          edits.push({ type: 'setEdgeProperty', edgeId: e.id, key: 'line', value: 'dotted' });
          continue;
        }
        const target = action.value === 'dashed' ? DASHED_FORM[e.connector] : SOLID_FORM[e.connector];
        const isDashed = e.connector === '-->' || e.connector === '--';
        if (action.value === 'dashed' && !target && !isDashed) {
          // `<` and `<>` have no dashed connector.
          edits.push({ type: 'setEdgeProperty', edgeId: e.id, key: 'line', value: 'dashed' });
          continue;
        }
        if (target) edits.push({ type: 'setEdgeConnector', edgeId: e.id, connector: target });
        if (current) edits.push({ type: 'setEdgeProperty', edgeId: e.id, key: 'line', value: null });
      }
      return { edits, label: 'Line', selection };
    }
    case 'arrowhead': {
      if (selection.kind !== 'edge') return { reason: 'Arrowheads are for arrows' };
      const key = action.end === 'start' ? 'startArrow' : 'endArrow';
      return {
        edits: edges.map((e) => ({ type: 'setEdgeProperty', edgeId: e.id, key, value: action.value === impliedHead(e.connector, action.end) ? null : action.value })),
        label: action.end === 'start' ? 'Start arrowhead' : 'End arrowhead',
        selection,
      };
    }
    case 'reverse':
      if (selection.kind !== 'edge') return { reason: 'Only arrows can be reversed' };
      return { edits: edges.map((e) => ({ type: 'reverseEdge', edgeId: e.id })), label: 'Reverse', selection };
    case 'editText': {
      if (selection.ids.length !== 1 && selection.kind !== 'edge') return { reason: 'Select one element to edit its text' };
      const text = action.text.trim();
      if (selection.kind === 'edge') {
        return { edits: edges.map((e) => ({ type: 'setEdgeLabel', edgeId: e.id, label: text || null })), label: 'Edit label', selection };
      }
      const node = nodes[0]!;
      if (!text) return { reason: 'The text cannot be blank' };
      if (node.properties.label !== undefined) return { edits: [{ type: 'setNodeProperty', nodeId: node.id, key: 'label', value: text }], label: 'Edit text', selection };
      if (text === node.id) return { edits: [], label: 'Rename', selection };
      return {
        edits: [{ type: 'renameNode', nodeId: node.id, name: text }],
        label: 'Rename',
        selection: { kind: selection.kind, ids: [text] },
        renamed: { from: node.id, to: text },
      };
    }
    case 'delete': {
      if (selection.kind === 'edge') {
        // Deleting a connection renumbers the ones after it, so go from the last one back.
        const ids = edges.map((e) => e.id).sort((a, b) => edgeNumber(b) - edgeNumber(a));
        return { edits: ids.map((edgeId) => ({ type: 'deleteEdge', edgeId })), label: ids.length > 1 ? `Delete ${ids.length} arrows` : 'Delete arrow', selection: null };
      }
      // A box inside a selected group goes with the group.
      const selected = new Set(nodes.map((n) => n.id));
      const inside = (n: DiagramNode) => {
        for (let p = n.parent; p; p = ctx.diagram.nodes.get(p)?.parent ?? null) if (selected.has(p)) return true;
        return false;
      };
      const targets = nodes.filter((n) => !inside(n));
      const keep = action.keepContents === true;
      return {
        edits: targets.map((n) => ({ type: 'deleteNode', nodeId: n.id, ...(keep ? { keepContents: true } : {}) })),
        label: keep ? 'Ungroup' : targets.length > 1 ? `Delete ${targets.length} boxes` : 'Delete',
        selection: null,
      };
    }
    default:
      // BPMN-only actions (toolbar/bpmn.ts) on anything else.
      return { reason: "That doesn't apply here" };
  }
}

/** Runs a toolbar action against the code: one `applyEdits`, all or nothing. */
export function runToolbarAction(source: string, action: ToolbarAction, selection: DiagramSelection | null, ctx: ToolbarContext): ToolbarResult {
  const plan = actionToEdits(action, selection, ctx);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  if (plan.edits.length === 0) return { ok: false };
  const result = applyEdits(source, plan.edits);
  if (result.reason) return { ok: false, reason: result.reason };
  if (!result.changed) return { ok: false };
  return { ok: true, source: result.source, label: plan.label, selection: plan.selection, ...(plan.renamed ? { renamed: plan.renamed } : {}) };
}

/** Shift-click: adds an element of the same kind or removes it; another kind starts over. */
export function toggleInSelection(selection: DiagramSelection | null, kind: SelectionKind, id: string): DiagramSelection | null {
  if (!selection || selection.kind !== kind || kind === 'label') return { kind, ids: [id] };
  const ids = selection.ids.includes(id) ? selection.ids.filter((x) => x !== id) : [...selection.ids, id];
  return ids.length ? { kind, ids } : null;
}

/** Drops ids that are no longer shown (after an outside edit or a drill); null when nothing is left. */
export function pruneSelection(selection: DiagramSelection | null, nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>): DiagramSelection | null {
  if (!selection) return null;
  const ids = selection.ids.filter((id) => (selection.kind === 'edge' ? edgeIds : nodeIds).has(id));
  if (ids.length === selection.ids.length) return selection;
  return ids.length ? { kind: selection.kind, ids } : null;
}

export function sameSelection(a: DiagramSelection | null, b: DiagramSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.ids.length !== b.ids.length) return false;
  return a.ids.every((id, i) => id === b.ids[i]);
}
