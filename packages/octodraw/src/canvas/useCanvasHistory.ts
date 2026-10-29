import { useCallback, useRef, useState } from 'react';
import type { CanvasDocument } from './model';

export interface CanvasChangeMeta {
  /** Not an undo step (e.g. a figure growing to fit its diagram). */
  silent?: boolean;
}

const LIMIT = 200;

/** Document state with undo/redo, for hosts without their own history (collaboration replaces this). */
export function useCanvasHistory(initial: CanvasDocument | (() => CanvasDocument)) {
  const [doc, setDoc] = useState(initial);
  const past = useRef<CanvasDocument[]>([]);
  const future = useRef<CanvasDocument[]>([]);
  const current = useRef(doc);
  current.current = doc;
  const [, bump] = useState(0);

  const change = useCallback((next: CanvasDocument, meta: CanvasChangeMeta = {}) => {
    if (next === current.current) return;
    if (!meta.silent) {
      past.current = [...past.current.slice(-LIMIT + 1), current.current];
      future.current = [];
    }
    current.current = next;
    setDoc(next);
  }, []);

  const step = useCallback((from: { current: CanvasDocument[] }, to: { current: CanvasDocument[] }) => {
    const target = from.current.at(-1);
    if (!target) return;
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, current.current];
    current.current = target;
    setDoc(target);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  return { doc, change, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
