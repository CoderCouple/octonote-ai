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
}

export interface McqState {
  index: number;
  answers: Record<string, McqAnswer>;
  hints: Record<string, true>;
  completed: boolean;
}

export interface McqProps extends ActivityProps<McqState> {
  questions: readonly Question[];
  title?: string;
  description?: string;
  /** Let the learner try again after a wrong answer. Defaults to true. */
  allowRetry?: boolean;
}

const emptyState = (): McqState => ({ index: 0, answers: {}, hints: {}, completed: false });

const usable = (state: McqState | undefined, questions: readonly Question[]): state is McqState =>
  !!state && typeof state.answers === "object" && state.index >= 0 && state.index < questions.length;

/** Headless logic for practice questions that are checked one at a time. */
export function useMcq(props: McqProps) {
  const { questions } = props;
  const { id, emit } = useActivity("mcq", props);
  const [state, setState] = useControllableState<McqState>(
    usable(props.state, questions) ? props.state : undefined,
    () => (usable(props.defaultState, questions) ? props.defaultState : emptyState()),
    props.onStateChange,
  );
  const question = questions[state.index]!;
  const answer: McqAnswer = state.answers[question.id] ?? { selected: [], checked: false, correct: false, attempts: 0, firstTryCorrect: false };
  const firstTry = questions.filter((q) => state.answers[q.id]?.firstTryCorrect).length;
  const score = makeScore(firstTry, questions.length);

  const update = (patch: Partial<McqAnswer>) => setState((s) => ({ ...s, answers: { ...s.answers, [question.id]: { ...answer, ...patch } } }));

  /** Marks the answer and records the attempt. */
  const finish = (response: string[]) => {
    const { correct } = checkResponse(question, response);
    const attempts = answer.attempts + 1;
    const answers = { ...state.answers, [question.id]: { ...answer, selected: response, checked: true, pending: false, correct, attempts, firstTryCorrect: attempts === 1 && correct } };
    const allChecked = questions.every((q) => (answers[q.id]?.checked && !answers[q.id]?.pending) || (answers[q.id]?.attempts ?? 0) > 0);
    const completed = state.completed || allChecked;
    setState({ ...state, answers, completed });
    emit({ type: "question.answered", questionId: question.id, selected: response, correct });
    if (completed && !state.completed) {
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
    canCheck: !answer.checked && isAnswered(question, answer.selected),
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
    goTo: (index: number) => setState((s) => ({ ...s, index: Math.max(0, Math.min(index, questions.length - 1)) })),
    reset() {
      setState(emptyState());
      emit({ type: "activity.reset" });
    },
  };
}

export function Mcq(props: McqProps) {
  const mcq = useMcq(props);
  const { state, question, answer } = mcq;
  const total = props.questions.length;
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
      <ol className="ix-dots" aria-label="Questions">
        {props.questions.map((q, i) => {
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
        <ScoreSummary score={mcq.score} label="Right on the first try">
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
