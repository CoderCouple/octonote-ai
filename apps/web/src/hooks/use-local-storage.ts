"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Persist a React state value to localStorage. SSR-safe — the initial
 * render returns the fallback, then we hydrate from storage on mount.
 */
export function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore — corrupted JSON or storage unavailable
    }
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore — quota exceeded or storage unavailable
    }
  }, [key, value]);

  return [value, setValue] as const;
}
