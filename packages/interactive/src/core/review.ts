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

/**
 * One review of a card. Like `scheduleReview`, except that knowing a card
 * before it's due doesn't promote it: cramming early proves nothing about
 * remembering it later, so it keeps its box and its date.
 */
export function reviewCard(previous: ReviewState | undefined, known: boolean, now = Date.now()): ReviewState {
  if (known && previous && previous.due > now) return { ...previous, reviews: previous.reviews + 1 };
  return scheduleReview(previous, known, now);
}

/** New cards count as due. */
export const isDue = (state: ReviewState | undefined, now = Date.now()) => (state?.due ?? 0) <= now;

/** Ids in their original order, due cards first (new cards count as due). */
export function orderByDue(ids: readonly string[], states: Readonly<Record<string, ReviewState>>, now = Date.now()): string[] {
  const due = ids.filter((id) => isDue(states[id], now));
  const later = ids.filter((id) => !isDue(states[id], now)).sort((a, b) => states[a]!.due - states[b]!.due);
  return [...due, ...later];
}

/** When the soonest of these cards comes due, or undefined if any already is. */
export function nextDue(ids: readonly string[], states: Readonly<Record<string, ReviewState>>, now = Date.now()): number | undefined {
  if (ids.some((id) => isDue(states[id], now))) return undefined;
  return Math.min(...ids.map((id) => states[id]!.due));
}

/** "today", "tomorrow", "in 3 days": whole days from now, rounded up so "1 day" never means "in an hour". */
export function dueLabel(due: number, now = Date.now()): string {
  const days = Math.ceil((due - now) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
