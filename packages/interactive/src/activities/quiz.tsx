import { useEffect, useRef, useState } from "react";
import { gradeQuestions, isAnswered, isChoice, shuffle, type GradeResult, type Question, type Responses } from "../core/index.js";
import { useControllableState, useInteractive, type QuizGrader } from "../react/index.js";
import { QuestionView } from "./question-view.js";
import { ActivityFrame, cx, LiveRegion, ScoreSummary, useActivity, type ActivityProps } from "./ui.js";

export interface QuizState {
  phase: "intro" | "answering" | "review";
  /** Question ids in the order asked. */
  order: string[];
  index: number;
  responses: Record<string, string[]>;
  /** When answering began, in epoch milliseconds; the timer counts from here. */
  startedAt?: number;
  result?: GradeResult;
  attempts: number;
}

export interface QuizProps extends ActivityProps<QuizState> {
  questions: readonly Question[];
  title?: string;
  description?: string;
  /** "server" sends responses to `grader` (or the provider's) instead of grading here. */
  grading?: "client" | "server";
  timeLimitSeconds?: number;
  passingPercent?: number;
  shuffleQuestions?: boolean;
  grader?: QuizGrader;
}

const orderOf = (props: QuizProps) => {
  const ids = props.questions.map((q) => q.id);
  return props.shuffleQuestions ? shuffle(ids) : ids;
};

const usable = (state: QuizState | undefined, questions: readonly Question[]): state is QuizState => {
  if (!state || !Array.isArray(state.order)) return false;
  const ids = new Set(questions.map((q) => q.id));
  return state.order.length === ids.size && state.order.every((id) => ids.has(id));
};

/** Headless quiz logic: answering, timing, submitting and review. */
export function useQuiz(props: QuizProps) {
  const { questions } = props;
  const { id, emit } = useActivity("quiz", props);
  const context = useInteractive();
  const [state, setState] = useControllableState<QuizState>(
    usable(props.state, questions) ? props.state : undefined,
    () => (usable(props.defaultState, questions) ? props.defaultState : { phase: "intro", order: orderOf(props), index: 0, responses: {}, attempts: 0 }),
    props.onStateChange,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const question = byId.get(state.order[state.index]!)!;
  const unanswered = state.order.filter((qid) => !isAnswered(byId.get(qid)!, state.responses[qid] ?? [])).length;

  // Latest values for the timer, which outlives renders.
  const latest = useRef({ state, submitting });
  latest.current = { state, submitting };

  async function submit() {
    const { state, submitting } = latest.current;
    if (state.phase !== "answering" || submitting) return;
    setSubmitting(true);
    setError(null);
    const responses: Responses = state.responses;
    emit({ type: "quiz.submitted", responses: state.responses });
    try {
      let result: GradeResult;
      if (props.grading === "server") {
        const grader = props.grader ?? context.grader;
        if (!grader) throw new Error("This quiz is graded on a server, but no grader is set up.");
        result = await grader({ activityId: id, responses });
      } else {
        result = gradeQuestions(questions, responses, props.passingPercent);
      }
      setState((s) => ({ ...s, phase: "review", result, attempts: s.attempts + 1 }));
      emit({ type: "activity.completed", score: result.score });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = useRemainingSeconds(state.phase === "answering" ? state.startedAt : undefined, props.timeLimitSeconds, () => void submit());

  return {
    id,
    state,
    question,
    unanswered,
    submitting,
    error,
    remaining,
    start: () => setState((s) => ({ ...s, phase: "answering", index: 0, startedAt: Date.now() })),
    respond(next: string[]) {
      if (state.phase !== "answering") return;
      setState((s) => ({ ...s, responses: { ...s.responses, [question.id]: next } }));
      // Typed answers change with every key; only choices are worth an event each time.
      if (isChoice(question)) emit({ type: "question.answered", questionId: question.id, selected: next });
    },
    /** After a client-graded quiz: the learner marks a written answer, and the score is worked out again. */
    mark(questionId: string, response: string[]) {
      if (state.phase !== "review" || props.grading === "server") return;
      const responses = { ...state.responses, [questionId]: response };
      setState((s) => ({ ...s, responses, result: gradeQuestions(questions, responses, props.passingPercent) }));
    },
    goTo: (index: number) => setState((s) => ({ ...s, index: Math.max(0, Math.min(index, s.order.length - 1)) })),
    submit,
    retake() {
      setState((s) => ({ phase: "answering", order: orderOf(props), index: 0, responses: {}, startedAt: Date.now(), attempts: s.attempts }));
      emit({ type: "activity.reset" });
    },
  };
}

/** Seconds left, ticking each second; calls `onExpire` once at zero. */
function useRemainingSeconds(startedAt: number | undefined, limit: number | undefined, onExpire: () => void) {
  const compute = () => (startedAt === undefined || !limit ? undefined : Math.max(0, Math.ceil(limit - (Date.now() - startedAt) / 1000)));
  const [remaining, setRemaining] = useState(compute);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    setRemaining(compute());
    if (startedAt === undefined || !limit) return;
    let fired = false;
    const tick = () => {
      const left = compute();
      setRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        expire.current();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, limit]); // compute only reads these two
  return remaining;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function Quiz(props: QuizProps) {
  const quiz = useQuiz(props);
  const { state, question } = quiz;
  const total = state.order.length;
  const [confirming, setConfirming] = useState(false);
  const byId = new Map(props.questions.map((q) => [q.id, q]));

  const frame = { type: "quiz", title: props.title, description: props.description, label: "Quiz", theme: props.theme, className: props.className };

  if (state.phase === "intro") {
    return (
      <ActivityFrame {...frame}>
        <div className="ix-intro">
          <ul className="ix-facts">
            <li>
              <strong>{total}</strong> {total === 1 ? "question" : "questions"}
            </li>
            {props.timeLimitSeconds ? (
              <li>
                <strong>{formatTime(props.timeLimitSeconds)}</strong> time limit
              </li>
            ) : null}
            {props.passingPercent !== undefined ? (
              <li>
                <strong>{props.passingPercent}%</strong> to pass
              </li>
            ) : null}
          </ul>
          <p className="ix-muted">Answer every question, then submit to see your score and the answers.</p>
          <button type="button" className="ix-button ix-button--primary" onClick={quiz.start}>
            Start quiz
          </button>
        </div>
      </ActivityFrame>
    );
  }

  if (state.phase === "review" && state.result) {
    const results = new Map(state.result.results.map((r) => [r.questionId, r]));
    return (
      <ActivityFrame {...frame}>
        <ScoreSummary score={state.result.score} label="Your score">
          <button type="button" className="ix-button" onClick={quiz.retake}>
            Retake quiz
          </button>
        </ScoreSummary>
        <h4 className="ix-section-title">Review your answers</h4>
        <div className="ix-review">
          {state.order.map((qid, i) => {
            const r = results.get(qid);
            return (
              <div key={qid} className={cx("ix-review__item", r?.pending ? "ix-review__item--pending" : r?.correct ? "ix-review__item--correct" : "ix-review__item--incorrect")}>
                <QuestionView
                  question={byId.get(qid)!}
                  label={`Question ${i + 1} · ${r?.pending ? "Mark your answer" : r?.correct ? "Correct" : "Incorrect"}`}
                  response={state.responses[qid] ?? []}
                  onResponse={r?.pending ? (next) => quiz.mark(qid, next) : undefined}
                  disabled={!r?.pending}
                  feedback={r ? { correctOptionIds: r.correctOptionIds, rationales: r.rationales, explanation: r.explanation, correct: r.correct, parts: r.parts, expected: r.expected } : undefined}
                />
              </div>
            );
          })}
        </div>
      </ActivityFrame>
    );
  }

  const lowTime = quiz.remaining !== undefined && quiz.remaining <= 30;
  return (
    <ActivityFrame {...frame}>
      <div className="ix-quiz__bar">
        <ol className="ix-dots" aria-label="Questions">
          {state.order.map((qid, i) => {
            const answered = isAnswered(byId.get(qid)!, state.responses[qid] ?? []);
            return (
              <li key={qid}>
                <button
                  type="button"
                  className={cx("ix-dot", answered && "ix-dot--answered")}
                  aria-current={i === state.index ? "step" : undefined}
                  aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
                  onClick={() => quiz.goTo(i)}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
        {quiz.remaining !== undefined ? (
          <span className={cx("ix-timer", lowTime && "ix-timer--low")} role="timer" aria-label={`${Math.ceil(quiz.remaining / 60)} minutes left`}>
            {formatTime(quiz.remaining)}
          </span>
        ) : null}
      </div>
      {lowTime ? <LiveRegion message={quiz.remaining === 30 ? "30 seconds left" : ""} /> : null}

      <QuestionView key={question.id} question={question} label={`Question ${state.index + 1} of ${total}`} response={state.responses[question.id] ?? []} onResponse={quiz.respond} disabled={quiz.submitting} />
      {question.hint ? (
        <details className="ix-hint-toggle">
          <summary>Hint</summary>
          <p className="ix-hint">{question.hint}</p>
        </details>
      ) : null}

      {quiz.error ? (
        <div className="ix-notice ix-notice--error" role="alert">
          <p className="ix-notice__title">Your answers weren't graded</p>
          <p>{quiz.error}</p>
        </div>
      ) : null}

      {confirming ? (
        <div className="ix-confirm" role="alertdialog" aria-label="Submit with unanswered questions?">
          <p>
            {quiz.unanswered} {quiz.unanswered === 1 ? "question is" : "questions are"} unanswered. Submit anyway?
          </p>
          <div className="ix-toolbar">
            <button type="button" className="ix-button" onClick={() => setConfirming(false)}>
              Keep answering
            </button>
            <button
              type="button"
              className="ix-button ix-button--primary"
              onClick={() => {
                setConfirming(false);
                void quiz.submit();
              }}
            >
              Submit anyway
            </button>
          </div>
        </div>
      ) : (
        <div className="ix-toolbar">
          <button type="button" className="ix-button" onClick={() => quiz.goTo(state.index - 1)} disabled={state.index === 0}>
            Previous
          </button>
          <span className="ix-toolbar__spacer" />
          {state.index < total - 1 ? (
            <button type="button" className="ix-button" onClick={() => quiz.goTo(state.index + 1)}>
              Next
            </button>
          ) : null}
          <button
            type="button"
            className="ix-button ix-button--primary"
            disabled={quiz.submitting}
            onClick={() => (quiz.unanswered > 0 ? setConfirming(true) : void quiz.submit())}
          >
            {quiz.submitting ? "Grading…" : quiz.error ? "Try submitting again" : "Submit"}
          </button>
        </div>
      )}
    </ActivityFrame>
  );
}
