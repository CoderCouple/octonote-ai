import { useId } from "react";
import type { Question } from "../core/index.js";
import { cx } from "./ui.js";

export interface QuestionFeedback {
  correctOptionIds: readonly string[];
  rationales?: Readonly<Record<string, string>>;
  explanation?: string;
}

interface QuestionViewProps {
  question: Question;
  /** e.g. "Question 2 of 5" */
  label?: string;
  selected: readonly string[];
  onToggle?: (optionId: string) => void;
  disabled?: boolean;
  /** When set, marks the correct options and the learner's wrong ones. */
  feedback?: QuestionFeedback;
}

export function toggleSelection(question: Question, selected: readonly string[], optionId: string): string[] {
  if (question.kind !== "multiple") return [optionId];
  return selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId];
}

/** One question as a native radio or checkbox group. */
export function QuestionView({ question, label, selected, onToggle, disabled, feedback }: QuestionViewProps) {
  const name = useId();
  const multiple = question.kind === "multiple";
  const correct = new Set(feedback?.correctOptionIds ?? []);
  return (
    <fieldset className="ix-question" disabled={disabled}>
      <legend className="ix-question__prompt">
        {label ? <span className="ix-question__label">{label}</span> : null}
        {question.prompt}
      </legend>
      {multiple ? <p className="ix-small ix-muted ix-question__kind">Choose all that apply.</p> : null}
      <div className={cx("ix-options", question.kind === "true_false" && "ix-options--pair")}>
        {question.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const state = feedback ? (correct.has(option.id) ? "correct" : isSelected ? "incorrect" : "neutral") : isSelected ? "selected" : "neutral";
          const rationale = feedback?.rationales?.[option.id];
          return (
            <label key={option.id} className={cx("ix-option", `ix-option--${state}`)}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={option.id}
                checked={isSelected}
                onChange={() => onToggle?.(option.id)}
                className="ix-option__input"
              />
              <span className="ix-option__body">
                <span className="ix-option__text">{option.text}</span>
                {feedback && (isSelected || correct.has(option.id)) && rationale ? <span className="ix-option__rationale">{rationale}</span> : null}
              </span>
              {state === "correct" ? (
                <span className="ix-option__mark" aria-label="Correct answer">
                  ✓
                </span>
              ) : state === "incorrect" ? (
                <span className="ix-option__mark" aria-label="Your answer, incorrect">
                  ✗
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {feedback?.explanation ? <p className="ix-explanation">{feedback.explanation}</p> : null}
    </fieldset>
  );
}
