import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@octonote/interactive";
import { compose, defaultCatalog, describeActivity, describeResponse, editResponse, respond, restoreResponse, type ComposeEvent, type ComposedResponse, type ModelClient } from "../src/index.js";
import { emptyResponse, reduceEvent } from "../src/react-entry.js";

const text = { kind: "text", markdown: "Compound interest grows on itself." };
const mcq = defaultCatalog.get("mcq")!.example;
const harder = { kind: "mcq", questions: [{ id: "q1", prompt: "Doubling time at 6%?", options: [{ id: "a", text: "12 years" }, { id: "b", text: "6 years" }], correct: ["a"] }] };

/** A scripted model that records what it was asked. */
function model(script: Record<string, unknown[]>): ModelClient & { seen: { tool: string; content: string }[] } {
  const seen: { tool: string; content: string }[] = [];
  return {
    seen,
    async callTool({ tool, messages }) {
      seen.push({ tool: tool.name, content: messages[messages.length - 1]!.content });
      const next = script[tool.name]?.shift();
      if (next === undefined) throw new Error(`No scripted answer for ${tool.name}`);
      return next;
    },
  };
}

async function start(): Promise<ComposedResponse> {
  const m = model({ plan_response: [{ strategy: "compose", reason: "r", blocks: [{ kind: "text", purpose: "p" }, { kind: "mcq", purpose: "p" }] }], write_response: [{ title: "Interest", blocks: [text, mcq] }] });
  return (await compose({ question: "Explain compound interest", model: m })).response;
}

async function collect(events: AsyncIterable<ComposeEvent>) {
  const list: ComposeEvent[] = [];
  for await (const e of events) list.push(e);
  return list;
}

describe("editResponse", () => {
  it("replaces only the block the request is about", async () => {
    const response = await start();
    const m = model({ edit_response: [{ ops: [{ op: "replace", id: "b2", block: harder }] }] });
    const events = await collect(editResponse({ response, instruction: "Make the question harder", model: m }));
    expect(events.map((e) => e.type)).toEqual(["replace", "done"]);
    const done = events.at(-1) as Extract<ComposeEvent, { type: "done" }>;
    expect(done.response.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(done.response.blocks[0]).toBe(response.blocks[0]);
    expect(done.response.blocks[1]!.source).toEqual(harder);
    // The model saw the current blocks, with ids, as written.
    expect(m.seen[0]!.content).toContain('"id":"b2","kind":"mcq"');
  });

  it("inserts and removes, keeping ids unique and the response non-empty", async () => {
    const response = await start();
    const m = model({ edit_response: [{ ops: [{ op: "insert", after: "b1", block: { kind: "callout", text: "Rule of 72" } }, { op: "remove", id: "b2" }, { op: "remove", id: "nope" }] }] });
    const events = await collect(editResponse({ response, instruction: "Swap the question for a tip", model: m }));
    const done = events.at(-1) as Extract<ComposeEvent, { type: "done" }>;
    expect(done.response.blocks.map((b) => `${b.id}:${b.kind}`)).toEqual(["b1:text", "b3:callout"]);
  });

  it("repairs or drops invalid edited blocks without touching the rest", async () => {
    const response = await start();
    const broken = { ...harder, questions: [{ ...harder.questions[0], correct: ["z"] }] };
    const m = model({ edit_response: [{ ops: [{ op: "replace", id: "b2", block: broken }] }], fix_block: [broken] });
    const events = await collect(editResponse({ response, instruction: "harder", model: m }));
    expect(events[0]).toMatchObject({ type: "dropped", kind: "mcq" });
    expect((events.at(-1) as Extract<ComposeEvent, { type: "done" }>).response.blocks[1]).toBe(response.blocks[1]);
  });
});

describe("respond", () => {
  it("routes follow-ups to an edit and new topics to a fresh answer", async () => {
    const previous = await start();
    const edit = model({ route_message: [{ action: "edit" }], edit_response: [{ ops: [{ op: "replace", id: "b2", block: harder }] }] });
    expect((await collect(respond({ question: "harder please", previous, model: edit }))).map((e) => e.type)).toEqual(["replace", "done"]);

    const fresh = model({ route_message: [{ action: "new" }], plan_response: [{ strategy: "text", reason: "r", blocks: [{ kind: "text", purpose: "p" }] }], write_response: [{ blocks: [text] }] });
    const events = await collect(respond({ question: "What is inflation?", previous, model: fresh }));
    expect(events[0]!.type).toBe("plan");
  });

  it("gives the agent what the learner did", async () => {
    const m = model({ plan_response: [{ strategy: "text", reason: "r", blocks: [{ kind: "text", purpose: "p" }] }], write_response: [{ blocks: [text] }] });
    await collect(respond({ question: "Why?", learnerContext: "got q1 in the mcq wrong", model: m }));
    expect(m.seen[0]!.content).toContain("(What I did with your last answer: got q1 in the mcq wrong)");
  });
});

describe("learner activity", () => {
  it("summarises the events that matter", () => {
    const base = { activityId: "b2", at: 0 };
    const events: ActivityEvent[] = [
      { ...base, activityType: "mcq", type: "activity.started" },
      { ...base, activityType: "mcq", type: "question.answered", questionId: "q1", selected: ["a"], correct: false },
      { ...base, activityType: "mcq", type: "hint.shown", itemId: "q1" },
      { ...base, activityType: "quiz", type: "activity.completed", score: { earned: 3, possible: 4, percent: 75 } },
    ];
    expect(describeActivity(events)).toBe("got q1 in the mcq wrong; asked for a hint on q1; finished the quiz with 75% (3/4)");
  });
});

describe("restoring a response from the client", () => {
  it("re-validates every block and keeps their ids", async () => {
    const response = await start();
    const sent = JSON.parse(JSON.stringify({ title: response.title, blocks: response.blocks.map((b) => ({ id: b.id, ...b.source })) }));
    sent.blocks.push({ id: "b9", kind: "mcq", questions: "tampered" }, { id: "../etc", ...text });
    const restored = restoreResponse(defaultCatalog, sent)!;
    expect(restored.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(describeResponse(restored)).toBe(describeResponse(response));
  });
});

describe("the response state", () => {
  it("applies edits in place and starts over for a new answer", async () => {
    const response = await start();
    let state = reduceEvent(emptyResponse, { type: "done", response, plan: { strategy: "compose", reason: "", blocks: [] } });
    const harderBlock = (await collect(editResponse({ response, instruction: "x", model: model({ edit_response: [{ ops: [{ op: "replace", id: "b2", block: harder }] }] }) })))[0] as Extract<ComposeEvent, { type: "replace" }>;
    state = reduceEvent(state, harderBlock);
    expect(state.blocks[1]!.source).toEqual(harder);
    expect(state.blocks[0]).toBe(response.blocks[0]);
    state = reduceEvent(state, { type: "plan", plan: { strategy: "text", reason: "", blocks: [] } });
    expect(state.blocks).toEqual([]);
  });
});

describe("replaced blocks", () => {
  it("get a new revision so their component starts fresh", async () => {
    const response = await start();
    let state = reduceEvent(emptyResponse, { type: "done", response, plan: { strategy: "compose", reason: "", blocks: [] } });
    state = reduceEvent(state, { type: "replace", id: "b2", block: response.blocks[1]! });
    state = reduceEvent(state, { type: "replace", id: "b2", block: response.blocks[1]! });
    expect(state.revisions).toEqual({ b2: 2 });
  });
});

describe("note markdown", () => {
  it("writes live kinds as fences and content as plain markdown", async () => {
    const { responseToMarkdown, checkResponse } = await import("../src/index.js");
    const { response } = checkResponse(defaultCatalog, {
      title: "Interest",
      blocks: [
        { kind: "text", markdown: "Hello **there**." },
        { kind: "steps", items: [{ title: "Save", text: "every month" }] },
        { kind: "callout", variant: "tip", text: "Start early." },
        { kind: "comparison", columns: ["Simple", "Compound"], rows: [{ label: "Grows on", values: ["principal", "principal | interest"] }] },
        mcq,
      ],
    });
    const md = responseToMarkdown(response);
    expect(md).toContain("## Interest");
    expect(md).toContain("1. **Save** every month");
    expect(md).toContain("> **Tip:** Start early.");
    expect(md).toContain("| **Grows on** | principal | principal \\| interest |");
    expect(md).toMatch(/```mcq\n\{\n  "questions"/);
    expect(md).not.toContain('"kind"');
  });
});
