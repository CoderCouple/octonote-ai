/**
 * List or grid, per list (Notes, Canvases, a notebook…), saved on the
 * device — the same choice the web app offers on its lists.
 */
import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";

export type ListView = "list" | "grid";

const cache = new Map<string, ListView>();
const loaded = new Set<string>();
const listeners = new Set<() => void>();
const storeKey = (key: string) => `list-view.${key}`;

function notify() {
  listeners.forEach((l) => l());
}

export function useListView(key: string): [ListView, (v: ListView) => void] {
  useEffect(() => {
    if (loaded.has(key)) return;
    loaded.add(key);
    SecureStore.getItemAsync(storeKey(key))
      .then((v) => {
        if (v === "grid" || v === "list") {
          cache.set(key, v);
          notify();
        }
      })
      .catch(() => undefined);
  }, [key]);
  const view = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache.get(key) ?? "list",
  );
  return [
    view,
    (v) => {
      cache.set(key, v);
      notify();
      void SecureStore.setItemAsync(storeKey(key), v).catch(() => undefined);
    },
  ];
}
