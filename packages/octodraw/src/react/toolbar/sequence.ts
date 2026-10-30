import {
  applySequenceEdits,
  messageDirectionOf,
  messageLineOf,
  participantMessageCount,
  type MessageDirection,
  type MessageLine,
  type SequenceEdit,
} from '../../dsl/edit-sequence';
import type { Participant, SequenceDiagram, SequenceEvent } from '../../dsl/sequence';
import type { DiagramSelection, ToolbarResult, ToolbarValue } from './actions';

// The element toolbar's decisions for sequence diagrams, kept pure like
// `actions.ts`: participants are `node` selections (by name), messages `edge`
// selections (`m<index>`, the order of `SequenceLayout.messages`).

export type SequenceTarget = 'participant' | 'participants' | 'message' | 'messages';

export type SequenceControl = 'count' | 'editText' | 'icon' | 'color' | 'line' | 'direction' | 'more' | 'delete';

export type SequenceToolbarAction =
  | { type: 'set'; key: string; value: string | null }
  | { type: 'line'; value: MessageLine }
  | { type: 'direction'; value: MessageDirection }
  /** Renames a participant (or sets `label:` when it has one); sets a message's label. */
  | { type: 'editText'; text: string }
  | { type: 'delete' };

export type SequenceMessage = Extract<SequenceEvent, { type: 'message' }> & { id: string };

export function sequenceMessages(diagram: SequenceDiagram): SequenceMessage[] {
  return diagram.events.flatMap((e) => (e.type === 'message' ? [e] : [])).map((e, i) => ({ ...e, id: `m${i}` }));
}

export function selectedParticipants(selection: DiagramSelection | null, diagram: SequenceDiagram): Participant[] {
  if (!selection || selection.kind !== 'node') return [];
  return selection.ids.flatMap((id) => {
    const p = diagram.participants.get(id);
    return p ? [p] : [];
  });
}

export function selectedMessages(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceMessage[] {
  if (!selection || selection.kind !== 'edge') return [];
  const all = sequenceMessages(diagram);
  return selection.ids.flatMap((id) => all.filter((m) => m.id === id));
}

export function sequenceTarget(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceTarget | null {
  if (!selection || selection.ids.length === 0) return null;
  if (selection.kind === 'edge') {
    const n = selectedMessages(selection, diagram).length;
    return n === 0 ? null : n > 1 ? 'messages' : 'message';
  }
  if (selection.kind !== 'node') return null;
  const n = selectedParticipants(selection, diagram).length;
  return n === 0 ? null : n > 1 ? 'participants' : 'participant';
}

export function sequenceControls(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceControl[] {
  switch (sequenceTarget(selection, diagram)) {
    case 'participant':
      return ['editText', 'icon', 'color', 'more'];
    case 'participants':
      return ['count', 'icon', 'color', 'delete'];
    case 'message':
      return ['editText', 'color', 'line', 'direction', 'more'];
    case 'messages':
      return ['count', 'color', 'line', 'delete'];
    default:
      return [];
  }
}

function common(values: (string | undefined)[]): ToolbarValue {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  return values.every((v) => v === first) ? { value: first, mixed: false } : { value: undefined, mixed: true };
}

export function sequencePropertyValue(selection: DiagramSelection | null, diagram: SequenceDiagram, key: string): ToolbarValue {
  if (selection?.kind === 'edge') return common(selectedMessages(selection, diagram).map((m) => m.properties[key]));
  return common(selectedParticipants(selection, diagram).map((p) => p.properties[key]));
}

export function messageLineValue(selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarValue {
  return common(selectedMessages(selection, diagram).map((m) => messageLineOf(m.connector)));
}

export function messageDirectionValue(selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarValue {
  return common(selectedMessages(selection, diagram).map((m) => messageDirectionOf(m.connector)));
}

/** The Direction options for one message, named with its participants. */
export function directionOptions(message: SequenceMessage, diagram: SequenceDiagram): { value: MessageDirection; label: string }[] {
  const name = (n: string) => diagram.participants.get(n)?.label ?? n;
  return [
    { value: 'forward', label: `${name(message.from)} → ${name(message.to)}` },
    { value: 'back', label: `${name(message.to)} → ${name(message.from)}` },
    { value: 'both', label: 'Both ways' },
  ];
}

export function sequenceEditableText(selection: DiagramSelection | null, diagram: SequenceDiagram): string {
  if (!selection || selection.ids.length !== 1) return '';
  if (selection.kind === 'edge') return selectedMessages(selection, diagram)[0]?.label ?? '';
  const p = selectedParticipants(selection, diagram)[0];
  return p ? (p.properties.label ?? p.name) : '';
}

export function sequenceEditRenames(selection: DiagramSelection | null, diagram: SequenceDiagram): boolean {
  const p = selectedParticipants(selection, diagram)[0];
  return !!p && p.properties.label === undefined;
}

/** How many messages deleting the selected participants takes with them. */
export function messagesDeletedWith(selection: DiagramSelection | null, diagram: SequenceDiagram): number {
  const names = new Set(selectedParticipants(selection, diagram).map((p) => p.name));
  return diagram.events.filter((e) => e.type === 'message' && (names.has(e.from) || names.has(e.to))).length;
}

const LABELS: Record<string, string> = { color: 'Colour', icon: 'Icon', link: 'Link', label: 'Label' };
const messageNumber = (id: string) => Number(id.replace(/^\D+/, '')) || 0;

export interface PlannedSequenceEdits {
  edits: SequenceEdit[];
  label: string;
  selection: DiagramSelection | null;
  renamed?: { from: string; to: string };
}

export function sequenceActionToEdits(action: SequenceToolbarAction, selection: DiagramSelection | null, diagram: SequenceDiagram): PlannedSequenceEdits | { reason: string } {
  if (!selection || selection.ids.length === 0) return { reason: 'Nothing is selected' };
  const people = selectedParticipants(selection, diagram);
  const msgs = selectedMessages(selection, diagram);
  if (people.length === 0 && msgs.length === 0) return { reason: 'The selection is no longer in the code' };
  switch (action.type) {
    case 'set': {
      const value = action.value?.trim() || null;
      const label = LABELS[action.key] ?? action.key;
      if (msgs.length) return { edits: msgs.map((m) => ({ type: 'setMessageProperty', message: m.id, key: action.key, value })), label, selection };
      return { edits: people.map((p) => ({ type: 'setParticipantProperty', participant: p.name, key: action.key, value })), label, selection };
    }
    case 'line':
      if (!msgs.length) return { reason: 'Line is for messages' };
      return { edits: msgs.map((m) => ({ type: 'setMessageLine', message: m.id, line: action.value })), label: action.value === 'return' ? 'Return message' : 'Call message', selection };
    case 'direction':
      if (!msgs.length) return { reason: 'Direction is for messages' };
      return { edits: msgs.map((m) => ({ type: 'setMessageDirection', message: m.id, direction: action.value })), label: 'Direction', selection };
    case 'editText': {
      const text = action.text.trim();
      if (msgs.length) {
        if (msgs.length > 1) return { reason: 'Select one message to edit its label' };
        return { edits: [{ type: 'setMessageLabel', message: msgs[0]!.id, label: text || null }], label: 'Edit label', selection };
      }
      if (people.length !== 1) return { reason: 'Select one participant to edit its name' };
      const p = people[0]!;
      if (!text) return { reason: 'The name cannot be blank' };
      if (p.properties.label !== undefined) return { edits: [{ type: 'setParticipantProperty', participant: p.name, key: 'label', value: text }], label: 'Edit name', selection };
      if (text === p.name) return { edits: [], label: 'Rename', selection };
      return { edits: [{ type: 'renameParticipant', participant: p.name, name: text }], label: 'Rename', selection: { kind: 'node', ids: [text] }, renamed: { from: p.name, to: text } };
    }
    case 'delete': {
      if (msgs.length) {
        // Deleting a message renumbers the ones after it, so go from the last one back.
        const ids = msgs.map((m) => m.id).sort((a, b) => messageNumber(b) - messageNumber(a));
        return { edits: ids.map((message) => ({ type: 'deleteMessage', message })), label: ids.length > 1 ? `Delete ${ids.length} messages` : 'Delete message', selection: null };
      }
      return { edits: people.map((p) => ({ type: 'deleteParticipant', participant: p.name })), label: people.length > 1 ? `Delete ${people.length} participants` : 'Delete participant', selection: null };
    }
  }
}

/** Runs a toolbar action against sequence code: one `applySequenceEdits`, all or nothing. */
export function runSequenceAction(source: string, action: SequenceToolbarAction, selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarResult {
  const plan = sequenceActionToEdits(action, selection, diagram);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  if (plan.edits.length === 0) return { ok: false };
  const result = applySequenceEdits(source, plan.edits);
  if (result.reason) return { ok: false, reason: result.reason };
  if (!result.changed) return { ok: false };
  return { ok: true, source: result.source, label: plan.label, selection: plan.selection, ...(plan.renamed ? { renamed: plan.renamed } : {}) };
}

/** Drops participants and messages no longer in the code; null when nothing is left. */
export function pruneSequenceSelection(selection: DiagramSelection | null, diagram: SequenceDiagram): DiagramSelection | null {
  if (!selection) return null;
  const count = sequenceMessages(diagram).length;
  const ids = selection.ids.filter((id) => (selection.kind === 'edge' ? /^m\d+$/.test(id) && messageNumber(id) < count : selection.kind === 'node' && diagram.participants.has(id)));
  if (ids.length === selection.ids.length) return selection;
  return ids.length ? { kind: selection.kind, ids } : null;
}

export { participantMessageCount };
