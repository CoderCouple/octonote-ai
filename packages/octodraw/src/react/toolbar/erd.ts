import { applyErdEdits, type ErdEdit } from '../../dsl/edit-erd';
import type { ErdConnector, ErdDiagram, ErdEntity, ErdRelationship } from '../../dsl/erd';
import type { DiagramSelection, ToolbarResult, ToolbarValue } from './actions';

// The element toolbar's decisions for ERD diagrams, kept pure like `actions.ts`:
// tables are `node` selections (by name), relationships `edge` selections (by id,
// `r0`, `r1`, …). One action = one `applyErdEdits` = one change for the host.

export type ErdTarget = 'table' | 'tables' | 'relationship' | 'relationships';

export type ErdControl = 'count' | 'editText' | 'icon' | 'color' | 'keyColumns' | 'cardinality' | 'more' | 'delete';

export type ErdToolbarAction =
  /** Sets (or with null removes) a property on every selected table / relationship. */
  | { type: 'set'; key: string; value: string | null }
  | { type: 'cardinality'; value: ErdConnector }
  /** Renames a table (or sets `label:` when it has one); sets a relationship's label. */
  | { type: 'editText'; text: string }
  | { type: 'delete' };

/** The four relationships, read left to right as written. */
export const CARDINALITIES: readonly { value: ErdConnector; label: string; start: 'one' | 'many'; end: 'one' | 'many' }[] = [
  { value: '-', label: 'One to one', start: 'one', end: 'one' },
  { value: '<', label: 'One to many', start: 'one', end: 'many' },
  { value: '>', label: 'Many to one', start: 'many', end: 'one' },
  { value: '<>', label: 'Many to many', start: 'many', end: 'many' },
];

export function erdTables(selection: DiagramSelection | null, diagram: ErdDiagram): ErdEntity[] {
  if (!selection || selection.kind !== 'node') return [];
  return selection.ids.flatMap((id) => {
    const e = diagram.entities.get(id);
    return e ? [e] : [];
  });
}

export function erdRelationships(selection: DiagramSelection | null, diagram: ErdDiagram): ErdRelationship[] {
  if (!selection || selection.kind !== 'edge') return [];
  return selection.ids.flatMap((id) => {
    const r = diagram.relationships.find((x) => x.id === id);
    return r ? [r] : [];
  });
}

export function erdTarget(selection: DiagramSelection | null, diagram: ErdDiagram): ErdTarget | null {
  if (!selection || selection.ids.length === 0) return null;
  if (selection.kind === 'edge') {
    const n = erdRelationships(selection, diagram).length;
    return n === 0 ? null : n > 1 ? 'relationships' : 'relationship';
  }
  if (selection.kind !== 'node') return null;
  const n = erdTables(selection, diagram).length;
  return n === 0 ? null : n > 1 ? 'tables' : 'table';
}

/** The controls for a selection, left to right. */
export function erdControls(selection: DiagramSelection | null, diagram: ErdDiagram): ErdControl[] {
  switch (erdTarget(selection, diagram)) {
    case 'table':
      return ['editText', 'icon', 'color', 'keyColumns', 'more'];
    case 'tables':
      return ['count', 'icon', 'color', 'keyColumns', 'delete'];
    case 'relationship':
      return ['editText', 'cardinality', 'color', 'more'];
    case 'relationships':
      return ['count', 'cardinality', 'color', 'delete'];
    default:
      return [];
  }
}

function common(values: (string | undefined)[]): ToolbarValue {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  return values.every((v) => v === first) ? { value: first, mixed: false } : { value: undefined, mixed: true };
}

export function erdPropertyValue(selection: DiagramSelection | null, diagram: ErdDiagram, key: string): ToolbarValue {
  if (selection?.kind === 'edge') return common(erdRelationships(selection, diagram).map((r) => r.properties[key]));
  return common(erdTables(selection, diagram).map((e) => e.properties[key]));
}

export function erdCardinalityValue(selection: DiagramSelection | null, diagram: ErdDiagram): ToolbarValue {
  return common(erdRelationships(selection, diagram).map((r) => r.connector));
}

/** The text an "Edit" field starts with: the table's label or name, the relationship's label. */
export function erdEditableText(selection: DiagramSelection | null, diagram: ErdDiagram): string {
  if (!selection || selection.ids.length !== 1) return '';
  if (selection.kind === 'edge') return erdRelationships(selection, diagram)[0]?.label ?? '';
  const e = erdTables(selection, diagram)[0];
  return e ? (e.properties.label ?? e.name) : '';
}

/** Whether editing renames the table (true) or sets its label (false). */
export function erdEditRenames(selection: DiagramSelection | null, diagram: ErdDiagram): boolean {
  const e = erdTables(selection, diagram)[0];
  return !!e && e.properties.label === undefined;
}

const LABELS: Record<string, string> = { color: 'Colour', icon: 'Icon', link: 'Link', label: 'Label' };
const relNumber = (id: string) => Number(id.replace(/^\D+/, '')) || 0;

export interface PlannedErdEdits {
  edits: ErdEdit[];
  label: string;
  selection: DiagramSelection | null;
  renamed?: { from: string; to: string };
}

export function erdActionToEdits(action: ErdToolbarAction, selection: DiagramSelection | null, diagram: ErdDiagram): PlannedErdEdits | { reason: string } {
  if (!selection || selection.ids.length === 0) return { reason: 'Nothing is selected' };
  const tables = erdTables(selection, diagram);
  const rels = erdRelationships(selection, diagram);
  if (tables.length === 0 && rels.length === 0) return { reason: 'The selection is no longer in the code' };
  switch (action.type) {
    case 'set': {
      const value = action.value?.trim() || null;
      const label = LABELS[action.key] ?? action.key;
      if (rels.length) return { edits: rels.map((r) => ({ type: 'setRelationshipProperty', relationship: r.id, key: action.key, value })), label, selection };
      return { edits: tables.map((e) => ({ type: 'setEntityProperty', entity: e.name, key: action.key, value })), label, selection };
    }
    case 'cardinality':
      if (!rels.length) return { reason: 'Cardinality is for relationships' };
      return { edits: rels.map((r) => ({ type: 'setRelationshipConnector', relationship: r.id, connector: action.value })), label: 'Cardinality', selection };
    case 'editText': {
      const text = action.text.trim();
      if (rels.length) {
        if (rels.length > 1) return { reason: 'Select one relationship to edit its label' };
        return { edits: [{ type: 'setRelationshipLabel', relationship: rels[0]!.id, label: text || null }], label: 'Edit label', selection };
      }
      if (tables.length !== 1) return { reason: 'Select one table to edit its name' };
      const table = tables[0]!;
      if (!text) return { reason: 'The name cannot be blank' };
      if (table.properties.label !== undefined) return { edits: [{ type: 'setEntityProperty', entity: table.name, key: 'label', value: text }], label: 'Edit name', selection };
      if (text === table.name) return { edits: [], label: 'Rename', selection };
      return { edits: [{ type: 'renameEntity', entity: table.name, name: text }], label: 'Rename', selection: { kind: 'node', ids: [text] }, renamed: { from: table.name, to: text } };
    }
    case 'delete': {
      if (rels.length) {
        // Deleting a relationship renumbers the ones after it, so go from the last one back.
        const ids = rels.map((r) => r.id).sort((a, b) => relNumber(b) - relNumber(a));
        return { edits: ids.map((relationship) => ({ type: 'deleteRelationship', relationship })), label: ids.length > 1 ? `Delete ${ids.length} relationships` : 'Delete relationship', selection: null };
      }
      return { edits: tables.map((e) => ({ type: 'deleteEntity', entity: e.name })), label: tables.length > 1 ? `Delete ${tables.length} tables` : 'Delete table', selection: null };
    }
  }
}

/** Runs a toolbar action against ERD code: one `applyErdEdits`, all or nothing. */
export function runErdAction(source: string, action: ErdToolbarAction, selection: DiagramSelection | null, diagram: ErdDiagram): ToolbarResult {
  const plan = erdActionToEdits(action, selection, diagram);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  if (plan.edits.length === 0) return { ok: false };
  const result = applyErdEdits(source, plan.edits);
  if (result.reason) return { ok: false, reason: result.reason };
  if (!result.changed) return { ok: false };
  return { ok: true, source: result.source, label: plan.label, selection: plan.selection, ...(plan.renamed ? { renamed: plan.renamed } : {}) };
}

/** Drops tables and relationships no longer in the code; null when nothing is left. */
export function pruneErdSelection(selection: DiagramSelection | null, diagram: ErdDiagram): DiagramSelection | null {
  if (!selection) return null;
  const ids = selection.ids.filter((id) => (selection.kind === 'edge' ? diagram.relationships.some((r) => r.id === id) : selection.kind === 'node' && diagram.entities.has(id)));
  if (ids.length === selection.ids.length) return selection;
  return ids.length ? { kind: selection.kind, ids } : null;
}
