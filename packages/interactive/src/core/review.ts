/** Days until the next review for each Leitner box. Box 0 is due now. */
export const REVIEW_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewState {
  /** 0 (new or forgotten) up to the last box. */
  box: number;
  /** When the card is next due, in epoch milliseconds. */
  due: number;
  reviews: number;
}

/**
 * Leitner-box spaced repetition: a known card moves up a box and waits longer,
 * a forgotten card goes back to box 0 and is due again straight away.
 */
export function scheduleReview(previous: ReviewState | undefined, known: boolean, now = Date.now()): ReviewState {
  const last = REVIEW_INTERVALS_DAYS.length - 1;
  const box = known ? Math.min((previous?.box ?? 0) + 1, last) : 0;
  return { box, due: now + REVIEW_INTERVALS_DAYS[box]! * DAY_MS, reviews: (previous?.reviews ?? 0) + 1 };
}

/** Ids in their original order, due cards first (new cards count as due). */
export function orderByDue(ids: readonly string[], states: Readonly<Record<string, ReviewState>>, now = Date.now()): string[] {
  const due = ids.filter((id) => (states[id]?.due ?? 0) <= now);
  const later = ids.filter((id) => (states[id]?.due ?? 0) > now).sort((a, b) => states[a]!.due - states[b]!.due);
  return [...due, ...later];
}
