/**
 * When you last opened "Shared with you" on this device. Anything shared
 * after that is "New" on Home and counted in the account panel — v1's only
 * in-app notification (the share email is the other).
 */
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

const KEY = "shared-seen-at";
let seenAt: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void SecureStore.getItemAsync(KEY)
  .then((v) => {
    seenAt = v;
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    emit();
  });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** null until storage has been read, so nothing flashes "New" by mistake. */
export function useSharedSeenAt(): { loaded: boolean; seenAt: string | null } {
  const at = useSyncExternalStore(subscribe, () => seenAt);
  const ready = useSyncExternalStore(subscribe, () => loaded);
  return { loaded: ready, seenAt: at };
}

export function isNewShare(
  sharedAt: string,
  s: { loaded: boolean; seenAt: string | null },
) {
  return s.loaded && (!s.seenAt || sharedAt > s.seenAt);
}

export function markSharedSeen() {
  seenAt = new Date().toISOString();
  emit();
  void SecureStore.setItemAsync(KEY, seenAt).catch(() => undefined);
}
