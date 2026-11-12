import { useState } from "react";
import { checkResponse, expectedResponse, isAnswered, makeScore, type Question } from "../core/index.js";
import { useControllableState } from "../react/index.js";
import { QuestionView } from "./question-view.js";
import { ActivityFrame, cx, LiveRegion, ScoreSummary, useActivity, type ActivityProps } from "./ui.js";

export interface McqAnswer {
  /** The response (option ids, typed answers, an order…). */
  selected: string[];
  /** A written answer checked but not yet marked. */
  pending?: boolean;
  checked: boolean;
  correct: boolean;
  attempts: number;
  firstTryCorrect: boolean;
  /** How sure the learner said they were before checking. */
  confidence?: Confidence;
}

export type Confidence = "guess" | "unsure" | "sure";

export interface McqState {
  index: number;
  answers: Record<string, McqAnswer>;
  hints: Record<string, true>;
  completed: boolean;
  /** A review round: only these question ids, in this order. */
  round?: string[];
  /** First-round results, kept while reviewing so the score stays honest. */
  firstTry?: Record<string, boolean>;
}

/** Worth another go: wrong the first time, or right by guessing. */
export const needsReview = (answer: McqAnswer | undefined) => !!answer && (!answer.firstTryCorrect || answer.confidence === "guess");

export interface McqProps extends ActivityProps<McqState> {
  questions: readonly Question[];
  title?: string;
  description?: string;
  /** Let the learner try again after a wrong answer. Defaults to true. */
  allowRetry?: boolean;
}

const emptyState = (): McqState => ({ index: 0, answers: {}, hints: {}, completed: false });

const usable = (state: McqState | undefined, questions: readonly Question[]): state is McqState =>
  !!state && typeof state.answers === "object" && state.index >= 0 && state.index < (state.round?.length || questions.length);

/** Headless logic for practice questions that are checked one at a time. */
export function useMcq(props: McqProps) {
  const { questions } = props;
  const { id, emit } = useActivity("mcq", props);
  const [state, setState] = useControllableState<McqState>(
    usable(props.state, questions) ? props.state : undefined,
    () => (usable(props.defaultState, questions) ? props.defaultState : emptyState()),
    props.onStateChange,
  );
  const byId = new Map(questions.map((q) => [q.id, q]));
  // In a review round only some questions are asked.
  const active = state.round ? state.round.map((qid) => byId.get(qid)).filter((q): q is Question => !!q) : questions;
  const question = active[Math.min(state.index, active.length - 1)]!;
  const answer: McqAnswer = state.answers[question.id] ?? { selected: [], checked: false, correct: false, attempts: 0, firstTryCorrect: false };
  const firstTry = questions.filter((q) => (state.firstTry ? state.firstTry[q.id] : state.answers[q.id]?.firstTryCorrect)).length;
  const score = makeScore(firstTry, questions.length);
  const toReview = state.round ? [] : questions.filter((q) => needsReview(state.answers[q.id])).map((q) => q.id);

  const update = (patch: Partial<McqAnswer>) => setState((s) => ({ ...s, answers: { ...s.answers, [question.id]: { ...answer, ...patch } } }));

  /** Marks the answer and records the attempt. */
  const finish = (response: string[]) => {
    const { correct } = checkResponse(question, response);
    const attempts = answer.attempts + 1;
    const answers = { ...state.answers, [question.id]: { ...answer, selected: response, checked: true, pending: false, correct, attempts, firstTryCorrect: attempts === 1 && correct } };
    const allChecked = active.every((q) => (answers[q.id]?.checked && !answers[q.id]?.pending) || (answers[q.id]?.attempts ?? 0) > 0);
    const completed = state.completed || allChecked;
    setState({ ...state, answers, completed });
    emit({ type: "question.answered", questionId: question.id, selected: response, correct, ...(answer.confidence ? { confidence: answer.confidence } : {}) });
    if (completed && !state.completed && !state.round) {
      const earned = questions.filter((q) => answers[q.id]?.firstTryCorrect).length;
      emit({ type: "activity.completed", score: makeScore(earned, questions.length) });
    }
  };

  return {
    id,
    state,
    question,
    answer,
    score,
    hintShown: !!state.hints[question.id],
    active,
    toReview,
    canCheck: !answer.checked && isAnswered(question, answer.selected),
    setConfidence: (confidence: Confidence) => !answer.checked && update({ confidence: answer.confidence === confidence ? undefined : confidence }),
    /** Asks again only what needs it: missed the first time, or guessed. */
    review() {
      if (!toReview.length) return;
      const firstTry = Object.fromEntries(questions.map((q) => [q.id, !!state.answers[q.id]?.firstTryCorrect]));
      const answers = Object.fromEntries(Object.entries(state.answers).filter(([qid]) => !toReview.includes(qid)));
      setState({ ...state, index: 0, answers, completed: false, round: toReview, firstTry });
      emit({ type: "activity.started" });
    },
    /** Changes the answer; while a written answer waits for marking, this is the mark. */
    respond(next: string[]) {
      if (answer.checked && !answer.pending) return;
      if (answer.pending) {
        if (!checkResponse(question, next).pending) finish(next);
        return;
      }
      update({ selected: next });
    },
    check() {
      if (answer.checked || !isAnswered(question, answer.selected)) return;
      // A written answer is shown against the model answer first; the learner then marks it.
      if (checkResponse(question, answer.selected).pending) return update({ checked: true, pending: true });
      finish(answer.selected);
    },
    retry: () => update({ checked: false, pending: false, selected: [] }),
    showHint() {
      setState((s) => ({ ...s, hints: { ...s.hints, [question.id]: true } }));
      emit({ type: "hint.shown", itemId: question.id });
    },
    goTo: (index: number) => setState((s) => ({ ...s, index: Math.max(0, Math.min(index, active.length - 1)) })),
    reset() {
      setState(emptyState());
      emit({ type: "activity.reset" });
    },
  };
}

export function Mcq(props: McqProps) {
  const mcq = useMcq(props);
  const { state, question, answer } = mcq;
  const total = mcq.active.length;
  const allowRetry = props.allowRetry ?? true;
  const [announcement, setAnnouncement] = useState("");

  const check = () => {
    mcq.check();
    const result = checkResponse(question, answer.selected);
    setAnnouncement(result.pending ? "Compare your answer with the model answer, then mark it." : result.correct ? "Correct." : "Not quite.");
  };
  // Reveal the right answer once it's right, or when there are no retries.
  const reveal = answer.correct || !allowRetry;
  const finished = answer.checked && !answer.pending;

  return (
    <ActivityFrame type="mcq" title={props.title} description={props.description} label="Practice questions" theme={props.theme} className={props.className}>
      {state.round ? <p className="ix-round">Review round: the questions you missed or guessed.</p> : null}
      <ol className="ix-dots" aria-label="Questions">
        {mcq.active.map((q, i) => {
          const a = state.answers[q.id];
          const status = a?.checked ? (a.correct ? "correct" : "incorrect") : "open";
          return (
            <li key={q.id}>
              <button
                type="button"
                className={cx("ix-dot", `ix-dot--${status}`)}
                aria-current={i === state.index ? "step" : undefined}
                aria-label={`Question ${i + 1}${status === "open" ? "" : status === "correct" ? ", correct" : ", incorrect"}`}
                onClick={() => mcq.goTo(i)}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>

      <QuestionView
        key={question.id}
        question={question}
        label={`Question ${state.index + 1} of ${total}`}
        response={answer.selected}
        onResponse={mcq.respond}
        disabled={finished}
        feedback={
          answer.checked
            ? {
                correctOptionIds: reveal ? (question.correct ?? []) : [],
                rationales: rationalesOf(question),
                explanation: reveal || answer.pending ? question.explanation : undefined,
                correct: answer.correct,
                parts: answer.pending ? undefined : checkResponse(question, answer.selected).parts,
                expected: reveal ? expectedResponse(question) : undefined,
              }
            : undefined
        }
      />

      {finished ? (
        <div className={cx("ix-feedback", answer.correct ? "ix-feedback--correct" : "ix-feedback--incorrect")}>
          <strong>{answer.correct ? "Correct!" : "Not quite."}</strong>
          {!answer.correct && allowRetry ? <span> Have another look and try again.</span> : null}
          {/* When how sure they were and how it went disagree, that's worth saying. */}
          {answer.confidence === "sure" && !answer.correct ? <span className="ix-feedback__note">You were certain, so this one is worth a careful look: it'll come back in the review.</span> : null}
          {answer.confidence === "guess" && answer.correct ? <span className="ix-feedback__note">Right, though you were guessing: it'll come back in the review.</span> : null}
        </div>
      ) : null}
      {!answer.checked ? (
        <div className="ix-confidence" role="group" aria-label="How sure are you?">
          <span className="ix-small ix-muted">How sure are you?</span>
          {(
            [
              ["guess", "Guessing"],
              ["unsure", "Fairly sure"],
              ["sure", "Certain"],
            ] as const
          ).map(([value, text]) => (
            <button key={value} type="button" className={cx("ix-chip", answer.confidence === value && "ix-chip--on")} aria-pressed={answer.confidence === value} onClick={() => mcq.setConfidence(value)}>
              {text}
            </button>
          ))}
        </div>
      ) : null}
      {mcq.hintShown && question.hint ? <p className="ix-hint">{question.hint}</p> : null}

      <div className="ix-toolbar">
        <button type="button" className="ix-button" onClick={() => mcq.goTo(state.index - 1)} disabled={state.index === 0}>
          Previous
        </button>
        {question.hint && !answer.checked ? (
          <button type="button" className="ix-button ix-button--ghost" onClick={mcq.showHint} disabled={mcq.hintShown}>
            Hint
          </button>
        ) : null}
        <span className="ix-toolbar__spacer" />
        {!answer.checked ? (
          <button type="button" className="ix-button ix-button--primary" onClick={check} disabled={!mcq.canCheck}>
            Check answer
          </button>
        ) : finished && !answer.correct && allowRetry ? (
          <button type="button" className="ix-button ix-button--primary" onClick={mcq.retry}>
            Try again
          </button>
        ) : null}
        <button type="button" className="ix-button" onClick={() => mcq.goTo(state.index + 1)} disabled={state.index === total - 1}>
          Next
        </button>
      </div>

      {state.completed ? (
        <ScoreSummary score={mcq.score} label={state.round ? "Right on the first try (before the review)" : "Right on the first try"}>
          {mcq.toReview.length ? (
            <button type="button" className="ix-button ix-button--primary" onClick={mcq.review}>
              Review the {mcq.toReview.length} that need it
            </button>
          ) : null}
          <button type="button" className="ix-button" onClick={mcq.reset}>
            Practise again
          </button>
        </ScoreSummary>
      ) : null}
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}

function rationalesOf(question: Question): Record<string, string> {
  return Object.fromEntries((question.options ?? []).filter((o) => o.rationale).map((o) => [o.id, o.rationale!]));
}
