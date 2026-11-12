import { useState } from "react";
import { makeScore, shuffle, type MatchPair } from "../core/index.js";
import { useControllableState } from "../react/index.js";
import { ActivityFrame, cx, LiveRegion, ScoreSummary, useActivity, type ActivityProps } from "./ui.js";

export interface MatchingState {
  /** Pair ids in the order the right column shows them. */
  rightOrder: string[];
  /** Pair ids matched so far. */
  matched: string[];
  /** Pair ids whose left item had a wrong match this round. */
  missed: string[];
  mistakes: number;
  selectedLeft?: string;
  selectedRight?: string;
  /** Too many mistakes: the round is over. */
  failed: boolean;
  attempts: number;
}

export interface MatchingProps extends ActivityProps<MatchingState> {
  pairs: readonly MatchPair[];
  title?: string;
  description?: string;
  prompt?: string;
  maxMistakes?: number;
}

/** A right-column order that doesn't line every item up with its partner. */
function shuffledRight(pairs: readonly MatchPair[]): string[] {
  const ids = pairs.map((p) => p.id);
  for (let tries = 0; tries < 5; tries++) {
    const order = shuffle(ids);
    if (order.some((id, i) => id !== ids[i])) return order;
  }
  return [...ids.slice(1), ids[0]!];
}

const freshState = (pairs: readonly MatchPair[], attempts = 0): MatchingState => ({ rightOrder: shuffledRight(pairs), matched: [], missed: [], mistakes: 0, failed: false, attempts });

const usable = (state: MatchingState | undefined, pairs: readonly MatchPair[]): state is MatchingState => {
  if (!state || !Array.isArray(state.rightOrder)) return false;
  const ids = new Set(pairs.map((p) => p.id));
  return state.rightOrder.length === ids.size && state.rightOrder.every((id) => ids.has(id));
};

/** Headless matching logic. Select one item in each column to try a match. */
export function useMatching(props: MatchingProps) {
  const { pairs } = props;
  const { id, emit } = useActivity("matching", props);
  const [state, setState] = useControllableState<MatchingState>(
    usable(props.state, pairs) ? props.state : undefined,
    () => (usable(props.defaultState, pairs) ? props.defaultState : freshState(pairs)),
    props.onStateChange,
  );
  const [lastResult, setLastResult] = useState<{ correct: boolean; left: string; right: string } | null>(null);
  const done = state.matched.length === pairs.length;

  function attempt(leftId: string, rightId: string) {
    const correct = leftId === rightId;
    const matched = correct ? [...state.matched, leftId] : state.matched;
    const missed = correct || state.missed.includes(leftId) ? state.missed : [...state.missed, leftId];
    const mistakes = state.mistakes + (correct ? 0 : 1);
    const failed = !correct && props.maxMistakes !== undefined && mistakes >= props.maxMistakes;
    setState({ ...state, matched, missed, mistakes, failed, selectedLeft: undefined, selectedRight: undefined });
    setLastResult({ correct, left: leftId, right: rightId });
    emit({ type: "match.attempted", leftId, rightId, correct });
    if (matched.length === pairs.length) {
      emit({ type: "activity.completed", score: makeScore(pairs.length - missed.length, pairs.length) });
    }
  }

  return {
    id,
    state,
    done,
    lastResult,
    selectLeft(pairId: string) {
      if (state.failed || state.matched.includes(pairId)) return;
      if (state.selectedRight) return attempt(pairId, state.selectedRight);
      setState({ ...state, selectedLeft: state.selectedLeft === pairId ? undefined : pairId });
    },
    selectRight(pairId: string) {
      if (state.failed || state.matched.includes(pairId)) return;
      if (state.selectedLeft) return attempt(state.selectedLeft, pairId);
      setState({ ...state, selectedRight: state.selectedRight === pairId ? undefined : pairId });
    },
    reset() {
      setState(freshState(pairs, state.attempts + 1));
      setLastResult(null);
      emit({ type: "activity.reset" });
    },
  };
}

export function Matching(props: MatchingProps) {
  const game = useMatching(props);
  const { state } = game;
  const byId = new Map(props.pairs.map((p) => [p.id, p]));
  const matchNumber = (pairId: string) => state.matched.indexOf(pairId) + 1;
  const last = game.lastResult;
  const announcement = last
    ? last.correct
      ? `Matched ${byId.get(last.left)!.left} with ${byId.get(last.right)!.right}.`
      : `${byId.get(last.left)!.left} doesn't go with ${byId.get(last.right)!.right}.`
    : "";

  const item = (side: "left" | "right", pairId: string) => {
    const pair = byId.get(pairId)!;
    const matched = state.matched.includes(pairId);
    const selected = side === "left" ? state.selectedLeft === pairId : state.selectedRight === pairId;
    const wrong = last && !last.correct && (side === "left" ? last.left : last.right) === pairId;
    const text = side === "left" ? pair.left : pair.right;
    return (
      <li key={pairId}>
        <button
          type="button"
          className={cx("ix-match", selected && "ix-match--selected", matched && "ix-match--matched", wrong && "ix-match--wrong")}
          aria-pressed={selected}
          disabled={matched || state.failed}
          onClick={() => (side === "left" ? game.selectLeft(pairId) : game.selectRight(pairId))}
          data-match={matched ? (matchNumber(pairId) - 1) % 6 : undefined}
        >
          {matched ? (
            <span className="ix-match__badge" aria-hidden="true">
              {matchNumber(pairId)}
            </span>
          ) : null}
          <span>{text}</span>
          {matched ? <span className="ix-visually-hidden"> (matched)</span> : null}
        </button>
      </li>
    );
  };

  return (
    <ActivityFrame type="matching" title={props.title} description={props.description} label="Matching" theme={props.theme} className={props.className}>
      <p className="ix-matching__prompt">{props.prompt ?? "Select an item in each column to match them."}</p>
      <div className="ix-status">
        <span>
          {state.matched.length} of {props.pairs.length} matched
        </span>
        <span className="ix-muted">
          {state.mistakes} {state.mistakes === 1 ? "mistake" : "mistakes"}
          {props.maxMistakes !== undefined ? ` of ${props.maxMistakes} allowed` : ""}
        </span>
      </div>
      <div className="ix-matching__columns">
        <ul className="ix-matching__column" aria-label="Items">
          {props.pairs.map((p) => item("left", p.id))}
        </ul>
        <ul className="ix-matching__column" aria-label="Matches">
          {state.rightOrder.map((pairId) => item("right", pairId))}
        </ul>
      </div>
      {last && !last.correct && !state.failed ? (
        <p className="ix-feedback ix-feedback--incorrect" aria-hidden="true">
          Not a match. Try another.
        </p>
      ) : null}
      {state.failed ? (
        <div className="ix-notice ix-notice--error" role="alert">
          <p className="ix-notice__title">Too many wrong matches</p>
          <button type="button" className="ix-button ix-button--primary" onClick={game.reset}>
            Try again
          </button>
        </div>
      ) : null}
      {game.done ? (
        <ScoreSummary score={makeScore(props.pairs.length - state.missed.length, props.pairs.length)} label="Matched on the first try">
          <button type="button" className="ix-button" onClick={game.reset}>
            Play again
          </button>
        </ScoreSummary>
      ) : null}
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}
