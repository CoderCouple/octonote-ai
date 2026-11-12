import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEvent, ActivityEventHandler, ActivityEventInput } from "../core/index.js";
import { useInteractive } from "./context.js";

type Update<T> = T | ((previous: T) => T);

/**
 * State that the parent may control (`value` + `onChange`) or leave to the
 * component (`defaultValue`). Activities use it so learning state can live
 * outside them.
 */
export function useControllableState<T>(value: T | undefined, defaultValue: T | (() => T), onChange?: (value: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const set = useCallback(
    (update: Update<T>) => {
      const next = typeof update === "function" ? (update as (previous: T) => T)(currentRef.current) : update;
      if (Object.is(next, currentRef.current)) return;
      currentRef.current = next;
      if (!controlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );
  return [current, set] as const;
}

/**
 * Returns `emit`, which stamps an event with the activity and time and sends it
 * to the `onEvent` prop and to the provider. Emits `activity.started` on mount.
 */
export function useActivityEmitter(activityId: string, activityType: string, onEvent?: ActivityEventHandler) {
  const { emit: emitToProvider } = useInteractive();
  const latest = useRef({ activityId, activityType, onEvent, emitToProvider });
  latest.current = { activityId, activityType, onEvent, emitToProvider };

  const emit = useCallback((input: ActivityEventInput) => {
    const { activityId, activityType, onEvent, emitToProvider } = latest.current;
    const event = { ...input, activityId, activityType, at: Date.now() } as ActivityEvent;
    onEvent?.(event);
    emitToProvider(event);
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    emit({ type: "activity.started" });
  }, [emit]);

  return emit;
}
