/**
 * Appearance override (System / Light / Dark), saved on the device.
 * `Appearance.setColorScheme` makes useColorScheme — and so usePalette —
 * follow the choice everywhere in the native shell.
 */
import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";
import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "theme";
let choice: ThemeChoice = "system";
const listeners = new Set<() => void>();

function apply(next: ThemeChoice) {
  // "unspecified" hands control back to the OS.
  Appearance.setColorScheme(next === "system" ? "unspecified" : next);
}

/** Call once at startup. */
export async function loadThemeChoice() {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v === "light" || v === "dark") {
      choice = v;
      apply(v);
      listeners.forEach((l) => l());
    }
  } catch {
    // Keep following the system.
  }
}

export function setThemeChoice(next: ThemeChoice) {
  choice = next;
  apply(next);
  listeners.forEach((l) => l());
  void SecureStore.setItemAsync(KEY, next).catch(() => undefined);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => choice,
  );
}
