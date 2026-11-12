import type { Score } from "./grading.js";

export type ActivityStatus = "not_started" | "in_progress" | "completed";

/** What is saved for one activity. `state` is the activity's own JSON-safe state. */
export interface ActivityProgress<State = unknown> {
  activityId: string;
  activityType: string;
  status: ActivityStatus;
  attempts: number;
  score?: Score;
  state?: State;
  updatedAt: number;
}

/**
 * Where progress is kept. Implement it over your own database or API; methods
 * may be sync or async.
 */
export interface ProgressStore {
  load(key: string): ActivityProgress | undefined | Promise<ActivityProgress | undefined>;
  save(key: string, progress: ActivityProgress): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

export function memoryStore(initial: Record<string, ActivityProgress> = {}): ProgressStore {
  const data = new Map(Object.entries(initial));
  return {
    load: (key) => data.get(key),
    save: (key, progress) => void data.set(key, progress),
    remove: (key) => void data.delete(key),
  };
}

/**
 * Keeps progress in localStorage (or any Storage). Storage can be missing or
 * throw (private windows, blocked cookies), so failures are ignored.
 */
export function webStorageStore(storage: Storage | undefined = globalThis.localStorage, prefix = "interactive:"): ProgressStore {
  return {
    load(key) {
      try {
        const raw = storage?.getItem(prefix + key);
        return raw ? (JSON.parse(raw) as ActivityProgress) : undefined;
      } catch {
        return undefined;
      }
    },
    save(key, progress) {
      try {
        storage?.setItem(prefix + key, JSON.stringify(progress));
      } catch {
        // Full or blocked storage: progress just isn't kept.
      }
    },
    remove(key) {
      try {
        storage?.removeItem(prefix + key);
      } catch {
        // Nothing to clean up.
      }
    },
  };
}
