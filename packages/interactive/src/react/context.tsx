import { createContext, useContext, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import {
  defaultRegistry,
  type ActivitySpecBase,
  type GradeResult,
  type ActivityEventHandler,
  type ActivityRegistry,
  type ProgressStore,
  type Responses,
} from "../core/index.js";

export type Theme = "light" | "dark" | "system";

/** Grades a server-graded quiz, e.g. by posting the responses to your API. */
export type QuizGrader = (request: { activityId: string; responses: Responses }) => Promise<GradeResult>;

/** What the renderer passes to an activity component. */
export interface ActivityRenderProps<S extends ActivitySpecBase = ActivitySpecBase, State = any> {
  spec: S;
  onEvent: ActivityEventHandler;
  /** Saved state to resume from. */
  defaultState?: State;
  onStateChange?: (state: State) => void;
}

export type ActivityComponent<S extends ActivitySpecBase = any> = ComponentType<ActivityRenderProps<S>>;

/** Activity components by spec `type`. */
export type ActivityComponents = Record<string, ActivityComponent>;

export interface InteractiveContextValue {
  registry: ActivityRegistry;
  components: ActivityComponents;
  store?: ProgressStore;
  grader?: QuizGrader;
  theme: Theme;
  emit: ActivityEventHandler;
}

const noop = () => {};
const InteractiveContext = createContext<InteractiveContextValue>({ registry: defaultRegistry, components: {}, theme: "system", emit: noop });

export interface InteractiveProviderProps {
  components?: ActivityComponents;
  registry?: ActivityRegistry;
  /** Saves and restores progress. Leave out to keep progress in memory only. */
  store?: ProgressStore;
  grader?: QuizGrader;
  theme?: Theme;
  /** Receives every event from every activity inside. */
  onEvent?: ActivityEventHandler;
  children: ReactNode;
}

export function InteractiveProvider({ components = {}, registry = defaultRegistry, store, grader, theme = "system", onEvent, children }: InteractiveProviderProps) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const value = useMemo<InteractiveContextValue>(
    () => ({ registry, components, store, grader, theme, emit: (event) => onEventRef.current?.(event) }),
    [registry, components, store, grader, theme],
  );
  return <InteractiveContext.Provider value={value}>{children}</InteractiveContext.Provider>;
}

/** The nearest provider's settings, or defaults when there is none. */
export function useInteractive(): InteractiveContextValue {
  return useContext(InteractiveContext);
}
