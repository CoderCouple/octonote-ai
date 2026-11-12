import { Fragment, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { BLANK, kindOf, placements, scrambled, type Question } from "../core/index.js";
import { cx } from "./ui.js";

export interface QuestionFeedback {
  /** Choice questions: the options to mark correct. */
  correctOptionIds: readonly string[];
  rationales?: Readonly<Record<string, string>>;
  explanation?: string;
  /** Whether the whole answer was right. */
  correct?: boolean;
  /** Which blanks, positions or items were right. */
  parts?: readonly boolean[];
  /** The right answer in response form, shown when revealing (left out on a retry). */
  expected?: readonly string[];
}

export interface QuestionViewProps {
  question: Question;
  /** e.g. "Question 2 of 5" */
  label?: string;
  /** The learner's answer so far (see `Response`). */
  response: readonly string[];
  onResponse?: (next: string[]) => void;
  disabled?: boolean;
  /** When set, marks what was right and wrong. */
  feedback?: QuestionFeedback;
}

export function toggleSelection(question: Question, selected: readonly string[], optionId: string): string[] {
  if (question.kind !== "multiple") return [optionId];
  return selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId];
}

/** One question, answered the way its kind asks: options, blanks, a number, an order, groups or a few sentences. */
export function QuestionView(props: QuestionViewProps) {
  const { question, label, feedback } = props;
  const kind = kindOf(question);
  return (
    <fieldset className={cx("ix-question", `ix-question--${kind}`)} disabled={props.disabled}>
      <legend className="ix-question__prompt">
        {label ? <span className="ix-question__label">{label}</span> : null}
        {kind === "fill_blank" ? <span className="ix-visually-hidden">Fill in the blanks</span> : question.prompt}
      </legend>
      {kind === "multiple" ? <p className="ix-small ix-muted ix-question__kind">Choose all that apply.</p> : null}
      {kind === "order" ? <p className="ix-small ix-muted ix-question__kind">Drag the items, or use the arrows, to put them in order.</p> : null}
      {kind === "categorize" ? <p className="ix-small ix-muted ix-question__kind">Put each item in its group.</p> : null}
      {kind === "fill_blank" ? <Blanks {...props} /> : null}
      {kind === "numeric" ? <NumberAnswer {...props} /> : null}
      {kind === "order" ? <OrderAnswer {...props} /> : null}
      {kind === "categorize" ? <GroupAnswer {...props} /> : null}
      {kind === "short_answer" ? <WrittenAnswer {...props} /> : null}
      {kind === "single" || kind === "multiple" || kind === "true_false" ? <Choices {...props} /> : null}
      {feedback?.explanation ? <p className="ix-explanation">{feedback.explanation}</p> : null}
    </fieldset>
  );
}

function Mark({ right }: { right: boolean }) {
  return (
    <span className={cx("ix-option__mark", right ? "ix-mark--right" : "ix-mark--wrong")} aria-label={right ? "Correct" : "Incorrect"}>
      {right ? "✓" : "✗"}
    </span>
  );
}

function Choices({ question, response, onResponse, feedback }: QuestionViewProps) {
  const name = useId();
  const multiple = question.kind === "multiple";
  const correct = new Set(feedback?.correctOptionIds ?? []);
  return (
    <div className={cx("ix-options", question.kind === "true_false" && "ix-options--pair")}>
      {(question.options ?? []).map((option) => {
        const isSelected = response.includes(option.id);
        const state = feedback ? (correct.has(option.id) ? "correct" : isSelected ? "incorrect" : "neutral") : isSelected ? "selected" : "neutral";
        const rationale = feedback?.rationales?.[option.id];
        return (
          <label key={option.id} className={cx("ix-option", `ix-option--${state}`)}>
            <input type={multiple ? "checkbox" : "radio"} name={name} value={option.id} checked={isSelected} onChange={() => onResponse?.(toggleSelection(question, response, option.id))} className="ix-option__input" />
            <span className="ix-option__body">
              <span className="ix-option__text">{option.text}</span>
              {feedback && (isSelected || correct.has(option.id)) && rationale ? <span className="ix-option__rationale">{rationale}</span> : null}
            </span>
            {state === "correct" ? <Mark right /> : state === "incorrect" ? <Mark right={false} /> : null}
          </label>
        );
      })}
    </div>
  );
}

/** The prompt with an input in place of each ___. */
function Blanks({ question, response, onResponse, feedback }: QuestionViewProps) {
  const pieces = question.prompt.split(BLANK);
  const set = (i: number, value: string) => {
    const next = Array.from({ length: pieces.length - 1 }, (_, k) => response[k] ?? "");
    next[i] = value;
    onResponse?.(next);
  };
  return (
    <p className="ix-blanks">
      {pieces.map((text, i) => (
        <Fragment key={i}>
          {text}
          {i < pieces.length - 1 ? (
            <span className="ix-blank">
              <input
                type="text"
                className={cx("ix-blank__input", feedback && (feedback.parts?.[i] ? "ix-blank__input--correct" : "ix-blank__input--incorrect"))}
                value={response[i] ?? ""}
                onChange={(e) => set(i, e.target.value)}
                aria-label={`Blank ${i + 1}${pieces.length > 2 ? ` of ${pieces.length - 1}` : ""}`}
                size={Math.max(6, Math.min(28, Math.max((response[i] ?? "").length, feedback?.expected?.[i]?.length ?? 8) + 2))}
                autoComplete="off"
                spellCheck={false}
              />
              {feedback ? <Mark right={!!feedback.parts?.[i]} /> : null}
              {feedback && !feedback.parts?.[i] && feedback.expected?.[i] ? <span className="ix-blank__answer">{feedback.expected[i]}</span> : null}
            </span>
          ) : null}
        </Fragment>
      ))}
    </p>
  );
}

function NumberAnswer({ question, response, onResponse, feedback }: QuestionViewProps) {
  const id = useId();
  return (
    <div className="ix-number">
      <label htmlFor={id} className="ix-visually-hidden">
        Your answer
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={cx("ix-number__input", feedback && (feedback.correct ? "ix-blank__input--correct" : "ix-blank__input--incorrect"))}
        value={response[0] ?? ""}
        onChange={(e) => onResponse?.([e.target.value])}
        placeholder="Your answer"
        autoComplete="off"
      />
      {question.answer?.unit ? <span className="ix-number__unit">{question.answer.unit}</span> : null}
      {feedback ? <Mark right={!!feedback.correct} /> : null}
      {feedback && !feedback.correct && feedback.expected?.[0] ? (
        <span className="ix-blank__answer">
          {feedback.expected[0]}
          {question.answer?.tolerance ? ` (± ${question.answer.tolerance})` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** Items to put in order: drag them, or move them with the arrow buttons. Starts shuffled, never already right. */
function OrderAnswer({ question, response, onResponse, feedback, disabled }: QuestionViewProps) {
  const items = question.items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const initial = useRef(scrambled(items, question.id).map((item) => item.id));
  const order = response.length === items.length ? [...response] : initial.current;
  const live = !disabled && !feedback;
  // The shuffled order is already an answer the learner might keep.
  useEffect(() => {
    if (response.length !== items.length && live) onResponse?.(initial.current);
    // Only when the question first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onResponse?.(next);
  };
  return (
    <>
      <ol className="ix-order">
        {order.map((id, i) => {
          const item = byId.get(id);
          if (!item) return null;
          const state = feedback ? (feedback.parts?.[i] ? "correct" : "incorrect") : dragging === i ? "selected" : "neutral";
          return (
            <li
              key={id}
              className={cx("ix-order__item", `ix-option--${state}`)}
              draggable={live}
              onDragStart={(e: DragEvent) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e: DragEvent) => {
                if (dragging === null) return;
                e.preventDefault();
                if (dragging !== i) {
                  move(dragging, i);
                  setDragging(i);
                }
              }}
              onDragEnd={() => setDragging(null)}
            >
              <span className="ix-order__grip" aria-hidden="true">
                ⋮⋮
              </span>
              <span className="ix-order__text">{item.text}</span>
              {live ? (
                <span className="ix-order__moves">
                  <button type="button" className="ix-icon-button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move "${item.text}" up`}>
                    ↑
                  </button>
                  <button type="button" className="ix-icon-button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label={`Move "${item.text}" down`}>
                    ↓
                  </button>
                </span>
              ) : feedback ? (
                <Mark right={!!feedback.parts?.[i]} />
              ) : null}
            </li>
          );
        })}
      </ol>
      {feedback && !feedback.correct && feedback.expected ? (
        <div className="ix-reveal">
          <p className="ix-small ix-muted">The right order:</p>
          <ol className="ix-reveal__list">
            {feedback.expected.map((id) => (
              <li key={id}>{byId.get(id)?.text}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </>
  );
}

/** Each item gets a choice of groups: works with a keyboard, a mouse or a finger. */
function GroupAnswer({ question, response, onResponse, feedback }: QuestionViewProps) {
  const items = question.items ?? [];
  const groups = question.groups ?? [];
  const placed = placements(response);
  const right = feedback?.expected ? placements(feedback.expected) : undefined;
  const place = (itemId: string, groupId: string) => {
    placed.set(itemId, groupId);
    onResponse?.(items.filter((item) => placed.has(item.id)).map((item) => `${item.id}=${placed.get(item.id)}`));
  };
  return (
    <div className="ix-groups">
      {items.map((item, i) => {
        const chosen = placed.get(item.id);
        const ok = feedback?.parts?.[i];
        return (
          <div key={item.id} role="radiogroup" aria-label={item.text} className={cx("ix-groups__row", feedback && (ok ? "ix-groups__row--correct" : "ix-groups__row--incorrect"))}>
            <span className="ix-groups__item">{item.text}</span>
            <span className="ix-groups__choices">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen === group.id}
                  className={cx("ix-chip", chosen === group.id && "ix-chip--on", feedback && !ok && right?.get(item.id) === group.id && "ix-chip--answer")}
                  onClick={() => place(item.id, group.id)}
                >
                  {group.text}
                </button>
              ))}
            </span>
            {feedback ? <Mark right={!!ok} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/** A few sentences. After checking, the model answer and rubric appear and the learner marks it. */
function WrittenAnswer({ question, response, onResponse, feedback, disabled }: QuestionViewProps) {
  const id = useId();
  const text = response[0] ?? "";
  const marked = response.find((r) => r.startsWith("self:"));
  return (
    <div className="ix-written">
      <label htmlFor={id} className="ix-visually-hidden">
        Your answer
      </label>
      <textarea id={id} className="ix-written__input" rows={3} value={text} onChange={(e) => onResponse?.([e.target.value])} placeholder="Write your answer" disabled={disabled || !!feedback} />
      {feedback ? (
        <div className="ix-reveal">
          {question.sample ? (
            <>
              <p className="ix-small ix-muted">A good answer:</p>
              <p className="ix-reveal__sample">{question.sample}</p>
            </>
          ) : null}
          {question.rubric ? (
            <>
              <p className="ix-small ix-muted">It should cover:</p>
              <p className="ix-reveal__rubric">{question.rubric}</p>
            </>
          ) : null}
          {marked ? null : (
            <div className="ix-selfmark" role="group" aria-label="Mark your answer">
              <span className="ix-small">Did your answer cover it?</span>
              <button type="button" className="ix-button ix-button--primary" onClick={() => onResponse?.([text, "self:correct"])}>
                Yes
              </button>
              <button type="button" className="ix-button" onClick={() => onResponse?.([text, "self:incorrect"])}>
                Not quite
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
