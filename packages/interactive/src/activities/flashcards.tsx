import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { dueLabel, isDue, nextDue, orderByDue, reviewCard, shuffle, type Flashcard, type ReviewState } from "../core/index.js";
import { useControllableState, useInteractive } from "../react/index.js";
import { ActivityFrame, cx, hasModifier, isTyping, LiveRegion, ScoreSummary, useActivity, type ActivityProps } from "./ui.js";

export interface FlashcardsState {
  /** Card ids in study order for this round. */
  order: string[];
  index: number;
  flipped: boolean;
  /** true = known, false = still learning. Only cards in this round. */
  marks: Record<string, boolean>;
  /** Spaced-repetition schedule per card, kept across rounds. */
  reviews: Record<string, ReviewState>;
  /** Each marked card's schedule from before this round, so marking it again re-decides instead of promoting twice. */
  before?: Record<string, ReviewState | null>;
  /** Every card id when this state was made; cards added to the deck since then join the round. */
  deck?: string[];
  /** False until the order has been shuffled or sorted by due date, which happens in the browser so the server and client agree. */
  prepared?: boolean;
  /** Spaced repetition with nothing due: the deck shows "all caught up" until the learner studies anyway. */
  caughtUp?: boolean;
  /** Show the answer side first. */
  reversed?: boolean;
}

export interface FlashcardsOptions {
  cards: readonly Flashcard[];
  shuffle?: boolean;
  spacedRepetition?: boolean;
}

export interface FlashcardsProps extends FlashcardsOptions, ActivityProps<FlashcardsState> {
  title?: string;
  description?: string;
}

/** A fresh round in the cards' own order. Shuffling and due dates are applied once mounted, by `prepareRound`. */
export function initialFlashcardsState({ cards, shuffle: random, spacedRepetition }: FlashcardsOptions, reviews: Record<string, ReviewState> = {}): FlashcardsState {
  const ids = cards.map((c) => c.id);
  return { order: ids, index: 0, flipped: false, marks: {}, reviews, deck: ids, prepared: !random && !spacedRepetition };
}

/** Puts a fresh round in study order: shuffled if asked, and with spaced repetition only the cards that are due. */
export function prepareRound(state: FlashcardsState, { shuffle: random, spacedRepetition }: Omit<FlashcardsOptions, "cards">, now = Date.now()): FlashcardsState {
  let order = random ? shuffle(state.order) : state.order;
  let caughtUp = false;
  if (spacedRepetition) {
    order = orderByDue(order, state.reviews, now);
    const due = order.filter((id) => isDue(state.reviews[id], now));
    if (due.length) order = due;
    else caughtUp = true;
  }
  return { ...state, order, index: 0, flipped: false, prepared: true, caughtUp };
}

/**
 * Brings saved state in line with the cards as they are now: cards that were
 * removed leave the round, new ones join it, and the position stays in range.
 * Returns the same object when nothing changed.
 */
export function reconcileFlashcards(state: FlashcardsState, cards: readonly Flashcard[]): FlashcardsState {
  const ids = cards.map((c) => c.id);
  const exists = new Set(ids);
  const known = new Set(state.deck ?? ids);
  const kept = [...new Set(state.order.filter((id) => exists.has(id)))];
  const added = ids.filter((id) => !known.has(id) && !kept.includes(id));
  const order = kept.length || added.length ? [...kept, ...added] : ids;
  const index = Math.max(0, Math.min(state.index, order.length - 1));
  const same = order.length === state.order.length && order.every((id, i) => id === state.order[i]) && index === state.index && (state.deck?.length ?? -1) === ids.length;
  if (same) return state;
  const inRound = new Set(order);
  const marks = Object.fromEntries(Object.entries(state.marks).filter(([id]) => inRound.has(id)));
  return { ...state, order, index, marks, deck: ids, flipped: index === state.index ? state.flipped : false };
}

/** Saved state is reused if it has the right shape; `reconcileFlashcards` fixes the rest. */
function usable(state: FlashcardsState | undefined): state is FlashcardsState {
  return !!state && Array.isArray(state.order) && typeof state.index === "number" && typeof state.marks === "object" && typeof state.reviews === "object";
}

/** Headless flashcard logic: state plus actions, no markup. */
export function useFlashcards(props: FlashcardsProps) {
  const { cards } = props;
  const { id, emit } = useActivity("flashcards", props);
  const [raw, setRaw] = useControllableState<FlashcardsState>(
    usable(props.state) ? props.state : undefined,
    () => (usable(props.defaultState) ? props.defaultState : initialFlashcardsState(props)),
    props.onStateChange,
  );
  const state = useMemo(() => reconcileFlashcards(raw, cards), [raw, cards]);
  // Save the reconciled state, so the deck it knows about is remembered and later additions are spotted.
  useEffect(() => {
    if (state !== raw) setRaw(() => state);
  }, [state, raw, setRaw]);
  // Every change starts from the latest state, brought in line with the cards.
  const setState = (update: (s: FlashcardsState) => FlashcardsState) => setRaw((s) => update(reconcileFlashcards(s, cards)));
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const card = byId.get(state.order[state.index]!) ?? cards[0]!;
  const total = state.order.length;
  const marked = state.order.filter((cardId) => cardId in state.marks).length;
  const known = state.order.filter((cardId) => state.marks[cardId] === true).length;
  const done = marked === total && !state.caughtUp;
  const options = { shuffle: props.shuffle, spacedRepetition: props.spacedRepetition };

  // Shuffle and sort by due date in the browser, once per round.
  useEffect(() => {
    if (state.prepared === false) setState((s) => (s.prepared === false ? prepareRound(s, options) : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.prepared]);

  const go = (index: number) => setState((s) => ({ ...s, index: Math.max(0, Math.min(index, s.order.length - 1)), flipped: false }));
  const score = (marks: Record<string, boolean>, order: string[]) => {
    const earned = order.filter((cardId) => marks[cardId]).length;
    return { earned, possible: order.length, percent: Math.round((earned / order.length) * 100) };
  };

  return {
    id,
    state,
    card,
    total,
    marked,
    known,
    done,
    flip() {
      emit({ type: "card.flipped", cardId: card.id, side: state.flipped ? "front" : "back" });
      setState((s) => ({ ...s, flipped: !s.flipped }));
    },
    hintShown: () => emit({ type: "hint.shown", itemId: card.id }),
    next: () => setState((s) => ({ ...s, index: Math.min(s.index + 1, s.order.length - 1), flipped: false })),
    previous: () => setState((s) => ({ ...s, index: Math.max(s.index - 1, 0), flipped: false })),
    goTo: go,
    mark(isKnown: boolean) {
      const cardId = card.id;
      const s = state;
      const marks = { ...s.marks, [cardId]: isKnown };
      const before = { ...s.before };
      if (!(cardId in before)) before[cardId] = s.reviews[cardId] ?? null;
      // From the schedule as it was before this round, so changing a mark doesn't count twice.
      const reviews = props.spacedRepetition ? { ...s.reviews, [cardId]: reviewCard(before[cardId] ?? undefined, isKnown) } : s.reviews;
      // Move on to the next card not yet marked, if any.
      const nextIndex = s.order.findIndex((other, i) => i > s.index && !(other in marks));
      const fallback = s.order.findIndex((other) => !(other in marks));
      const index = nextIndex !== -1 ? nextIndex : fallback !== -1 ? fallback : s.index;
      setState((latest) => ({ ...latest, marks, reviews, before, index, flipped: false }));
      emit({ type: "card.marked", cardId, known: isKnown });
      if (fallback === -1 && !s.order.every((other) => other in s.marks)) emit({ type: "activity.completed", score: score(marks, s.order) });
    },
    /** Puts back a state from before (undo). */
    restore: (previous: FlashcardsState) => setState(() => previous),
    /** Starts a new round: every card, or only the ones marked "still learning". */
    restart(onlyMissed = false) {
      const missed = state.order.filter((cardId) => state.marks[cardId] === false);
      const fresh = { ...initialFlashcardsState(props, state.reviews), reversed: state.reversed };
      setState(() => (onlyMissed && missed.length ? { ...fresh, order: missed, prepared: !props.shuffle } : fresh));
      emit({ type: "activity.reset" });
    },
    /** Shuffles the cards not marked yet; the marked ones stay where they are. */
    reshuffle() {
      setState((s) => {
        const rest = shuffle(s.order.filter((cardId) => !(cardId in s.marks)));
        const order = [...s.order.filter((cardId) => cardId in s.marks), ...rest];
        return { ...s, order, index: Math.min(order.length - rest.length, order.length - 1), flipped: false };
      });
    },
    /** Spaced repetition with nothing due: study every card anyway. */
    studyAnyway: () => setState((s) => ({ ...s, caughtUp: false, index: 0, flipped: false })),
    setReversed: (reversed: boolean) => setState((s) => ({ ...s, reversed, flipped: false })),
    score: () => score(state.marks, state.order),
  };
}

/** Bigger type for short cards, smaller for long ones, so every card fits without scrolling in most cases. */
function sizeClass(text: string): string {
  const n = text.length;
  return n <= 24 ? "ix-card__text--xl" : n <= 80 ? "ix-card__text--l" : n <= 200 ? "ix-card__text--m" : "ix-card__text--s";
}

/** How far a card has to travel, or how fast, for a swipe to count. */
const SWIPE_DISTANCE = 90;
const SWIPE_SPEED = 0.6;

type Swipe = { id: number; x: number; y: number; t: number; dx: number; active: boolean };

function Icon({ d }: { d: string }) {
  return (
    <svg className="ix-fc__icon" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  prev: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  flip: "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  shuffle: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  undo: "M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8",
  swap: "M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4",
  check: "M20 6L9 17l-5-5",
  again: "M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10",
  hint: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z",
};

export function Flashcards(props: FlashcardsProps) {
  const deck = useFlashcards(props);
  const { state, card, total, done } = deck;
  const { renderText } = useInteractive();
  const text = (value: string): ReactNode => (renderText ? renderText(value) : value);
  const frame = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [history, setHistory] = useState<FlashcardsState[]>([]);
  const [swipe, setSwipe] = useState<Swipe | null>(null);
  const suppressClick = useRef(false);
  // The time, read after mount so the server and browser render the same thing.
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), [state.reviews, done]);

  const front = state.reversed ? card.back : card.front;
  const back = state.reversed ? card.front : card.back;
  const review = state.reviews[card.id];
  const hasFocus = () => !!frame.current?.contains(document.activeElement);

  // Keep the keyboard working: after a mark the card (or the summary) gets the focus, if it was in the deck.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (done ? summaryRef.current?.querySelector<HTMLElement>("button") : cardRef.current)?.focus({ preventScroll: true });
  });

  const flip = () => {
    deck.flip();
    setAnnouncement(state.flipped ? `Front: ${front}` : `Answer: ${back}`);
  };
  const mark = (known: boolean) => {
    refocus.current = hasFocus();
    setHistory((h) => [...h.slice(-19), state]);
    deck.mark(known);
    setHint(null);
    setAnnouncement(known ? "Marked as known" : "Marked as still learning");
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    refocus.current = hasFocus();
    setHistory((h) => h.slice(0, -1));
    deck.restore(previous);
    setAnnouncement("Undone");
  };
  const move = (step: 1 | -1) => {
    refocus.current = hasFocus();
    if (step === 1) deck.next();
    else deck.previous();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event) || hasModifier(event) || done || state.caughtUp) return;
    const key = event.key.toLowerCase();
    if (key === "arrowright") move(1);
    else if (key === "arrowleft") move(-1);
    else if (key === "f") flip();
    else if ((key === "k" || key === "2") && state.flipped) mark(true);
    else if ((key === "l" || key === "1") && state.flipped) mark(false);
    else if (key === "u" && history.length) undo();
    else if (key === "h" && card.hint && !state.flipped) showHint();
    else return;
    event.preventDefault();
  };

  const showHint = () => {
    if (hint === card.id) return;
    setHint(card.id);
    deck.hintShown();
    setAnnouncement(`Hint: ${card.hint}`);
  };

  // Swipe: right means "I know this", left "still learning" once the answer shows; before that, left and right move between cards.
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    setSwipe({ id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, dx: 0, active: false });
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 12) setSwipe(null); // scrolling the page, not swiping
        return;
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setSwipe({ ...swipe, dx, active: true });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const s = swipe;
    setSwipe(null);
    if (!s.active) return;
    suppressClick.current = true;
    const speed = Math.abs(s.dx) / Math.max(1, event.timeStamp - s.t);
    if (Math.abs(s.dx) < SWIPE_DISTANCE && speed < SWIPE_SPEED) return;
    const right = s.dx > 0;
    if (state.flipped) mark(right);
    else move(right ? -1 : 1);
  };

  const dx = swipe?.active ? swipe.dx : 0;
  const lean = state.flipped && Math.abs(dx) > 24 ? (dx > 0 ? "known" : "learning") : null;
  const segments = state.order.map((cardId) => (cardId in state.marks ? (state.marks[cardId] ? "known" : "learning") : "todo"));
  const nextReview = state.caughtUp && now ? nextDue(state.order, state.reviews, now) : undefined;

  return (
    <ActivityFrame type="flashcards" title={props.title} description={props.description} label="Flashcards" theme={props.theme} className={props.className} onKeyDown={onKeyDown}>
      <div ref={frame} className={cx("ix-fc", state.prepared === false && "ix-fc--preparing")}>
        <div className="ix-fc__top">
          <span className="ix-fc__count" aria-live="polite">
            {state.caughtUp ? `${total} cards` : `Card ${Math.min(state.index + 1, total)} of ${total}`}
          </span>
          <span className="ix-fc__tally" hidden={state.caughtUp}>
            <span className="ix-fc__pill ix-fc__pill--known" title="Known">
              <Icon d={ICONS.check} />
              {deck.known} known
            </span>
            <span className="ix-fc__pill ix-fc__pill--learning" title="Still learning">
              <Icon d={ICONS.again} />
              {deck.marked - deck.known} still learning
            </span>
          </span>
        </div>
        <div
          className="ix-fc__progress"
          role="progressbar"
          aria-label="Cards marked"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={deck.marked}
          aria-valuetext={`${deck.marked} of ${total} cards marked: ${deck.known} known, ${deck.marked - deck.known} still learning`}
        >
          {total <= 60 ? (
            segments.map((kind, i) => <span key={i} className={cx("ix-fc__segment", `ix-fc__segment--${kind}`, i === state.index && !done && !state.caughtUp && "ix-fc__segment--current")} />)
          ) : (
            <>
              <span className="ix-fc__segment ix-fc__segment--known" style={{ flex: deck.known }} />
              <span className="ix-fc__segment ix-fc__segment--learning" style={{ flex: deck.marked - deck.known }} />
              <span className="ix-fc__segment ix-fc__segment--todo" style={{ flex: total - deck.marked }} />
            </>
          )}
        </div>

        {state.caughtUp ? (
          <div className="ix-fc__caught" role="status">
            <p className="ix-fc__caught-title">All caught up</p>
            <p className="ix-muted">
              Nothing is due for review{nextReview && now ? `. The next card comes up ${dueLabel(nextReview, now)}` : ""}.
            </p>
            <button type="button" className="ix-button" onClick={deck.studyAnyway}>
              Study all {total} anyway
            </button>
          </div>
        ) : done ? (
          <div ref={summaryRef}>
            <ScoreSummary score={deck.score()} label="Cards you know">
              {deck.known < total ? (
                <button type="button" className="ix-button ix-button--primary" onClick={() => deck.restart(true)}>
                  Review the {total - deck.known} still learning
                </button>
              ) : null}
              <button type="button" className="ix-button" onClick={() => deck.restart()}>
                Start over
              </button>
            </ScoreSummary>
          </div>
        ) : (
          <>
            <div className={cx("ix-fc__stage", total > 1 && "ix-fc__stage--stack", total > 2 && "ix-fc__stage--stack2")}>
              <button
                key={`${card.id}-${state.reversed ? "r" : "f"}`}
                ref={cardRef}
                type="button"
                className={cx("ix-card", swipe?.active && "ix-card--dragging", lean && `ix-card--lean-${lean}`)}
                data-flipped={state.flipped}
                style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : undefined}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  flip();
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setSwipe(null)}
                aria-label={state.flipped ? `Answer: ${back}. Press to see the front.` : `${front}. Press to see the answer.`}
              >
                <span className="ix-card__inner">
                  <span className="ix-card__face ix-card__face--front" aria-hidden="true">
                    <span className="ix-card__body">
                      <span className="ix-card__side">{state.reversed ? "Answer" : "Question"}</span>
                      <span className={cx("ix-card__text", sizeClass(front))}>{text(front)}</span>
                      {hint === card.id && card.hint ? <span className="ix-card__hint">{text(card.hint)}</span> : null}
                    </span>
                    <span className="ix-card__cue">Tap to flip</span>
                  </span>
                  <span className="ix-card__face ix-card__face--back" aria-hidden="true">
                    <span className="ix-card__body">
                      <span className="ix-card__side">{state.reversed ? "Question" : "Answer"}</span>
                      <span className={cx("ix-card__text", sizeClass(back))}>{text(back)}</span>
                    </span>
                  </span>
                </span>
                {lean ? (
                  <span className={`ix-card__stamp ix-card__stamp--${lean}`} aria-hidden="true">
                    {lean === "known" ? "Know it" : "Still learning"}
                  </span>
                ) : null}
              </button>
            </div>

            <div className={cx("ix-fc__marks", state.flipped && "ix-fc__marks--on")} role="group" aria-label="How did you do?" aria-hidden={!state.flipped}>
              <button type="button" className="ix-fc__mark ix-fc__mark--learning" onClick={() => mark(false)} tabIndex={state.flipped ? 0 : -1}>
                <Icon d={ICONS.again} />
                Still learning <kbd>L</kbd>
              </button>
              <button type="button" className="ix-fc__mark ix-fc__mark--known" onClick={() => mark(true)} tabIndex={state.flipped ? 0 : -1}>
                <Icon d={ICONS.check} />
                I know this <kbd>K</kbd>
              </button>
            </div>

            <div className="ix-fc__controls">
              <div className="ix-fc__nav">
                <button type="button" className="ix-fc__tool" onClick={() => move(-1)} disabled={state.index === 0} aria-label="Previous card" title="Previous (←)">
                  <Icon d={ICONS.prev} />
                </button>
                <button type="button" className="ix-fc__flip" onClick={flip}>
                  <Icon d={ICONS.flip} />
                  {state.flipped ? "Show front" : "Show answer"} <kbd>F</kbd>
                </button>
                <button type="button" className="ix-fc__tool" onClick={() => move(1)} disabled={state.index === total - 1} aria-label="Next card" title="Next (→)">
                  <Icon d={ICONS.next} />
                </button>
              </div>
              <div className="ix-fc__extras">
                {card.hint && !state.flipped ? (
                  <button type="button" className="ix-fc__tool" onClick={showHint} disabled={hint === card.id} aria-label="Hint" title="Hint (H)">
                    <Icon d={ICONS.hint} />
                  </button>
                ) : null}
                {history.length ? (
                  <button type="button" className="ix-fc__tool" onClick={undo} aria-label="Undo" title="Undo the last mark (U)">
                    <Icon d={ICONS.undo} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ix-fc__tool"
                  onClick={() => deck.setReversed(!state.reversed)}
                  aria-pressed={!!state.reversed}
                  aria-label="Answer first"
                  title={state.reversed ? "Show the question first" : "Show the answer first"}
                >
                  <Icon d={ICONS.swap} />
                </button>
                {total - deck.marked > 1 ? (
                  <button type="button" className="ix-fc__tool" onClick={deck.reshuffle} aria-label="Shuffle" title="Shuffle the cards left">
                    <Icon d={ICONS.shuffle} />
                  </button>
                ) : null}
              </div>
            </div>

            {card.id in state.marks ? (
              <p className="ix-small ix-muted ix-fc__note">
                {state.marks[card.id] ? "You marked this as known" : "You marked this as still learning"}
                {props.spacedRepetition && review && now ? (review.box === 0 ? ". It's due again today." : `. Next review ${dueLabel(review.due, now)}.`) : "."}
              </p>
            ) : null}
            <p className="ix-small ix-muted ix-shortcuts">Swipe or use the keys: ← → move, F flips, K know it, L still learning, U undo.</p>
          </>
        )}
      </div>
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}
