"use client";

import { useCallback, useRef, useState } from "react";

const LIMIT = 200;

/**
 * Undo/redo over whole snapshots (decks are immutable values). `change` with
 * `{ merge: key }` folds rapid changes of the same kind (typing, a drag in
 * progress) into one undo step.
 */
export function useHistory<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const current = useRef(initial);
  const [, bump] = useState(0);

  const change = useCallback((next: T | ((prev: T) => T), opts: { merge?: string } = {}) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(current.current) : next;
    if (Object.is(resolved, current.current)) return;
    const now = Date.now();
    const merging = opts.merge && lastMerge.current?.key === opts.merge && now - lastMerge.current.at < 1500;
    if (!merging) {
      past.current.push(current.current);
      if (past.current.length > LIMIT) past.current.shift();
    }
    lastMerge.current = opts.merge ? { key: opts.merge, at: now } : null;
    future.current = [];
    current.current = resolved;
    setValue(resolved);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return null;
    future.current.push(current.current);
    current.current = prev;
    lastMerge.current = null;
    setValue(prev);
    bump((n) => n + 1);
    return prev;
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return null;
    past.current.push(current.current);
    current.current = next;
    lastMerge.current = null;
    setValue(next);
    bump((n) => n + 1);
    return next;
  }, []);

  return { value, change, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, current };
}
