import { useRef, useState } from "react";
import { describeActivity, respond } from "@octonote/compose";
import type { ActivityEvent } from "@octonote/interactive";
import { emptyResponse, reduceEvent, ResponseView, useCompose, type ResponseState, type Theme } from "@octonote/compose/react";
import { DEMO_FOLLOW_UP, DEMO_QUESTIONS, demoModel } from "./demoModel";

export function ComposeDemo({ theme }: { theme: Theme }) {
  const live = useCompose("/api/compose");
  const [demo, setDemo] = useState<ResponseState>(emptyResponse);
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [question, setQuestion] = useState(DEMO_QUESTIONS[0]!);
  const run = useRef(0);
  const activity = useRef<ActivityEvent[]>([]);

  async function ask(q = question) {
    setQuestion(q);
    if (mode === "live") return live.ask(q);
    const id = ++run.current;
    const previous = demo.response;
    const learnerContext = describeActivity(activity.current) || undefined;
    activity.current = [];
    setDemo((s) => (previous ? { ...s, status: "planning", dropped: [] } : { ...emptyResponse, status: "planning" }));
    for await (const event of respond({ question: q, previous, learnerContext, model: demoModel(), allowCustom: true })) {
      if (id !== run.current) return;
      setDemo((s) => reduceEvent(s, event));
    }
  }

  const state = mode === "live" ? live.state : demo;
  const busy = state.status === "planning" || state.status === "writing";

  return (
    <>
      <div className="pg-bar">
        <p className="pg-hint">Ask anything. The agent decides whether to answer in text or compose widgets, activities and animations, then checks every block before it shows.</p>
        <div className="pg-subtabs" role="tablist" aria-label="Model">
          <button type="button" role="tab" aria-selected={mode === "demo"} onClick={() => setMode("demo")}>
            Demo answers
          </button>
          <button type="button" role="tab" aria-selected={mode === "live"} onClick={() => setMode("live")}>
            Live (Claude)
          </button>
        </div>
      </div>

      <form
        className="pg-ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) void ask();
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Your question" placeholder="Ask a question…" />
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? "Answering…" : "Ask"}
        </button>
      </form>
      {mode === "demo" ? (
        <div className="pg-row-wrap pg-suggestions">
          {[...DEMO_QUESTIONS, ...(demo.response?.blocks.some((b) => b.kind === "mcq") ? [DEMO_FOLLOW_UP] : [])].map((q) => (
            <button key={q} type="button" className="pg-chip" onClick={() => void ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="pg-answer">{state.status === "idle" ? <p className="pg-empty">The answer appears here as it's written.</p> : <ResponseView
            state={state}
            theme={theme}
            showPlan
            onActivityEvent={(e) => (mode === "live" ? live.recordActivity(e) : (activity.current = [...activity.current.slice(-50), e]))}
          />}</div>
    </>
  );
}
