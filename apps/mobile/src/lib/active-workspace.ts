/**
 * Which workspace the app shows, remembered on this device (Settings →
 * Memberships → Switch). Falls back to your first workspace.
 */
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

const KEY = "active-workspace";
let activeId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void SecureStore.getItemAsync(KEY)
  .then((v) => {
    activeId = v;
    emit();
  })
  .catch(() => undefined);

export function useStoredWorkspaceId(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activeId,
  );
}

export function setActiveWorkspaceId(id: string) {
  activeId = id;
  emit();
  void SecureStore.setItemAsync(KEY, id).catch(() => undefined);
}
