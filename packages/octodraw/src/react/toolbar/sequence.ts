import {
  applySequenceEdits,
  BLOCK_KINDS,
  messageDirectionOf,
  messageLineOf,
  participantMessageCount,
  type MessageDirection,
  type MessageLine,
  type SequenceEdit,
} from '../../dsl/edit-sequence';
import { sequenceActivations, type BlockKind, type Participant, type SequenceActivation, type SequenceDiagram, type SequenceEvent } from '../../dsl/sequence';
import type { DiagramSelection, ToolbarResult, ToolbarValue } from './actions';

// The element toolbar's decisions for sequence diagrams, kept pure like
// `actions.ts`: participants are `node` selections (by name), messages `edge`
// selections (`m<index>`, the order of `SequenceLayout.messages`), blocks
// `block` selections (`b<n>`, the order blocks open in) and activation bars
// `activation` selections (`a<n>`, the n-th `activate`).

export type SequenceTarget = 'participant' | 'participants' | 'message' | 'messages' | 'block' | 'blocks' | 'activation' | 'activations';

export type SequenceControl = 'count' | 'editText' | 'icon' | 'color' | 'line' | 'direction' | 'blockKind' | 'tag' | 'more' | 'delete';

export type SequenceToolbarAction =
  | { type: 'set'; key: string; value: string | null }
  | { type: 'line'; value: MessageLine }
  | { type: 'direction'; value: MessageDirection }
  | { type: 'blockKind'; value: BlockKind }
  /** Renames a participant (or sets `label:` when it has one); sets a message's or block's label. */
  | { type: 'editText'; text: string }
  /** Deletes a block's frame, keeping its messages. */
  | { type: 'unwrap' }
  | { type: 'delete' };

export type SequenceMessage = Extract<SequenceEvent, { type: 'message' }> & { id: string };

/** A block as the toolbar sees it. */
export interface SequenceBlock {
  id: string;
  kind: BlockKind;
  label?: string;
  properties: Record<string, string>;
  /** Sections after the first (`else` / `and`). */
  sections: number;
  /** Messages inside, nested blocks included. */
  messages: number;
}

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = { loop: 'Loop', alt: 'Alternatives', opt: 'Optional', par: 'Parallel', break: 'Break' };

export function sequenceMessages(diagram: SequenceDiagram): SequenceMessage[] {
  return diagram.events.flatMap((e) => (e.type === 'message' ? [e] : [])).map((e, i) => ({ ...e, id: `m${i}` }));
}

export function sequenceBlocks(diagram: SequenceDiagram): SequenceBlock[] {
  const blocks: SequenceBlock[] = [];
  const open: SequenceBlock[] = [];
  for (const e of diagram.events) {
    if (e.type === 'block-start') {
      const b: SequenceBlock = { id: `b${e.block}`, kind: e.kind, label: e.label, properties: e.properties, sections: 0, messages: 0 };
      blocks[e.block] = b;
      open.push(b);
    } else if (e.type === 'block-section') {
      // The parser drops the `}` before `else` / `and`, so the block is still open.
      const b = blocks[e.block];
      if (b) b.sections++;
    } else if (e.type === 'block-end') {
      open.pop();
    } else if (e.type === 'message') {
      for (const b of open) b.messages++;
    }
  }
  return blocks.filter(Boolean);
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

export function selectedBlocks(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceBlock[] {
  if (!selection || selection.kind !== 'block') return [];
  const all = sequenceBlocks(diagram);
  return selection.ids.flatMap((id) => all.filter((b) => b.id === id));
}

export function selectedActivations(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceActivation[] {
  if (!selection || selection.kind !== 'activation') return [];
  const all = sequenceActivations(diagram);
  return selection.ids.flatMap((id) => all.filter((a) => a.id === id));
}

export function sequenceTarget(selection: DiagramSelection | null, diagram: SequenceDiagram): SequenceTarget | null {
  if (!selection || selection.ids.length === 0) return null;
  const count = (n: number, one: SequenceTarget, many: SequenceTarget) => (n === 0 ? null : n > 1 ? many : one);
  switch (selection.kind) {
    case 'edge':
      return count(selectedMessages(selection, diagram).length, 'message', 'messages');
    case 'node':
      return count(selectedParticipants(selection, diagram).length, 'participant', 'participants');
    case 'block':
      return count(selectedBlocks(selection, diagram).length, 'block', 'blocks');
    case 'activation':
      return count(selectedActivations(selection, diagram).length, 'activation', 'activations');
    default:
      return null;
  }
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
      return ['count', 'color', 'line', 'direction', 'delete'];
    case 'block':
      return ['editText', 'blockKind', 'color', 'icon', 'more'];
    case 'blocks':
      return ['count', 'color', 'icon', 'delete'];
    case 'activation':
      return ['tag', 'more'];
    case 'activations':
      return ['count', 'delete'];
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
  if (selection?.kind === 'block') return common(selectedBlocks(selection, diagram).map((b) => b.properties[key]));
  return common(selectedParticipants(selection, diagram).map((p) => p.properties[key]));
}

export function messageLineValue(selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarValue {
  return common(selectedMessages(selection, diagram).map((m) => messageLineOf(m.connector)));
}

export function messageDirectionValue(selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarValue {
  return common(selectedMessages(selection, diagram).map((m) => messageDirectionOf(m.connector)));
}

export function blockKindValue(selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarValue {
  return common(selectedBlocks(selection, diagram).map((b) => b.kind));
}

/**
 * The Direction options: named with the participants for one message, or
 * relative to how each is written for several.
 */
export function directionOptions(message: SequenceMessage | null, diagram: SequenceDiagram): { value: MessageDirection; label: string }[] {
  if (!message) {
    return [
      { value: 'forward', label: 'Forward (as written)' },
      { value: 'back', label: 'Back' },
      { value: 'both', label: 'Both ways' },
    ];
  }
  const name = (n: string) => diagram.participants.get(n)?.label ?? n;
  return [
    { value: 'forward', label: `${name(message.from)} → ${name(message.to)}` },
    { value: 'back', label: `${name(message.to)} → ${name(message.from)}` },
    { value: 'both', label: 'Both ways' },
  ];
}

/** Block kinds a block can switch to, with why not when it can't (alt / par with sections only switch between each other). */
export function blockKindOptions(block: SequenceBlock): { value: BlockKind; label: string; disabled?: string }[] {
  return BLOCK_KINDS.map((kind) => ({
    value: kind,
    label: BLOCK_KIND_LABELS[kind],
    ...(block.sections && kind !== 'alt' && kind !== 'par' && kind !== block.kind ? { disabled: `Has ${block.sections} ${block.kind === 'alt' ? 'else' : 'and'} section${block.sections > 1 ? 's' : ''}` } : {}),
  }));
}

export function sequenceEditableText(selection: DiagramSelection | null, diagram: SequenceDiagram): string {
  if (!selection || selection.ids.length !== 1) return '';
  if (selection.kind === 'edge') return selectedMessages(selection, diagram)[0]?.label ?? '';
  if (selection.kind === 'block') return selectedBlocks(selection, diagram)[0]?.label ?? '';
  if (selection.kind !== 'node') return '';
  const p = selectedParticipants(selection, diagram)[0];
  return p ? (p.properties.label ?? p.name) : '';
}

export function sequenceEditRenames(selection: DiagramSelection | null, diagram: SequenceDiagram): boolean {
  const p = selectedParticipants(selection, diagram)[0];
  return !!p && p.properties.label === undefined;
}

/** How many messages deleting the selected participants (or blocks) takes with them. */
export function messagesDeletedWith(selection: DiagramSelection | null, diagram: SequenceDiagram): number {
  if (selection?.kind === 'block') {
    // Nested selected blocks are counted once.
    const blocks = selectedBlocks(selection, diagram);
    return blocks.length === 1 ? blocks[0]!.messages : Math.max(0, ...blocks.map((b) => b.messages));
  }
  const names = new Set(selectedParticipants(selection, diagram).map((p) => p.name));
  return diagram.events.filter((e) => e.type === 'message' && (names.has(e.from) || names.has(e.to))).length;
}

const LABELS: Record<string, string> = { color: 'Colour', icon: 'Icon', link: 'Link', label: 'Label' };
const idNumber = (id: string) => Number(id.replace(/^\D+/, '')) || 0;
/** Deleting renumbers what comes after, so batches go from the last one back. */
const lastFirst = (ids: string[]) => [...ids].sort((a, b) => idNumber(b) - idNumber(a));

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
  const blocks = selectedBlocks(selection, diagram);
  const bars = selectedActivations(selection, diagram);
  if (people.length === 0 && msgs.length === 0 && blocks.length === 0 && bars.length === 0) return { reason: 'The selection is no longer in the code' };
  switch (action.type) {
    case 'set': {
      const value = action.value?.trim() || null;
      const label = LABELS[action.key] ?? action.key;
      if (msgs.length) return { edits: msgs.map((m) => ({ type: 'setMessageProperty', message: m.id, key: action.key, value })), label, selection };
      if (blocks.length) return { edits: blocks.map((b) => ({ type: 'setBlockProperty', block: b.id, key: action.key, value })), label, selection };
      if (bars.length) return { reason: 'Activations have no properties' };
      return { edits: people.map((p) => ({ type: 'setParticipantProperty', participant: p.name, key: action.key, value })), label, selection };
    }
    case 'line':
      if (!msgs.length) return { reason: 'Line is for messages' };
      return { edits: msgs.map((m) => ({ type: 'setMessageLine', message: m.id, line: action.value })), label: action.value === 'return' ? 'Return message' : 'Call message', selection };
    case 'direction':
      if (!msgs.length) return { reason: 'Direction is for messages' };
      return { edits: msgs.map((m) => ({ type: 'setMessageDirection', message: m.id, direction: action.value })), label: 'Direction', selection };
    case 'blockKind':
      if (!blocks.length) return { reason: 'Kind is for blocks' };
      return { edits: blocks.map((b) => ({ type: 'setBlockKind', block: b.id, kind: action.value })), label: `${BLOCK_KIND_LABELS[action.value]} block`, selection };
    case 'unwrap':
      if (!blocks.length) return { reason: 'Only blocks can be unwrapped' };
      return { edits: lastFirst(blocks.map((b) => b.id)).map((block) => ({ type: 'unwrapBlock', block })), label: 'Delete block, keep messages', selection: null };
    case 'editText': {
      const text = action.text.trim();
      if (msgs.length) {
        if (msgs.length > 1) return { reason: 'Select one message to edit its label' };
        return { edits: [{ type: 'setMessageLabel', message: msgs[0]!.id, label: text || null }], label: 'Edit label', selection };
      }
      if (blocks.length) {
        if (blocks.length > 1) return { reason: 'Select one block to edit its label' };
        return { edits: [{ type: 'setBlockProperty', block: blocks[0]!.id, key: 'label', value: text || null }], label: 'Edit label', selection };
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
        const ids = lastFirst(msgs.map((m) => m.id));
        return { edits: ids.map((message) => ({ type: 'deleteMessage', message })), label: ids.length > 1 ? `Delete ${ids.length} messages` : 'Delete message', selection: null };
      }
      if (blocks.length) {
        // Inner blocks open later (higher ids), so they go before the blocks around them.
        const ids = lastFirst(blocks.map((b) => b.id));
        return { edits: ids.map((block) => ({ type: 'deleteBlock', block })), label: ids.length > 1 ? `Delete ${ids.length} blocks` : 'Delete block', selection: null };
      }
      if (bars.length) {
        const ids = lastFirst(bars.map((a) => a.id));
        return { edits: ids.map((activation) => ({ type: 'deleteActivation', activation })), label: ids.length > 1 ? `Delete ${ids.length} activations` : 'Delete activation', selection: null };
      }
      return { edits: people.map((p) => ({ type: 'deleteParticipant', participant: p.name })), label: people.length > 1 ? `Delete ${people.length} participants` : 'Delete participant', selection: null };
    }
  }
}

/** Names the message an edit is about, for a refusal in a batch ("Message 3 'Query': …"). */
function whichMessage(edit: SequenceEdit, diagram: SequenceDiagram): string | undefined {
  if (!('message' in edit)) return undefined;
  const m = sequenceMessages(diagram).find((x) => x.id === edit.message);
  return m ? `Message ${idNumber(m.id) + 1}${m.label ? ` '${m.label}'` : ''}` : undefined;
}

/** Runs a toolbar action against sequence code: one `applySequenceEdits`, all or nothing. */
export function runSequenceAction(source: string, action: SequenceToolbarAction, selection: DiagramSelection | null, diagram: SequenceDiagram): ToolbarResult {
  const plan = sequenceActionToEdits(action, selection, diagram);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  if (plan.edits.length === 0) return { ok: false };
  const result = applySequenceEdits(source, plan.edits);
  if (result.reason) {
    // In a batch, say which one couldn't change (nothing was applied).
    if (plan.edits.length > 1 && action.type !== 'delete') {
      const failed = plan.edits.find((edit) => applySequenceEdits(source, [edit]).reason);
      const which = failed && whichMessage(failed, diagram);
      if (which) return { ok: false, reason: `${which}: ${result.reason}` };
    }
    return { ok: false, reason: result.reason };
  }
  if (!result.changed) return { ok: false };
  return { ok: true, source: result.source, label: plan.label, selection: plan.selection, ...(plan.renamed ? { renamed: plan.renamed } : {}) };
}

/** Drops participants, messages, blocks and activations no longer in the code; null when nothing is left. */
export function pruneSequenceSelection(selection: DiagramSelection | null, diagram: SequenceDiagram): DiagramSelection | null {
  if (!selection) return null;
  const count = sequenceMessages(diagram).length;
  const blocks = new Set(sequenceBlocks(diagram).map((b) => b.id));
  const bars = new Set(sequenceActivations(diagram).map((a) => a.id));
  const alive = (id: string) => {
    switch (selection.kind) {
      case 'edge':
        return /^m\d+$/.test(id) && idNumber(id) < count;
      case 'node':
        return diagram.participants.has(id);
      case 'block':
        return blocks.has(id);
      case 'activation':
        return bars.has(id);
      default:
        return false;
    }
  };
  const ids = selection.ids.filter(alive);
  if (ids.length === selection.ids.length) return selection;
  return ids.length ? { kind: selection.kind, ids } : null;
}

export { participantMessageCount };
