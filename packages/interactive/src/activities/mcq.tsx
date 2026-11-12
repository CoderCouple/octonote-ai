import { useState } from "react";
import { isAnswerCorrect, makeScore, type Question } from "../core/index.js";
import { useControllableState } from "../react/index.js";
import { QuestionView, toggleSelection } from "./question-view.js";
import { ActivityFrame, cx, LiveRegion, ScoreSummary, useActivity, type ActivityProps } from "./ui.js";

export interface McqAnswer {
  selected: string[];
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

  return {
    id,
    state,
    question,
    answer,
    score,
    hintShown: !!state.hints[question.id],
    toggle(optionId: string) {
      if (answer.checked) return;
      update({ selected: toggleSelection(question, answer.selected, optionId) });
    },
    check() {
      if (answer.checked || answer.selected.length === 0) return;
      const correct = isAnswerCorrect(question.correct ?? [], answer.selected);
      const attempts = answer.attempts + 1;
      const answers = { ...state.answers, [question.id]: { ...answer, checked: true, correct, attempts, firstTryCorrect: attempts === 1 && correct } };
      const allChecked = questions.every((q) => answers[q.id]?.checked || (answers[q.id]?.attempts ?? 0) > 0);
      const completed = state.completed || allChecked;
      setState({ ...state, answers, completed });
      emit({ type: "question.answered", questionId: question.id, selected: answer.selected, correct });
      if (completed && !state.completed) {
        const earned = questions.filter((q) => answers[q.id]?.firstTryCorrect).length;
        emit({ type: "activity.completed", score: makeScore(earned, questions.length) });
      }
    },
    retry: () => update({ checked: false, selected: [] }),
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
    const correct = isAnswerCorrect(question.correct ?? [], answer.selected);
    setAnnouncement(correct ? "Correct." : "Not quite.");
  };

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
        selected={answer.selected}
        onToggle={mcq.toggle}
        disabled={answer.checked}
        feedback={answer.checked ? { correctOptionIds: answer.correct ? (question.correct ?? []) : allowRetry ? [] : (question.correct ?? []), rationales: rationalesOf(question), explanation: answer.correct || !allowRetry ? question.explanation : undefined } : undefined}
      />

      {answer.checked ? (
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
          <button type="button" className="ix-button ix-button--primary" onClick={check} disabled={answer.selected.length === 0}>
            Check answer
          </button>
        ) : !answer.correct && allowRetry ? (
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
  return Object.fromEntries(question.options.filter((o) => o.rationale).map((o) => [o.id, o.rationale!]));
}
