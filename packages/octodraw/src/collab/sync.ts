import * as Y from 'yjs';
import type { CanvasDocument, CanvasItem, CommentMessage, CommentThread } from '../canvas/model';

// The canvas document inside a Y.Doc, so several people can edit it at once.
//
//   items:    Y.Map<id, Y.Map>  one map per item, one entry per field, so two
//             people changing different items, or different fields of one item,
//             both keep their change. Stacking order is a number `z` per item
//             (ties broken by id), so inserts and reorders merge without a shared
//             list. Text fields (labels, notes, figure code, code blocks) are
//             Y.Text, merged character by character.
//   comments: Y.Map<id, Y.Map>  one map per thread (position, resolved) with
//             its messages in a Y.Array, so replies sent at the same time all stay.
//
// Transport (WebSocket, WebRTC, BroadcastChannel, …) and persistence belong to
// the host; anything that syncs a Y.Doc works.

export const ITEMS_KEY = 'octodraw.items';
export const COMMENTS_KEY = 'octodraw.comments';
/** Document-wide settings (presentation order, hidden slides, notes). */
export const META_KEY = 'octodraw.meta';

/** Fields stored as Y.Text, per item type. */
const TEXT_FIELDS: Partial<Record<CanvasItem['type'], string>> = { figure: 'source', code: 'text', shape: 'text', text: 'text', sticky: 'text', line: 'text' };

type ItemMap = Y.Map<unknown>;
type ThreadMap = Y.Map<unknown>;

const itemsOf = (ydoc: Y.Doc) => ydoc.getMap<ItemMap>(ITEMS_KEY);
const commentsOf = (ydoc: Y.Doc) => ydoc.getMap<ThreadMap>(COMMENTS_KEY);
const metaOf = (ydoc: Y.Doc) => ydoc.getMap<unknown>(META_KEY);

/** A document from its parts, leaving out empty optional fields. */
function assemble(items: CanvasItem[], comments: CommentThread[], presentation: unknown): CanvasDocument {
  const doc: CanvasDocument = { version: 1, items };
  if (comments.length) doc.comments = comments;
  if (presentation) doc.presentation = presentation as CanvasDocument['presentation'];
  return doc;
}

function writeThread(map: ThreadMap, thread: CommentThread): void {
  const { id: _id, messages, ...fields } = thread;
  const record = fields as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) map.delete(key);
    else if (!same(map.get(key), value)) map.set(key, value);
  }
  for (const key of [...map.keys()]) if (key !== 'messages' && record[key] === undefined) map.delete(key);
  let list = map.get('messages') as Y.Array<CommentMessage> | undefined;
  if (!(list instanceof Y.Array)) {
    list = new Y.Array<CommentMessage>();
    map.set('messages', list);
  }
  // Messages are matched by id: new ones are appended, missing ones removed, edited ones replaced.
  const wanted = new Map(messages.map((m) => [m.id, m]));
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list.get(i);
    const next = wanted.get(m.id);
    if (!next) list.delete(i, 1);
    else if (!same(m, next)) {
      list.delete(i, 1);
      list.insert(i, [next]);
    }
  }
  const have = new Set(list.toArray().map((m) => m.id));
  const added = messages.filter((m) => !have.has(m.id));
  if (added.length) list.push(added);
}

function readThread(id: string, map: ThreadMap | CommentThread): CommentThread {
  // Plain JSON threads come from documents written before threads became maps.
  if (!(map instanceof Y.Map)) return map;
  const thread: Record<string, unknown> = { id };
  map.forEach((value, key) => {
    thread[key] = value instanceof Y.Array ? [...(value.toArray() as CommentMessage[])].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)) : value;
  });
  if (!thread.messages) thread.messages = [];
  return thread as unknown as CommentThread;
}

const readComments = (ydoc: Y.Doc) => [...commentsOf(ydoc).entries()].map(([id, map]) => readThread(id, map));

/** Replaces the changed middle of a Y.Text, so concurrent edits elsewhere in it survive. */
export function updateText(text: Y.Text, next: string): void {
  const prev = text.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0;
  while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  const removed = prev.length - start - end;
  if (removed > 0) text.delete(start, removed);
  const inserted = next.slice(start, next.length - end);
  if (inserted) text.insert(start, inserted);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Stacking numbers for items in document order, keeping every existing number
 * that is still in order and fitting new or moved items between their neighbours.
 */
export function assignZ(ids: string[], existing: (id: string) => number | undefined): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < ids.length; i++) {
    const z = existing(ids[i]!);
    if (typeof z === 'number' && z > last) {
      out.push((last = z));
      continue;
    }
    let next = Infinity;
    for (let j = i + 1; j < ids.length; j++) {
      const zj = existing(ids[j]!);
      if (typeof zj === 'number' && zj > last) {
        next = zj;
        break;
      }
    }
    const z2 = last === -Infinity ? (next === Infinity ? 0 : next - 1) : next === Infinity ? last + 1 : (last + next) / 2;
    // Out of float precision between two neighbours: renumber everything.
    if (z2 <= last || z2 >= next) return ids.map((_, k) => k);
    out.push((last = z2));
  }
  return out;
}

function writeItem(map: ItemMap, item: CanvasItem, z: number): void {
  const textField = TEXT_FIELDS[item.type];
  const record = item as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    if (key === textField && typeof value === 'string') {
      const current = map.get(key);
      if (current instanceof Y.Text) updateText(current, value);
      else map.set(key, new Y.Text(value));
    } else if (value === undefined) {
      if (map.has(key)) map.delete(key);
    } else if (!same(map.get(key), value)) {
      map.set(key, value);
    }
  }
  for (const key of [...map.keys()]) if (key !== 'z' && !(key in record && record[key] !== undefined)) map.delete(key);
  if (map.get('z') !== z) map.set('z', z);
}

function readItem(id: string, map: ItemMap): CanvasItem {
  const item: Record<string, unknown> = { id };
  map.forEach((value, key) => {
    if (key !== 'z') item[key] = value instanceof Y.Text ? value.toString() : value;
  });
  return item as unknown as CanvasItem;
}

/** Writes a canvas document into the Y.Doc, changing only what differs. */
export function writeCanvas(ydoc: Y.Doc, doc: CanvasDocument, origin?: unknown): void {
  const items = itemsOf(ydoc);
  const comments = commentsOf(ydoc);
  ydoc.transact(() => {
    const zs = assignZ(
      doc.items.map((i) => i.id),
      (id) => items.get(id)?.get('z') as number | undefined,
    );
    const keep = new Set<string>();
    doc.items.forEach((item, i) => {
      keep.add(item.id);
      let map = items.get(item.id);
      if (!map) {
        map = new Y.Map();
        items.set(item.id, map);
      }
      writeItem(map, item, zs[i]!);
    });
    for (const id of [...items.keys()]) if (!keep.has(id)) items.delete(id);

    const threads = new Set<string>();
    for (const thread of doc.comments ?? []) {
      threads.add(thread.id);
      let map = comments.get(thread.id);
      if (!(map instanceof Y.Map)) {
        map = new Y.Map();
        comments.set(thread.id, map);
      }
      writeThread(map, thread);
    }
    for (const id of [...comments.keys()]) if (!threads.has(id)) comments.delete(id);

    const meta = metaOf(ydoc);
    if (doc.presentation === undefined) {
      if (meta.has('presentation')) meta.delete('presentation');
    } else if (!same(meta.get('presentation'), doc.presentation)) meta.set('presentation', doc.presentation);
  }, origin);
}

/** Reads the whole canvas document out of a Y.Doc. */
export function readCanvas(ydoc: Y.Doc): CanvasDocument {
  const items = itemsOf(ydoc);
  const list = [...items.entries()].map(([id, map]) => ({ z: (map.get('z') as number) ?? 0, item: readItem(id, map) }));
  list.sort((a, b) => a.z - b.z || (a.item.id < b.item.id ? -1 : 1));
  return assemble(list.map((e) => e.item), readComments(ydoc), metaOf(ydoc).get('presentation'));
}

/** Fills an empty Y.Doc with a document (e.g. the stored canvas, once the provider has synced). */
export function seedCanvas(ydoc: Y.Doc, doc: CanvasDocument): boolean {
  if (itemsOf(ydoc).size > 0 || commentsOf(ydoc).size > 0 || metaOf(ydoc).size > 0) return false;
  writeCanvas(ydoc, doc, SEED_ORIGIN);
  return true;
}

const SEED_ORIGIN = Symbol('octodraw.seed');

export interface CanvasSyncOptions {
  /** Merge edits made within this many ms into one undo step (default 300). */
  captureTimeout?: number;
}

/**
 * A live view of the canvas in a Y.Doc: `doc` is always current (unchanged
 * items keep their object identity, so memoized views don't re-render),
 * `apply` writes local edits, and undo/redo only revert this client's edits.
 */
export class CanvasSync {
  readonly ydoc: Y.Doc;
  /** Origin of this client's tracked edits (undoable). */
  readonly origin = Symbol('octodraw.local');
  /** Origin of this client's untracked edits (e.g. a figure growing to fit). */
  readonly silentOrigin = Symbol('octodraw.silent');
  private undoManager: Y.UndoManager | null = null;
  private readonly captureTimeout: number;
  private readonly cache = new Map<string, { z: number; item: CanvasItem }>();
  private snapshot: CanvasDocument;
  private readonly listeners = new Set<() => void>();
  private readonly items: Y.Map<ItemMap>;
  private readonly comments: Y.Map<ThreadMap>;
  private readonly meta: Y.Map<unknown>;

  constructor(ydoc: Y.Doc, options: CanvasSyncOptions = {}) {
    this.ydoc = ydoc;
    this.items = itemsOf(ydoc);
    this.comments = commentsOf(ydoc);
    this.meta = metaOf(ydoc);
    this.captureTimeout = options.captureTimeout ?? 300;
    this.snapshot = this.refresh();
    this.connect();
  }

  /** Starts following the Y.Doc (done by the constructor; call again after `destroy` to resume). */
  connect(): void {
    if (this.undoManager) return;
    this.undoManager = new Y.UndoManager([this.items, this.comments, this.meta], { trackedOrigins: new Set([this.origin]), captureTimeout: this.captureTimeout });
    this.undoManager.on('stack-item-added', this.notify);
    this.undoManager.on('stack-item-popped', this.notify);
    this.items.observeDeep(this.onItems);
    this.comments.observeDeep(this.onComments);
    this.meta.observe(this.onComments);
    // Catch up on anything that changed while disconnected.
    const before = this.snapshot;
    this.snapshot = this.refresh();
    if (JSON.stringify(before) !== JSON.stringify(this.snapshot)) this.notify();
  }

  private refresh(): CanvasDocument {
    const previous = new Map(this.cache);
    this.cache.clear();
    for (const [id, map] of this.items.entries()) {
      const item = readItem(id, map);
      const old = previous.get(id);
      // Keep the old object when nothing changed, so views don't re-render.
      this.cache.set(id, { z: (map.get('z') as number) ?? 0, item: old && JSON.stringify(old.item) === JSON.stringify(item) ? old.item : item });
    }
    return this.build();
  }

  get doc(): CanvasDocument {
    return this.snapshot;
  }

  get canUndo(): boolean {
    return !!this.undoManager?.canUndo();
  }

  get canRedo(): boolean {
    return !!this.undoManager?.canRedo();
  }

  apply(doc: CanvasDocument, meta: { silent?: boolean } = {}): void {
    if (doc === this.snapshot) return;
    writeCanvas(this.ydoc, doc, meta.silent ? this.silentOrigin : this.origin);
  }

  undo(): void {
    this.undoManager?.undo();
  }

  redo(): void {
    this.undoManager?.redo();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Stops following the Y.Doc (listeners are kept, so `connect` can resume). */
  destroy(): void {
    if (!this.undoManager) return;
    this.items.unobserveDeep(this.onItems);
    this.comments.unobserveDeep(this.onComments);
    this.meta.unobserve(this.onComments);
    this.undoManager.destroy();
    this.undoManager = null;
  }

  private notify = () => {
    for (const listener of [...this.listeners]) listener();
  };

  private onItems = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const dirty = new Set<string>();
    for (const event of events) {
      if (event.target === this.items) for (const key of event.changes.keys.keys()) dirty.add(key);
      else if (typeof event.path[0] === 'string') dirty.add(event.path[0]);
    }
    for (const id of dirty) {
      const map = this.items.get(id);
      if (map) this.cache.set(id, { z: (map.get('z') as number) ?? 0, item: readItem(id, map) });
      else this.cache.delete(id);
    }
    this.snapshot = this.build();
    this.notify();
  };

  private onComments = () => {
    this.snapshot = this.build(this.snapshot.items);
    this.notify();
  };

  private build(items?: CanvasItem[]): CanvasDocument {
    const list =
      items ??
      [...this.cache.values()].sort((a, b) => a.z - b.z || (a.item.id < b.item.id ? -1 : 1)).map((e) => e.item);
    return assemble(list, readComments(this.ydoc), this.meta.get('presentation'));
  }
}
