import { Component, useCallback, useRef, useState, type ReactNode } from "react";
import { defaultComponents, InteractiveProvider, InteractiveRenderer, type ActivityEvent, type ActivityEventHandler, type ProgressStore, type QuizGrader } from "@octonote/interactive";
import { ScenePlayer } from "@octonote/motion";
import { Blocks, Widget, WidgetsProvider } from "@octonote/widgets";
import type { ComposeEvent } from "./agent.js";
import type { Issue, RenderBlock } from "./catalog.js";
import { markdownToBlocks } from "./markdown.js";
import { CustomExperience } from "./custom-view.js";
import { describeActivity } from "./edit.js";
import type { ComposedResponse, Plan } from "./response.js";
import { readEventStream } from "./sse.js";

export type Theme = "light" | "dark" | "system";

const KIND_LABELS: Record<string, string> = {
  widget: "an interactive widget",
  flashcards: "flashcards",
  mcq: "practice questions",
  quiz: "a quiz",
  mindmap: "a mind map",
  matching: "a matching exercise",
  scene: "an animation",
  steps: "steps",
  comparison: "a comparison",
  definition: "a definition",
  timeline: "a timeline",
  callout: "a note",
  takeaway: "key takeaways",
  code: "code",
  text: "the explanation",
  custom: "a custom experience",
};

export interface ResponseState {
  status: "idle" | "planning" | "writing" | "done" | "error";
  plan?: Plan;
  title?: string;
  /** Finished blocks by position; gaps are blocks still coming or dropped. */
  blocks: (RenderBlock | undefined)[];
  pending?: { index: number; kind?: string; markdown?: string };
  dropped: { index: number; kind?: string; issues: Issue[] }[];
  error?: string;
  /** The finished answer, kept so a follow-up can edit it. */
  response?: ComposedResponse;
  /** Bumped when a block is replaced, so its component starts fresh instead of keeping old answers. */
  revisions?: Record<string, number>;
}

export const emptyResponse: ResponseState = { status: "idle", blocks: [], dropped: [] };

/** Folds one compose event into the response state. */
export function reduceEvent(state: ResponseState, event: ComposeEvent): ResponseState {
  switch (event.type) {
    case "plan":
      // A new plan means a new answer: clear what was on screen.
      return { ...state, status: "writing", plan: event.plan, title: event.plan.title, blocks: [], response: undefined, revisions: {} };
    case "title":
      return { ...state, title: event.title };
    case "pending":
      return { ...state, pending: { index: event.index, kind: event.kind, markdown: event.markdown } };
    case "block": {
      const blocks = [...state.blocks];
      blocks[event.index] = event.block;
      return { ...state, blocks, pending: state.pending?.index === event.index ? undefined : state.pending };
    }
    case "dropped":
      return { ...state, dropped: [...state.dropped, { index: event.index, kind: event.kind, issues: event.issues }], pending: state.pending?.index === event.index ? undefined : state.pending };
    case "replace":
      return {
        ...state,
        blocks: state.blocks.map((b) => (b?.id === event.id ? event.block : b)),
        revisions: { ...state.revisions, [event.id]: (state.revisions?.[event.id] ?? 0) + 1 },
      };
    case "insert": {
      const blocks = state.blocks.filter((b): b is RenderBlock => !!b);
      const at = event.after ? blocks.findIndex((b) => b.id === event.after) + 1 : 0;
      blocks.splice(at, 0, event.block);
      return { ...state, blocks };
    }
    case "remove":
      return { ...state, blocks: state.blocks.filter((b) => b && b.id !== event.id) };
    case "done":
      // Edits keep the blocks on screen; a new answer replaces them.
      return { ...state, status: "done", pending: undefined, title: event.response.title ?? state.title, blocks: event.response.blocks, response: event.response, plan: event.plan.strategy === "edit" ? state.plan : event.plan };
    case "error":
      return { ...state, status: "error", pending: undefined, error: event.message };
  }
}

/**
 * Asks a compose endpoint (POST { question, history? } → server-sent events)
 * and keeps the response state as blocks arrive.
 */
export function useCompose(endpoint: string) {
  const [state, setState] = useState<ResponseState>(emptyResponse);
  const controller = useRef<AbortController | null>(null);
  const activity = useRef<ActivityEvent[]>([]);
  const current = useRef(state);
  current.current = state;

  /** Pass to ResponseView's onActivityEvent: what the learner does becomes context for the next turn. */
  const recordActivity = useCallback((event: ActivityEvent) => {
    activity.current = [...activity.current.slice(-50), event];
  }, []);

  const ask = useCallback(
    async (question: string, history?: { role: "user" | "assistant"; content: string }[]) => {
      controller.current?.abort();
      const abort = (controller.current = new AbortController());
      const previous = current.current.response;
      const learnerContext = describeActivity(activity.current) || undefined;
      activity.current = [];
      // A follow-up keeps the current answer on screen while it's being changed.
      setState((s) => (previous ? { ...s, status: "planning", error: undefined, dropped: [] } : { ...emptyResponse, status: "planning" }));
      try {
        const body = {
          question,
          history,
          learnerContext,
          previous: previous && { title: previous.title, blocks: previous.blocks.map((b) => ({ id: b.id, ...b.source })) },
        };
        const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${response.status})`);
        }
        for await (const event of readEventStream(response.body)) setState((s) => reduceEvent(s, event));
      } catch (error) {
        if (!abort.signal.aborted) setState((s) => ({ ...s, status: "error", error: (error as Error).message }));
      }
    },
    [endpoint],
  );

  const replay = useCallback(async (events: ComposeEvent[], delayMs = 250) => {
    controller.current?.abort();
    const abort = (controller.current = new AbortController());
    setState({ ...emptyResponse, status: "planning" });
    for (const event of events) {
      await new Promise((resolve) => setTimeout(resolve, event.type === "pending" ? delayMs / 3 : delayMs));
      if (abort.signal.aborted) return;
      setState((s) => reduceEvent(s, event));
    }
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    activity.current = [];
    setState(emptyResponse);
  }, []);

  return { state, ask, replay, reset, recordActivity, cancel: () => controller.current?.abort() };
}

export interface ResponseViewProps {
  state: ResponseState;
  theme?: Theme;
  /** Events from interactive activities (answers, flips…), e.g. to send learner actions back to the agent. */
  onActivityEvent?: ActivityEventHandler;
  store?: ProgressStore;
  grader?: QuizGrader;
  /** Show the plan's reasoning above the response. */
  showPlan?: boolean;
}

/** Renders a composed response from any mix of libraries, as it streams. */
export function ResponseView({ state, theme = "system", onActivityEvent, store, grader, showPlan }: ResponseViewProps) {
  const indexes = Math.max(state.blocks.length, (state.pending?.index ?? -1) + 1);
  return (
    <InteractiveProvider components={defaultComponents} theme={theme} onEvent={onActivityEvent} store={store} grader={grader}>
      <WidgetsProvider theme={theme} className="cx-response">
        {showPlan && state.plan ? <PlanSummary plan={state.plan} /> : null}
        {state.status === "planning" ? <Placeholder label="Thinking about the best way to explain this…" /> : null}
        {state.title ? <h2 className="cx-title">{state.title}</h2> : null}
        {Array.from({ length: indexes }, (_, i) => {
          const block = state.blocks[i];
          if (block) {
            return (
              <BlockBoundary key={`${block.id}:${state.revisions?.[block.id] ?? 0}`}>
                <BlockView block={block} theme={theme} />
              </BlockBoundary>
            );
          }
          if (state.pending?.index === i) {
            return state.pending.kind === "text" && state.pending.markdown ? (
              <div key={`pending-${i}`} className="cx-streaming">
                <Blocks blocks={markdownToBlocks(state.pending.markdown)} />
              </div>
            ) : (
              <Placeholder key={`pending-${i}`} label={`Building ${KIND_LABELS[state.pending.kind ?? ""] ?? "the next part"}…`} />
            );
          }
          return null;
        })}
        {state.status === "error" ? (
          <div className="wg-notice" role="alert">
            <p className="wg-notice__title">The answer couldn't be finished</p>
            <p>{state.error}</p>
          </div>
        ) : null}
      </WidgetsProvider>
    </InteractiveProvider>
  );
}

export function BlockView({ block, theme }: { block: RenderBlock; theme?: Theme }) {
  switch (block.renderer) {
    case "content":
      return <Blocks blocks={block.blocks} />;
    case "widget":
      return <Widget spec={block.widget} persistKey={block.id} />;
    case "interactive":
      return <InteractiveRenderer spec={block.spec} />;
    case "motion":
      return <ScenePlayer spec={block.scene} theme={theme} />;
    case "custom":
      return <CustomExperience block={block.custom} theme={theme === "dark" ? "dark" : "light"} />;
  }
}

function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <details className="cx-plan">
      <summary>
        <span className="cx-plan__strategy">{plan.strategy === "text" ? "Text answer" : plan.strategy === "custom" ? "Custom experience needed" : "Composed answer"}</span>
        <span className="cx-plan__kinds">{plan.blocks.map((b) => b.kind).join(" · ")}</span>
      </summary>
      <p>{plan.reason}</p>
      <ol>
        {plan.blocks.map((b, i) => (
          <li key={i}>
            <strong>{b.kind}</strong>: {b.purpose}
          </li>
        ))}
      </ol>
      {plan.customIdea ? <p className="cx-plan__custom">Custom idea: {plan.customIdea}</p> : null}
    </details>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="cx-placeholder" role="status">
      <span className="cx-placeholder__shimmer" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

class BlockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Response block crashed", error);
  }

  render() {
    return this.state.failed ? (
      <div className="wg-notice" role="alert">
        <p className="wg-notice__title">This part couldn't be shown</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
