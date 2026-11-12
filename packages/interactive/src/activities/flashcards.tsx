import { useMemo, useState, type KeyboardEvent } from "react";
import { orderByDue, scheduleReview, shuffle, type Flashcard, type ReviewState } from "../core/index.js";
import { useControllableState } from "../react/index.js";
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

export function initialFlashcardsState({ cards, shuffle: random, spacedRepetition }: FlashcardsOptions, reviews: Record<string, ReviewState> = {}): FlashcardsState {
  let order = cards.map((c) => c.id);
  if (random) order = shuffle(order);
  if (spacedRepetition) order = orderByDue(order, reviews);
  return { order, index: 0, flipped: false, marks: {}, reviews };
}

/** Saved state is only reused if it still matches the cards. */
function usable(state: FlashcardsState | undefined, cards: readonly Flashcard[]): state is FlashcardsState {
  if (!state || !Array.isArray(state.order) || state.order.length === 0) return false;
  const ids = new Set(cards.map((c) => c.id));
  return state.order.every((id) => ids.has(id)) && state.index >= 0 && state.index < state.order.length;
}

/** Headless flashcard logic: state plus actions, no markup. */
export function useFlashcards(props: FlashcardsProps) {
  const { cards } = props;
  const { id, emit } = useActivity("flashcards", props);
  const [state, setState] = useControllableState<FlashcardsState>(
    usable(props.state, cards) ? props.state : undefined,
    () => (usable(props.defaultState, cards) ? props.defaultState : initialFlashcardsState(props)),
    props.onStateChange,
  );
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const card = byId.get(state.order[state.index]!)!;
  const total = state.order.length;
  const marked = state.order.filter((cardId) => cardId in state.marks).length;
  const known = state.order.filter((cardId) => state.marks[cardId] === true).length;
  const done = marked === total;

  const go = (index: number) => setState((s) => ({ ...s, index: Math.max(0, Math.min(index, s.order.length - 1)), flipped: false }));

  return {
    id,
    state,
    card,
    total,
    marked,
    known,
    done,
    flip() {
      const side = state.flipped ? "front" : "back";
      setState((s) => ({ ...s, flipped: !s.flipped }));
      emit({ type: "card.flipped", cardId: card.id, side });
    },
    hintShown: () => emit({ type: "hint.shown", itemId: card.id }),
    next: () => go(state.index + 1),
    previous: () => go(state.index - 1),
    goTo: go,
    mark(isKnown: boolean) {
      const marks = { ...state.marks, [card.id]: isKnown };
      const reviews = props.spacedRepetition ? { ...state.reviews, [card.id]: scheduleReview(state.reviews[card.id], isKnown) } : state.reviews;
      // Move on to the next card not yet marked, if any.
      const nextIndex = state.order.findIndex((cardId, i) => i > state.index && !(cardId in marks));
      const fallback = state.order.findIndex((cardId) => !(cardId in marks));
      const index = nextIndex !== -1 ? nextIndex : fallback !== -1 ? fallback : state.index;
      setState({ ...state, marks, reviews, index, flipped: false });
      emit({ type: "card.marked", cardId: card.id, known: isKnown });
      if (fallback === -1) {
        const knownNow = state.order.filter((cardId) => marks[cardId]).length;
        emit({ type: "activity.completed", score: { earned: knownNow, possible: total, percent: Math.round((knownNow / total) * 100) } });
      }
    },
    /** Starts a new round: every card, or only the ones marked "still learning". */
    restart(onlyMissed = false) {
      const missed = state.order.filter((cardId) => state.marks[cardId] === false);
      const fresh = initialFlashcardsState(props, state.reviews);
      setState(onlyMissed && missed.length ? { ...fresh, order: missed } : fresh);
      emit({ type: "activity.reset" });
    },
    reshuffle() {
      const rest = shuffle(state.order.filter((cardId) => !(cardId in state.marks)));
      const order = [...state.order.filter((cardId) => cardId in state.marks), ...rest];
      setState({ ...state, order, index: Math.min(order.length - rest.length, order.length - 1), flipped: false });
    },
  };
}

export function Flashcards(props: FlashcardsProps) {
  const deck = useFlashcards(props);
  const { state, card, total, done } = deck;
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const review = state.reviews[card.id];

  const flip = () => {
    deck.flip();
    setAnnouncement(state.flipped ? `Front: ${card.front}` : `Answer: ${card.back}`);
  };
  const mark = (known: boolean) => {
    deck.mark(known);
    setHint(null);
    setAnnouncement(known ? "Marked as known" : "Marked as still learning");
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event) || hasModifier(event) || done) return;
    const key = event.key.toLowerCase();
    if (key === "arrowright") deck.next();
    else if (key === "arrowleft") deck.previous();
    else if (key === "f") flip();
    else if (key === "k" && state.flipped) mark(true);
    else if (key === "l" && state.flipped) mark(false);
    else return;
    event.preventDefault();
  };

  return (
    <ActivityFrame type="flashcards" title={props.title} description={props.description} label="Flashcards" theme={props.theme} className={props.className} onKeyDown={onKeyDown}>
      <div className="ix-status">
        <span>
          Card {state.index + 1} of {total}
        </span>
        <span className="ix-muted">
          {deck.known} known · {deck.marked - deck.known} still learning
        </span>
      </div>
      <div className="ix-progress" role="progressbar" aria-label="Cards marked" aria-valuemin={0} aria-valuemax={total} aria-valuenow={deck.marked}>
        <div className="ix-progress__bar" style={{ width: `${(deck.marked / total) * 100}%` }} />
      </div>

      {done ? (
        <ScoreSummary score={{ earned: deck.known, possible: total, percent: Math.round((deck.known / total) * 100) }} label="Cards you know">
          {deck.known < total ? (
            <button type="button" className="ix-button ix-button--primary" onClick={() => deck.restart(true)}>
              Review the {total - deck.known} still learning
            </button>
          ) : null}
          <button type="button" className="ix-button" onClick={() => deck.restart()}>
            Start over
          </button>
        </ScoreSummary>
      ) : (
        <>
          <button
            type="button"
            className="ix-card"
            data-flipped={state.flipped}
            onClick={flip}
            aria-label={state.flipped ? `Answer: ${card.back}. Press to see the front.` : `${card.front}. Press to see the answer.`}
          >
            <span className="ix-card__inner">
              <span className="ix-card__face ix-card__face--front" aria-hidden="true">
                <span className="ix-card__side">Front</span>
                <span className="ix-card__text">{card.front}</span>
              </span>
              <span className="ix-card__face ix-card__face--back" aria-hidden="true">
                <span className="ix-card__side">Answer</span>
                <span className="ix-card__text">{card.back}</span>
              </span>
            </span>
          </button>
          {card.id in state.marks ? (
            <p className="ix-small ix-muted ix-flashcards__mark">{state.marks[card.id] ? "You marked this as known." : "You marked this as still learning."}</p>
          ) : null}

          {hint === card.id && card.hint ? <p className="ix-hint">{card.hint}</p> : null}

          {state.flipped ? (
            <div className="ix-flashcards__marks" role="group" aria-label="How did you do?">
              <button type="button" className="ix-button ix-button--learning" onClick={() => mark(false)}>
                Still learning <kbd>L</kbd>
              </button>
              <button type="button" className="ix-button ix-button--known" onClick={() => mark(true)}>
                I know this <kbd>K</kbd>
              </button>
            </div>
          ) : null}

          <div className="ix-toolbar">
            <button type="button" className="ix-button" onClick={deck.previous} disabled={state.index === 0} aria-label="Previous card">
              ←
            </button>
            <button type="button" className="ix-button" onClick={flip}>
              {state.flipped ? "Show front" : "Show answer"} <kbd>F</kbd>
            </button>
            <button type="button" className="ix-button" onClick={deck.next} disabled={state.index === total - 1} aria-label="Next card">
              →
            </button>
            <span className="ix-toolbar__spacer" />
            {card.hint && !state.flipped ? (
              <button
                type="button"
                className="ix-button ix-button--ghost"
                onClick={() => {
                  setHint(card.id);
                  deck.hintShown();
                }}
                disabled={hint === card.id}
              >
                Hint
              </button>
            ) : null}
            <button type="button" className="ix-button ix-button--ghost" onClick={deck.reshuffle}>
              Shuffle
            </button>
          </div>
          {props.spacedRepetition && review ? (
            <p className={cx("ix-small", "ix-muted")}>{review.box === 0 ? "This card comes back this session." : `Next review in ${Math.max(1, Math.round((review.due - Date.now()) / 86_400_000))} days.`}</p>
          ) : null}
          <p className="ix-small ix-muted ix-shortcuts">Keys: ← → to move, F to flip, K known, L still learning.</p>
        </>
      )}
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}
