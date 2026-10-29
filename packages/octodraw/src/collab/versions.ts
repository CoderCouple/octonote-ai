import type * as Y from 'yjs';
import type { CanvasVersion, VersionStore } from '../canvas/versions';

export const VERSIONS_KEY = 'octodraw.versions';

/**
 * Versions kept inside the shared Y.Doc, so every collaborator sees the same
 * history without a server of its own. Each version is a full copy of the
 * canvas, so the Y.Doc grows with every one: keep `limit` modest, or use a
 * host store (its database) for long histories.
 */
export function yjsVersionStore(ydoc: Y.Doc, { limit = 50 }: { limit?: number } = {}): VersionStore {
  const map = ydoc.getMap<CanvasVersion>(VERSIONS_KEY);
  let cache: CanvasVersion[] = [];
  const refresh = () => {
    cache = [...map.values()].sort((a, b) => b.at - a.at);
  };
  refresh();
  const listeners = new Set<() => void>();
  map.observe(() => {
    refresh();
    listeners.forEach((l) => l());
  });
  return {
    list: () => cache,
    save: (version) =>
      ydoc.transact(() => {
        map.set(version.id, version);
        // Trim the oldest automatic versions past the limit; named ones stay.
        const autos = [...map.values()].filter((v) => v.auto).sort((a, b) => b.at - a.at);
        for (const old of autos.slice(limit)) map.delete(old.id);
      }),
    remove: (id) => map.delete(id),
    rename: (id, name) => {
      const v = map.get(id);
      if (v) map.set(id, { ...v, name: name || undefined });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
