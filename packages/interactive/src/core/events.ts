import type { Score } from "./grading.js";
import type { SpecIssue } from "./registry.js";

interface EventBase {
  activityId: string;
  activityType: string;
  /** Epoch milliseconds. */
  at: number;
}

/** Everything activities report. One shape for analytics, persistence and adaptive tutoring. */
export type ActivityEvent =
  | (EventBase & { type: "activity.started" })
  | (EventBase & { type: "activity.completed"; score?: Score })
  | (EventBase & { type: "activity.reset" })
  | (EventBase & { type: "card.flipped"; cardId: string; side: "front" | "back" })
  | (EventBase & { type: "card.marked"; cardId: string; known: boolean })
  | (EventBase & { type: "hint.shown"; itemId: string })
  | (EventBase & { type: "question.answered"; questionId: string; selected: string[]; correct?: boolean; confidence?: "guess" | "unsure" | "sure" })
  | (EventBase & { type: "quiz.submitted"; responses: Record<string, string[]> })
  | (EventBase & { type: "match.attempted"; leftId: string; rightId: string; correct: boolean })
  | (EventBase & { type: "node.toggled"; nodeId: string; expanded: boolean })
  | (EventBase & { type: "node.edited"; nodeId: string; label: string })
  | (EventBase & { type: "spec.invalid"; issues: SpecIssue[] });

export type ActivityEventType = ActivityEvent["type"];

/** An event before the emitter stamps it with the activity and time. */
export type ActivityEventInput = WithoutBase<ActivityEvent>;

type WithoutBase<E> = E extends unknown ? Omit<E, keyof EventBase> : never;

export type ActivityEventHandler = (event: ActivityEvent) => void;
