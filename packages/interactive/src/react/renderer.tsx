import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  isSession,
  normalizeSpec,
  type ActivityProgress,
  type ActivitySpecBase,
  type ActivityStatus,
  type ActivityEvent,
  type ActivityEventHandler,
  type ActivityRegistry,
  type ProgressStore,
  type SessionSpec,
  type SpecIssue,
} from "../core/index.js";
import { useInteractive, type ActivityComponents, type Theme } from "./context.js";

export interface InteractiveRendererProps {
  /** An activity or session spec from any source. It is validated before anything renders. */
  spec: unknown;
  onEvent?: ActivityEventHandler;
  /** Shown instead of the default message when the spec is invalid. */
  fallback?: (issues: SpecIssue[]) => ReactNode;
  className?: string;
  /** Fix common model mistakes (missing ids, answers as indexes…) before validating. Off by default. */
  normalize?: boolean;
  /** These override the provider's. */
  components?: ActivityComponents;
  registry?: ActivityRegistry;
  store?: ProgressStore;
  theme?: Theme;
}

const TYPE_LABELS: Record<string, string> = {
  flashcards: "Flashcards",
  mcq: "Practice",
  quiz: "Quiz",
  mindmap: "Mind map",
  matching: "Matching",
};

export const activityTypeLabel = (type: string) => TYPE_LABELS[type] ?? type;

/** Validates a spec and renders it: one activity, or a session of several. */
export function InteractiveRenderer({ spec, onEvent, fallback, className, normalize = false, ...overrides }: InteractiveRendererProps) {
  const context = useInteractive();
  const registry = overrides.registry ?? context.registry;
  const theme = overrides.theme ?? context.theme;
  const host = { components: overrides.components ?? context.components, store: overrides.store ?? context.store, onEvent };
  const result = useMemo(() => registry.validate(normalize ? normalizeSpec(spec) : spec), [registry, spec, normalize]);

  const reported = useRef<unknown>(undefined);
  useEffect(() => {
    if (result.ok || reported.current === spec) return;
    reported.current = spec;
    const raw = (typeof spec === "object" && spec ? spec : {}) as { id?: unknown; type?: unknown };
    const event: ActivityEvent = {
      type: "spec.invalid",
      issues: result.issues,
      activityId: typeof raw.id === "string" ? raw.id : "",
      activityType: typeof raw.type === "string" ? raw.type : "unknown",
      at: Date.now(),
    };
    onEvent?.(event);
    context.emit(event);
  }, [result, spec, onEvent, context]);

  const rootClass = ["ix-root", className].filter(Boolean).join(" ");
  if (!result.ok) {
    return (
      <div className={rootClass} data-ix-theme={theme}>
        {fallback ? fallback(result.issues) : <InvalidSpec issues={result.issues} />}
      </div>
    );
  }
  return (
    <div className={rootClass} data-ix-theme={theme}>
      {isSession(result.spec) ? (
        <SessionView key={result.spec.id} session={result.spec} {...host} />
      ) : (
        <ActivityHost key={result.spec.id} spec={result.spec} storeKey={result.spec.id} {...host} />
      )}
    </div>
  );
}

export function InvalidSpec({ issues }: { issues: SpecIssue[] }) {
  const shown = issues.slice(0, 8);
  return (
    <div className="ix-notice ix-notice--error" role="alert">
      <p className="ix-notice__title">This content couldn't be shown</p>
      <ul className="ix-notice__list">
        {shown.map((issue, i) => (
          <li key={i}>
            {issue.path ? <code>{issue.path}</code> : null} {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > shown.length ? <p>And {issues.length - shown.length} more problems.</p> : null}
    </div>
  );
}

interface HostProps {
  components: ActivityComponents;
  store?: ProgressStore;
  onEvent?: ActivityEventHandler;
}

interface ActivityHostProps extends HostProps {
  spec: ActivitySpecBase;
  storeKey: string;
  onStatus?: (status: ActivityStatus) => void;
}

/** Renders one activity: loads saved progress, saves changes, and contains crashes. */
function ActivityHost({ spec, storeKey, components, store, onEvent, onStatus }: ActivityHostProps) {
  const Activity = components[spec.type];
  const [loaded, setLoaded] = useState<{ progress?: ActivityProgress } | null>(store ? null : {});
  const progress = useRef<ActivityProgress>({ activityId: spec.id, activityType: spec.type, status: "not_started", attempts: 0, updatedAt: Date.now() });
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const [resets, setResets] = useState(0);

  useEffect(() => {
    if (!store) return;
    let live = true;
    Promise.resolve()
      .then(() => store.load(storeKey))
      .catch(() => undefined)
      .then((saved) => {
        if (!live) return;
        // Ignore progress saved for a different activity under the same key.
        const usable = saved && saved.activityType === spec.type ? saved : undefined;
        if (usable) {
          progress.current = usable;
          onStatusRef.current?.(usable.status);
        }
        setLoaded({ progress: usable });
      });
    return () => {
      live = false;
    };
  }, [store, storeKey, spec.type]);

  const save = useCallback(
    (patch: Partial<ActivityProgress>) => {
      const before = progress.current.status;
      progress.current = { ...progress.current, ...patch, updatedAt: Date.now() };
      if (progress.current.status !== before) onStatusRef.current?.(progress.current.status);
      if (store) void Promise.resolve(store.save(storeKey, progress.current)).catch(() => {});
    },
    [store, storeKey],
  );

  const handleEvent = useCallback(
    (event: ActivityEvent) => {
      if (event.type === "activity.completed") {
        save({ status: "completed", score: event.score, attempts: progress.current.attempts + 1 });
      } else if (event.type === "activity.reset") {
        save({ status: "in_progress", score: undefined });
      } else if (event.type !== "activity.started" && progress.current.status === "not_started") {
        save({ status: "in_progress" });
      }
      onEvent?.(event);
    },
    [save, onEvent],
  );

  const handleState = useCallback((state: unknown) => save({ state }), [save]);

  if (!Activity) {
    return (
      <div className="ix-notice ix-notice--error" role="alert">
        <p className="ix-notice__title">No component for “{spec.type}” activities</p>
        <p>Pass one to InteractiveProvider's components.</p>
      </div>
    );
  }
  if (!loaded) return <p className="ix-loading">Loading…</p>;
  return (
    <ActivityBoundary key={resets} onRetry={() => setResets((n) => n + 1)}>
      <Activity spec={spec} onEvent={handleEvent} defaultState={loaded.progress?.state} onStateChange={handleState} />
    </ActivityBoundary>
  );
}

class ActivityBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Activity crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ix-notice ix-notice--error" role="alert">
        <p className="ix-notice__title">Something went wrong showing this activity</p>
        <button type="button" className="ix-button" onClick={this.props.onRetry}>
          Try again
        </button>
      </div>
    );
  }
}

function SessionView({ session, ...host }: HostProps & { session: SessionSpec }) {
  const [current, setCurrent] = useState(0);
  // Activities stay mounted once visited, so their state survives moving around.
  const [visited, setVisited] = useState(() => new Set([0]));
  const [statuses, setStatuses] = useState<Record<string, ActivityStatus>>({});
  const count = session.activities.length;
  const done = session.activities.filter((a) => statuses[a.id] === "completed").length;

  // Show saved completion for activities that haven't been opened yet.
  const { store } = host;
  useEffect(() => {
    if (!store) return;
    let live = true;
    for (const activity of session.activities) {
      Promise.resolve()
        .then(() => store.load(`${session.id}/${activity.id}`))
        .then((saved) => {
          if (live && saved?.activityType === activity.type) setStatuses((s) => (activity.id in s ? s : { ...s, [activity.id]: saved.status }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [store, session]);

  const go = (index: number) => {
    setCurrent(index);
    setVisited((v) => (v.has(index) ? v : new Set(v).add(index)));
  };

  return (
    <section className="ix-session" aria-label={session.title}>
      <header className="ix-session__header">
        <h2 className="ix-session__title">{session.title}</h2>
        {session.description ? <p className="ix-muted">{session.description}</p> : null}
        <div className="ix-progress" role="progressbar" aria-label="Activities completed" aria-valuemin={0} aria-valuemax={count} aria-valuenow={done}>
          <div className="ix-progress__bar" style={{ width: `${(done / count) * 100}%` }} />
        </div>
        <p className="ix-muted ix-small">
          {done} of {count} activities completed
        </p>
      </header>
      <nav className="ix-session__nav" aria-label="Activities">
        <ol>
          {session.activities.map((activity, i) => (
            <li key={activity.id}>
              <button type="button" className="ix-session__step" aria-current={i === current ? "step" : undefined} onClick={() => go(i)}>
                <span className="ix-session__number" aria-hidden="true">
                  {statuses[activity.id] === "completed" ? "✓" : i + 1}
                </span>
                <span className="ix-session__step-text">
                  <span className="ix-session__step-title">{activity.title ?? activityTypeLabel(activity.type)}</span>
                  <span className="ix-muted ix-small">
                    {activityTypeLabel(activity.type)}
                    {statuses[activity.id] === "completed" ? " · done" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="ix-session__body">
        {session.activities.map((activity, i) =>
          visited.has(i) ? (
            <div key={activity.id} hidden={i !== current}>
              <ActivityHost
                spec={activity}
                storeKey={`${session.id}/${activity.id}`}
                onStatus={(status) => setStatuses((s) => (s[activity.id] === status ? s : { ...s, [activity.id]: status }))}
                {...host}
              />
            </div>
          ) : null,
        )}
        <div className="ix-session__footer">
          <button type="button" className="ix-button" disabled={current === 0} onClick={() => go(current - 1)}>
            Previous activity
          </button>
          <button type="button" className="ix-button ix-button--primary" disabled={current === count - 1} onClick={() => go(current + 1)}>
            Next activity
          </button>
        </div>
      </div>
    </section>
  );
}
