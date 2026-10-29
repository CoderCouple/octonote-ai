import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { newItemId, type CanvasDocument, type CommentAuthor } from './model';

// Version history: saved copies of the whole canvas document. Versions are
// plain JSON kept in a store the host provides (its database, localStorage,
// or the shared Y.Doc via octodraw/collab's yjsVersionStore). Restoring writes
// the old document as an ordinary edit, so it syncs to collaborators and can
// be undone.

export interface CanvasVersion {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  /** Set when someone named the version; automatic versions have none. */
  name?: string;
  author?: CommentAuthor;
  auto?: boolean;
  doc: CanvasDocument;
}

export interface VersionStore {
  /** Newest first. */
  list(): CanvasVersion[];
  save(version: CanvasVersion): void;
  remove(id: string): void;
  rename(id: string, name: string | undefined): void;
  /** Called whenever the list changes (including changes by collaborators). */
  subscribe(listener: () => void): () => void;
}

export interface DocumentDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Which items differ between two documents (by id). */
export function diffDocuments(from: CanvasDocument, to: CanvasDocument): DocumentDiff {
  const before = new Map(from.items.map((i) => [i.id, i]));
  const after = new Map(to.items.map((i) => [i.id, i]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.entries()].filter(([id, item]) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(item)).map(([id]) => id);
  return { added, removed, changed };
}

export const isEmptyDiff = (d: DocumentDiff) => !d.added.length && !d.removed.length && !d.changed.length;

/** Same items and comments (ignoring order of keys inside items). */
export function sameDocument(a: CanvasDocument, b: CanvasDocument): boolean {
  return isEmptyDiff(diffDocuments(a, b)) && a.items.map((i) => i.id).join() === b.items.map((i) => i.id).join() && JSON.stringify(a.comments ?? []) === JSON.stringify(b.comments ?? []);
}

export function createVersion(doc: CanvasDocument, options: { name?: string; author?: CommentAuthor; auto?: boolean; at?: number } = {}): CanvasVersion {
  const version: CanvasVersion = { id: newItemId(), at: options.at ?? Date.now(), doc: structuredClone(doc) };
  if (options.name) version.name = options.name;
  if (options.author) version.author = options.author;
  if (options.auto) version.auto = true;
  return version;
}

/** A store kept in memory, optionally saved to localStorage under `key` (and synced between tabs). */
export function localVersionStore(key?: string, { limit = 100 }: { limit?: number } = {}): VersionStore {
  const listeners = new Set<() => void>();
  const read = (): CanvasVersion[] => {
    if (!key) return [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  let versions = read();
  const write = (next: CanvasVersion[]) => {
    // Keep every named version; drop the oldest automatic ones past the limit.
    let autos = 0;
    versions = [...next].sort((a, b) => b.at - a.at).filter((v) => !v.auto || ++autos <= limit);
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(versions));
      } catch {
        // Storage full or unavailable: keep the list in memory.
      }
    }
    listeners.forEach((l) => l());
  };
  if (key && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      versions = read();
      listeners.forEach((l) => l());
    });
  }
  return {
    list: () => versions,
    save: (version) => write([version, ...versions.filter((v) => v.id !== version.id)]),
    remove: (id) => write(versions.filter((v) => v.id !== id)),
    rename: (id, name) => write(versions.map((v) => (v.id === id ? { ...v, name: name || undefined } : v))),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface VersionHistoryOptions {
  doc: CanvasDocument;
  store: VersionStore;
  user?: CommentAuthor;
  /** Save an automatic version this often while the canvas changes (ms; default 10 minutes, 0 = never). */
  autoSaveEvery?: number;
}

/**
 * Version list plus actions. Automatic versions are saved only when the
 * canvas differs from the newest version and nobody (any collaborator using
 * the same store) saved one within the interval.
 */
export function useVersionHistory({ doc, store, user, autoSaveEvery = 10 * 60_000 }: VersionHistoryOptions) {
  const versions = useSyncExternalStore(store.subscribe, store.list);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [lastChange, setLastChange] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLastChange(Date.now());
  }, [doc]);

  const save = useCallback(
    (name?: string, options: { auto?: boolean } = {}) => {
      const version = createVersion(docRef.current, { name, author: user, auto: options.auto });
      store.save(version);
      return version;
    },
    [store, user],
  );

  useEffect(() => {
    if (!autoSaveEvery || !lastChange) return;
    const timer = setInterval(() => {
      const newest = store.list()[0];
      if (newest && Date.now() - newest.at < autoSaveEvery) return;
      if (newest && sameDocument(newest.doc, docRef.current)) return;
      save(undefined, { auto: true });
    }, Math.min(autoSaveEvery, 60_000));
    return () => clearInterval(timer);
  }, [autoSaveEvery, lastChange, save, store]);

  /** The document to hand to the canvas to restore a version; the current state is saved first so nothing is lost. */
  const restore = useCallback(
    (id: string): CanvasDocument | undefined => {
      const version = store.list().find((v) => v.id === id);
      if (!version) return undefined;
      const newest = store.list()[0];
      if (!newest || !sameDocument(newest.doc, docRef.current)) save(undefined, { auto: true });
      return structuredClone(version.doc);
    },
    [store, save],
  );

  return { versions, save, restore, remove: store.remove, rename: store.rename };
}
