import { useMemo, useState } from "react";
import digestive from "@octonote/interactive/examples/digestive-system.json";
import waterCycle from "@octonote/interactive/examples/water-cycle-practice.json";
import {
  defaultRegistry,
  gradeQuiz,
  isSession,
  parseSpec,
  redactQuiz,
  sessionToolDefinition,
  webStorageStore,
  type ActivityEvent,
  type ActivitySpec,
  type QuizSpec,
  type SpecIssue,
  defaultComponents,
  InteractiveProvider,
  InteractiveRenderer,
  type QuizGrader,
  type Theme,
} from "@octonote/interactive";

type Source = "example" | "kinds" | "generate" | "paste";

const STORE_PREFIX = "components-playground:";
const store = webStorageStore(globalThis.localStorage, STORE_PREFIX);

function clearProgress() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was saved anyway.
  }
}

/**
 * Pretend server for the "graded on a server" demo: it keeps the full quizzes,
 * and the page only ever gets the redacted copies.
 */
function withServerGrading(spec: ActivitySpec): { spec: ActivitySpec; grader: QuizGrader } {
  const answerKeys = new Map<string, QuizSpec>();
  const redact = (activity: ActivitySpec) => {
    if (activity.type !== "quiz" || (activity as QuizSpec).grading === "server") return activity;
    answerKeys.set(activity.id, activity as QuizSpec);
    return redactQuiz(activity as QuizSpec);
  };
  const safe = isSession(spec) ? { ...spec, activities: spec.activities.map(redact) } : redact(spec);
  const grader: QuizGrader = async ({ activityId, responses }) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const full = answerKeys.get(activityId);
    if (!full) throw new Error("The server has no answer key for this quiz.");
    return gradeQuiz(full, responses);
  };
  return { spec: safe, grader };
}

export function InteractiveDemo({ theme }: { theme: Theme }) {
  const [source, setSource] = useState<Source>("example");
  const [serverGrading, setServerGrading] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [run, setRun] = useState(0);

  const [prompt, setPrompt] = useState("Create a study session about the human digestive system.");
  const [generated, setGenerated] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<{ message: string; issues?: SpecIssue[] } | null>(null);

  const [pasted, setPasted] = useState(() => JSON.stringify(digestive.activities[2], null, 2));
  const pastedResult = useMemo(() => parseSpec(pasted), [pasted]);

  const raw: unknown = source === "example" ? digestive : source === "kinds" ? waterCycle : source === "generate" ? generated : pastedResult.ok ? pastedResult.spec : null;

  // Only valid specs get the server-grading treatment; invalid ones go straight to the renderer's fallback.
  const shown = useMemo(() => {
    if (!raw || !serverGrading) return { spec: raw, grader: undefined };
    const result = defaultRegistry.validate(raw);
    return result.ok ? withServerGrading(result.spec) : { spec: raw, grader: undefined };
  }, [raw, serverGrading]);

  async function generate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = await response.json();
      if (!response.ok || body.error) setGenerateError({ message: body.error ?? `Request failed (${response.status})`, issues: body.issues });
      else {
        setGenerated(body.spec);
        setRun((n) => n + 1);
      }
    } catch (error) {
      setGenerateError({ message: (error as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="pg-bar">
        <p className="pg-hint">Flashcards, practice questions, quizzes, mind maps and matching, rendered from validated JSON.</p>
        <div className="pg-controls">
          <label>
            <input type="checkbox" checked={serverGrading} onChange={(e) => setServerGrading(e.target.checked)} /> Grade quizzes on a server
          </label>
          <button
            type="button"
            onClick={() => {
              clearProgress();
              setEvents([]);
              setRun((n) => n + 1);
            }}
          >
            Reset progress
          </button>
        </div>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Where the content comes from">
        {(
          [
            ["example", "Example session"],
            ["kinds", "Question types"],
            ["generate", "Generate with Claude"],
            ["paste", "Paste JSON"],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)}>
            {label}
          </button>
        ))}
      </div>

      {source === "generate" ? (
        <div className="pg-panel">
          <label htmlFor="pg-prompt">What should the session teach?</label>
          <div className="pg-row">
            <input id="pg-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !generating && generate()} />
            <button type="button" onClick={generate} disabled={generating || !prompt.trim()}>
              {generating ? "Generating… (about a minute)" : "Generate"}
            </button>
          </div>
          {generateError ? (
            <div className="pg-error" role="alert">
              <p>{generateError.message}</p>
              {generateError.issues?.length ? (
                <ul>
                  {generateError.issues.slice(0, 6).map((issue, i) => (
                    <li key={i}>
                      <code>{issue.path}</code> {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <details>
            <summary>The tool definition sent to the model</summary>
            <pre>{JSON.stringify(sessionToolDefinition(), null, 2)}</pre>
          </details>
        </div>
      ) : null}

      {source === "paste" ? (
        <div className="pg-panel">
          <label htmlFor="pg-json">An activity or session spec. Try breaking it to see the safe fallback.</label>
          <textarea id="pg-json" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} rows={12} />
        </div>
      ) : null}

      <main className="pg-main">
        <div className="pg-stage">
          {shown.spec || source === "paste" ? (
            <InteractiveProvider components={defaultComponents} store={store} theme={theme} grader={shown.grader} onEvent={(e) => setEvents((list) => [e, ...list].slice(0, 60))}>
              <InteractiveRenderer key={`${source}-${run}-${serverGrading}`} spec={shown.spec ?? pasted} />
            </InteractiveProvider>
          ) : (
            <p className="pg-empty">Generate a session to see it here.</p>
          )}
        </div>
        <aside className="pg-events" aria-label="Events">
          <h2>Events</h2>
          {events.length === 0 ? <p className="pg-empty">Events from the activities show up here.</p> : null}
          <ol>
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <code>{e.type}</code> <span>{e.activityId}</span>
                {"score" in e && e.score ? <span> · {e.score.percent}%</span> : null}
                {"correct" in e && e.correct !== undefined ? <span> · {e.correct ? "right" : "wrong"}</span> : null}
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </>
  );
}
