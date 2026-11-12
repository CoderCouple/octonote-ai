import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { ActivityEventHandler, ActivityEventInput, Score } from "../core/index.js";
import { useActivityEmitter, useInteractive, type Theme } from "../react/index.js";

/** Props every activity component takes besides its content. */
export interface ActivityProps<State> {
  /** Stable id, used in events and saved progress. Generated when left out. */
  id?: string;
  onEvent?: ActivityEventHandler;
  /** Called once each time the learner finishes. */
  onComplete?: (score?: Score) => void;
  /** Controlled state. Pair it with `onStateChange`. */
  state?: State;
  /** Starting state for an uncontrolled activity, e.g. restored progress. */
  defaultState?: State;
  onStateChange?: (state: State) => void;
  theme?: Theme;
  className?: string;
}

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** The activity id plus an `emit` that also calls `onComplete`. */
export function useActivity(type: string, props: Pick<ActivityProps<unknown>, "id" | "onEvent" | "onComplete">) {
  const fallbackId = useId();
  const id = props.id ?? `${type}-${fallbackId.replace(/:/g, "")}`;
  const emitEvent = useActivityEmitter(id, type, props.onEvent);
  const onComplete = useRef(props.onComplete);
  onComplete.current = props.onComplete;
  const emit = useCallback(
    (input: ActivityEventInput) => {
      emitEvent(input);
      if (input.type === "activity.completed") onComplete.current?.(input.score);
    },
    [emitEvent],
  );
  return { id, emit };
}

/** True when a key press belongs to a text field, so shortcuts should leave it alone. */
export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey;
}

interface FrameProps {
  type: string;
  title?: string;
  description?: string;
  /** Accessible name when there is no title. */
  label: string;
  theme?: Theme;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
}

export function ActivityFrame({ type, title, description, label, theme, className, onKeyDown, children }: FrameProps) {
  const context = useInteractive();
  return (
    <section
      className={cx("ix-root", "ix-activity", `ix-${type}`, className)}
      data-ix-theme={theme ?? context.theme}
      aria-label={title ?? label}
      onKeyDown={onKeyDown}
    >
      {title || description ? (
        <header className="ix-activity__header">
          {title ? <h3 className="ix-activity__title">{title}</h3> : null}
          {description ? <p className="ix-muted ix-activity__description">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Announces changes to screen readers without moving focus. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="ix-visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

export function ScoreSummary({ score, label, children }: { score: Score; label: string; children?: ReactNode }) {
  return (
    <div className={cx("ix-summary", score.passed === false && "ix-summary--failed", score.passed && "ix-summary--passed")} role="status">
      <p className="ix-summary__percent">{score.percent}%</p>
      <div className="ix-summary__text">
        <p className="ix-summary__label">{label}</p>
        <p className="ix-muted">
          {score.earned} of {score.possible}
          {score.passed === undefined ? null : score.passed ? " · Passed" : " · Not passed yet"}
        </p>
      </div>
      {children ? <div className="ix-summary__actions">{children}</div> : null}
    </div>
  );
}
