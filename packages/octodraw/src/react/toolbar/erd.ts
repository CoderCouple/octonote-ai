import { applyErdEdits, ERD_COLUMN_KEYS, type ErdEdit } from '../../dsl/edit-erd';
import type { ErdAttribute, ErdConnector, ErdDiagram, ErdEntity, ErdRelationship } from '../../dsl/erd';
import type { DiagramSelection, ToolbarResult, ToolbarValue } from './actions';

// The element toolbar's decisions for ERD diagrams, kept pure like `actions.ts`:
// tables are `node` selections (by name), relationships `edge` selections (by id,
// `r0`, `r1`, …), columns `column` selections (`table.column`). One action = one
// `applyErdEdits` = one change for the host.

export type ErdTarget = 'table' | 'tables' | 'relationship' | 'relationships' | 'column' | 'columns';

export type ErdControl = 'count' | 'editText' | 'icon' | 'color' | 'keyColumns' | 'cardinality' | 'columnType' | 'columnKeys' | 'more' | 'delete';

export type ErdToolbarAction =
  /** Sets (or with null removes) a property on every selected table / relationship. */
  | { type: 'set'; key: string; value: string | null }
  | { type: 'cardinality'; value: ErdConnector }
  /** Renames a table (or sets `label:` when it has one) or a column; sets a relationship's label. */
  | { type: 'editText'; text: string }
  /** Sets the type of every selected column. */
  | { type: 'columnType'; value: string }
  /** Turns a flag (`pk`, `fk`, `unique`, `nullable`) on or off on every selected column. */
  | { type: 'columnKey'; key: string; on: boolean }
  /** Adds a column: at the end of the selected table, or below the selected column. */
  | { type: 'addColumn' }
  | { type: 'delete' };

/** The four relationships, read left to right as written. */
export const CARDINALITIES: readonly { value: ErdConnector; label: string; start: 'one' | 'many'; end: 'one' | 'many' }[] = [
  { value: '-', label: 'One to one', start: 'one', end: 'one' },
  { value: '<', label: 'One to many', start: 'one', end: 'many' },
  { value: '>', label: 'Many to one', start: 'many', end: 'one' },
  { value: '<>', label: 'Many to many', start: 'many', end: 'many' },
];

/** Common column types offered in the Type menu (anything else through Edit…). */
export const ERD_COLUMN_TYPES = ['string', 'int', 'float', 'boolean', 'date', 'datetime', 'uuid', 'json'] as const;

/** The column flags the Key menu toggles. */
export const ERD_KEY_OPTIONS: readonly { key: (typeof ERD_COLUMN_KEYS)[number]; label: string; short: string }[] = [
  { key: 'pk', label: 'Primary key', short: 'PK' },
  { key: 'fk', label: 'Foreign key', short: 'FK' },
  { key: 'unique', label: 'Unique', short: 'UQ' },
  { key: 'nullable', label: 'Nullable', short: 'NULL' },
];

/** A selected column: its table and its parsed attribute. */
export interface ErdColumnRef {
  id: string;
  entity: ErdEntity;
  attribute: ErdAttribute;
}

/** `table.column` → the column (table names may not contain '.', so the longest table prefix wins). */
export function erdColumn(id: string, diagram: ErdDiagram): ErdColumnRef | undefined {
  let found: ErdColumnRef | undefined;
  for (const entity of diagram.entities.values()) {
    if (!id.startsWith(`${entity.name}.`) || (found && found.entity.name.length > entity.name.length)) continue;
    const attribute = entity.attributes.find((a) => a.name === id.slice(entity.name.length + 1));
    if (attribute) found = { id, entity, attribute };
  }
  return found;
}

export const erdColumnId = (entity: string, column: string) => `${entity}.${column}`;

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

export function erdColumns(selection: DiagramSelection | null, diagram: ErdDiagram): ErdColumnRef[] {
  if (!selection || selection.kind !== 'column') return [];
  return selection.ids.flatMap((id) => {
    const c = erdColumn(id, diagram);
    return c ? [c] : [];
  });
}

export function erdTarget(selection: DiagramSelection | null, diagram: ErdDiagram): ErdTarget | null {
  if (!selection || selection.ids.length === 0) return null;
  const count = (n: number, one: ErdTarget, many: ErdTarget) => (n === 0 ? null : n > 1 ? many : one);
  if (selection.kind === 'edge') return count(erdRelationships(selection, diagram).length, 'relationship', 'relationships');
  if (selection.kind === 'column') return count(erdColumns(selection, diagram).length, 'column', 'columns');
  if (selection.kind !== 'node') return null;
  return count(erdTables(selection, diagram).length, 'table', 'tables');
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
    case 'column':
      return ['editText', 'columnType', 'columnKeys', 'more'];
    case 'columns':
      return ['count', 'columnType', 'columnKeys', 'delete'];
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

export function erdColumnTypeValue(selection: DiagramSelection | null, diagram: ErdDiagram): ToolbarValue {
  return common(erdColumns(selection, diagram).map((c) => c.attribute.type));
}

const hasKey = (a: ErdAttribute, key: string) => a.meta.some((m) => m.toLowerCase() === key);

/** Whether a flag is on for the selected columns: 'on', 'off', or mixed. */
export function erdColumnKeyValue(selection: DiagramSelection | null, diagram: ErdDiagram, key: string): ToolbarValue {
  return common(erdColumns(selection, diagram).map((c) => (hasKey(c.attribute, key) ? 'on' : 'off')));
}

/** The text an "Edit" field starts with: the table's label or name, the column's name, the relationship's label. */
export function erdEditableText(selection: DiagramSelection | null, diagram: ErdDiagram): string {
  if (!selection || selection.ids.length !== 1) return '';
  if (selection.kind === 'edge') return erdRelationships(selection, diagram)[0]?.label ?? '';
  if (selection.kind === 'column') return erdColumns(selection, diagram)[0]?.attribute.name ?? '';
  const e = erdTables(selection, diagram)[0];
  return e ? (e.properties.label ?? e.name) : '';
}

/** Whether editing renames the table (true) or sets its label (false). */
export function erdEditRenames(selection: DiagramSelection | null, diagram: ErdDiagram): boolean {
  const e = erdTables(selection, diagram)[0];
  return !!e && e.properties.label === undefined;
}

/** How many relationships use the selected columns (deleting is refused while any do). */
export function erdColumnUses(selection: DiagramSelection | null, diagram: ErdDiagram): number {
  const ids = new Set(erdColumns(selection, diagram).map((c) => c.id));
  return diagram.relationships.filter((r) => [r.from, r.to].some((end) => end.attribute !== undefined && ids.has(erdColumnId(end.entity, end.attribute)))).length;
}

/** A column name not used in the table yet: `column`, `column_2`, … */
export function newColumnName(entity: ErdEntity): string {
  const taken = new Set(entity.attributes.map((a) => a.name));
  if (!taken.has('column')) return 'column';
  let n = 2;
  while (taken.has(`column_${n}`)) n++;
  return `column_${n}`;
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
  const cols = erdColumns(selection, diagram);
  if (tables.length === 0 && rels.length === 0 && cols.length === 0) return { reason: 'The selection is no longer in the code' };
  switch (action.type) {
    case 'set': {
      const value = action.value?.trim() || null;
      const label = LABELS[action.key] ?? action.key;
      if (cols.length) return { reason: 'Columns have no properties' };
      if (rels.length) return { edits: rels.map((r) => ({ type: 'setRelationshipProperty', relationship: r.id, key: action.key, value })), label, selection };
      return { edits: tables.map((e) => ({ type: 'setEntityProperty', entity: e.name, key: action.key, value })), label, selection };
    }
    case 'cardinality':
      if (!rels.length) return { reason: 'Cardinality is for relationships' };
      return { edits: rels.map((r) => ({ type: 'setRelationshipConnector', relationship: r.id, connector: action.value })), label: 'Cardinality', selection };
    case 'columnType': {
      if (!cols.length) return { reason: 'Type is for columns' };
      const value = action.value.trim();
      if (!value) return { reason: 'A type cannot be blank' };
      return { edits: cols.map((c) => ({ type: 'setColumnType', entity: c.entity.name, column: c.attribute.name, columnType: value })), label: 'Column type', selection };
    }
    case 'columnKey':
      if (!cols.length) return { reason: 'Keys are for columns' };
      return { edits: cols.map((c) => ({ type: 'setColumnKey', entity: c.entity.name, column: c.attribute.name, key: action.key, on: action.on })), label: action.on ? `Mark ${action.key}` : `Unmark ${action.key}`, selection };
    case 'addColumn': {
      const at = cols.length === 1 ? cols[0]! : undefined;
      const table = at?.entity ?? (tables.length === 1 ? tables[0] : undefined);
      if (!table) return { reason: 'Select one table or column to add a column' };
      const name = newColumnName(table);
      return {
        edits: [{ type: 'addColumn', entity: table.name, name, columnType: 'string', ...(at ? { after: at.attribute.name } : {}) }],
        label: 'Add column',
        selection: { kind: 'column', ids: [erdColumnId(table.name, name)] },
      };
    }
    case 'editText': {
      const text = action.text.trim();
      if (rels.length) {
        if (rels.length > 1) return { reason: 'Select one relationship to edit its label' };
        return { edits: [{ type: 'setRelationshipLabel', relationship: rels[0]!.id, label: text || null }], label: 'Edit label', selection };
      }
      if (cols.length) {
        if (cols.length > 1) return { reason: 'Select one column to edit its name' };
        const c = cols[0]!;
        if (!text) return { reason: 'The name cannot be blank' };
        if (text === c.attribute.name) return { edits: [], label: 'Rename column', selection };
        return { edits: [{ type: 'renameColumn', entity: c.entity.name, column: c.attribute.name, name: text }], label: 'Rename column', selection: { kind: 'column', ids: [erdColumnId(c.entity.name, text)] } };
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
      if (cols.length) {
        return { edits: cols.map((c) => ({ type: 'deleteColumn', entity: c.entity.name, column: c.attribute.name })), label: cols.length > 1 ? `Delete ${cols.length} columns` : 'Delete column', selection: null };
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

/** Drops tables, relationships and columns no longer in the code; null when nothing is left. */
export function pruneErdSelection(selection: DiagramSelection | null, diagram: ErdDiagram): DiagramSelection | null {
  if (!selection) return null;
  const alive = (id: string) => {
    if (selection.kind === 'edge') return diagram.relationships.some((r) => r.id === id);
    if (selection.kind === 'column') return !!erdColumn(id, diagram);
    return selection.kind === 'node' && diagram.entities.has(id);
  };
  const ids = selection.ids.filter(alive);
  if (ids.length === selection.ids.length) return selection;
  return ids.length ? { kind: selection.kind, ids } : null;
}
