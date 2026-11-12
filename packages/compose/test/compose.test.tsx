import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkBlock,
  compose,
  composeResponse,
  defaultCatalog,
  EVAL_CASES,
  markdownToBlocks,
  readEventStream,
  readPartialResponse,
  responseTool,
  scorePlan,
  toEventStream,
  type ComposeEvent,
  type ModelClient,
  type Plan,
} from "../src/index.js";
import { emptyResponse, reduceEvent, ResponseView } from "../src/react-entry.js";

afterEach(cleanup);

/** A fake model: answers each tool with a scripted input, streaming it in small chunks. */
function fakeModel(script: Record<string, unknown[]>): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const queues = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
  return {
    calls,
    async callTool({ tool, onPartial }) {
      calls.push(tool.name);
      const next = queues[tool.name]?.shift();
      if (next === undefined) throw new Error(`No scripted answer for ${tool.name}`);
      const json = JSON.stringify(next);
      for (let i = 1; i <= json.length; i += 7) onPartial?.(json.slice(0, i));
      onPartial?.(json);
      return next;
    },
  };
}

const plan: Plan = {
  strategy: "compose",
  reason: "Interest is a relationship between numbers worth exploring.",
  title: "Compound interest",
  blocks: [
    { kind: "text", purpose: "Explain the idea" },
    { kind: "widget", purpose: "Let the learner vary the rate" },
    { kind: "mcq", purpose: "Check understanding" },
  ],
};

const widget = defaultCatalog.get("widget")!.example;
const mcq = defaultCatalog.get("mcq")!.example;
const text = { kind: "text", markdown: "Compound interest earns interest on **past interest**.\n\n- It grows faster over time\n- Rates matter a lot" };

async function collect(events: AsyncIterable<ComposeEvent>) {
  const list: ComposeEvent[] = [];
  for await (const event of events) list.push(event);
  return list;
}

describe("catalog", () => {
  it.each(defaultCatalog.entries.map((e) => [e.kind, e] as const))("%s: example is valid and schema names the kind", (kind, entry) => {
    const result = checkBlock(defaultCatalog, entry.example, "b1");
    expect(result.ok ? true : result.issues).toBe(true);
    const schema = entry.jsonSchema() as { properties: { kind: { const: string } }; required: string[] };
    expect(schema.properties.kind.const).toBe(kind);
    expect(schema.required).toContain("kind");
    expect(JSON.stringify(schema)).not.toContain('"schemaVersion"');
  });

  it("rejects unknown kinds and bad blocks with paths", () => {
    expect(checkBlock(defaultCatalog, { kind: "marquee" }, "b1")).toMatchObject({ ok: false, issues: [{ path: "kind" }] });
    const broken = { ...widget, values: [{ name: "balance", formula: "1000 * (1 + ratee/100)^15" }] };
    const result = checkBlock(defaultCatalog, broken, "b1");
    expect(result.ok || result.issues.map((i) => i.message)).toContain('Unknown name "ratee"');
  });

  it("can narrow to planned kinds for a smaller schema", () => {
    const narrow = JSON.stringify(responseTool(defaultCatalog.only(["text", "quiz"])).inputSchema);
    expect(narrow).toContain('"const":"quiz"');
    expect(narrow).not.toContain('"const":"widget"');
  });
});

describe("markdown", () => {
  it("becomes typed content blocks", () => {
    expect(markdownToBlocks("# Title\nSome **bold** text\nthat wraps.\n\n1. One\n2. Two\n\n> Quote\n\n```js\nlet a = 1\n```")).toEqual([
      { type: "heading", level: 2, text: "Title" },
      { type: "paragraph", text: "Some **bold** text that wraps." },
      { type: "list", ordered: true, items: ["One", "Two"] },
      { type: "quote", text: "Quote" },
      { type: "code", language: "js", code: "let a = 1" },
    ]);
  });
});

describe("reading partial JSON", () => {
  it("returns finished blocks and the one being written", () => {
    const json = JSON.stringify({ title: "T", blocks: [text, widget] });
    const cut = json.slice(0, json.indexOf('"inputs"'));
    const partial = readPartialResponse(cut);
    expect(partial.title).toBe("T");
    expect(partial.complete).toEqual([text]);
    expect(partial.pending).toEqual({ kind: "widget" });
  });

  it("streams a text block's markdown as it grows", () => {
    const json = JSON.stringify({ blocks: [{ kind: "text", markdown: 'Line one\nsays "hi"' }] });
    expect(readPartialResponse(json.slice(0, -10)).pending).toMatchObject({ kind: "text", markdown: "Line one\nsays " });
  });
});

describe("composeResponse", () => {
  it("plans, streams blocks in order and finishes", async () => {
    const model = fakeModel({ plan_response: [plan], write_response: [{ title: "Compound interest", blocks: [text, widget, mcq] }] });
    const events = await collect(composeResponse({ question: "Explain compound interest", model }));
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("plan");
    expect(types).toContain("pending");
    expect(events.filter((e) => e.type === "block").map((e) => (e as { index: number }).index)).toEqual([0, 1, 2]);
    // Blocks arrive while the model is still writing, not all at the end.
    expect(types.indexOf("block")).toBeLessThan(types.lastIndexOf("pending"));
    const done = events.at(-1) as Extract<ComposeEvent, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done.response.blocks.map((b) => b.kind)).toEqual(["text", "widget", "mcq"]);
    expect(model.calls).toEqual(["plan_response", "write_response"]);
  });

  it("repairs only the invalid block", async () => {
    const broken = { ...widget, values: [{ name: "balance", formula: "1000 * (1 + ratee/100)^15" }, { name: "gain", formula: "balance - 1000" }] };
    const model = fakeModel({ plan_response: [plan], write_response: [{ blocks: [text, broken, mcq] }], fix_block: [widget] });
    const events = await collect(composeResponse({ question: "q", model }));
    const repaired = events.find((e) => e.type === "block" && e.index === 1) as Extract<ComposeEvent, { type: "block" }>;
    expect(repaired.repaired).toBe(true);
    expect(model.calls).toEqual(["plan_response", "write_response", "fix_block"]);
    expect((events.at(-1) as Extract<ComposeEvent, { type: "done" }>).response.blocks).toHaveLength(3);
  });

  it("drops a block that is still invalid after repair, keeping the rest", async () => {
    const broken = { kind: "mcq", questions: [{ id: "q1", prompt: "?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: ["z"] }] };
    const model = fakeModel({ plan_response: [plan], write_response: [{ blocks: [text, broken] }], fix_block: [broken] });
    const result = await compose({ question: "q", model });
    expect(result.response.blocks.map((b) => b.kind)).toEqual(["text"]);
    expect(result.dropped[0]).toMatchObject({ index: 1, kind: "mcq" });
  });

  it("falls back to text when the plan is unusable", async () => {
    const model = fakeModel({ plan_response: [{ strategy: "dance" }], write_response: [{ blocks: [text] }] });
    const result = await compose({ question: "q", model });
    expect(result.plan.strategy).toBe("text");
    expect(result.response.blocks).toHaveLength(1);
  });

  it("only offers the planned kinds to the writer", async () => {
    const tools: Record<string, unknown>[] = [];
    const model: ModelClient = {
      async callTool({ tool }) {
        tools.push(tool.inputSchema);
        return tool.name === "plan_response" ? { ...plan, blocks: [{ kind: "text", purpose: "answer" }] } : { blocks: [text] };
      },
    };
    await compose({ question: "q", model });
    expect(JSON.stringify(tools[1])).not.toContain('"const":"widget"');
  });

  it("reports errors as events", async () => {
    const model: ModelClient = {
      async callTool() {
        throw new Error("rate limited");
      },
    };
    const events = await collect(composeResponse({ question: "q", model }));
    expect(events).toEqual([{ type: "error", message: "rate limited" }]);
  });
});

describe("server-sent events", () => {
  it("round-trips events", async () => {
    async function* source(): AsyncGenerator<ComposeEvent> {
      yield { type: "title", title: "Hello\n\nworld" };
      yield { type: "error", message: "x" };
    }
    expect(await collect(readEventStream(toEventStream(source())))).toEqual([
      { type: "title", title: "Hello\n\nworld" },
      { type: "error", message: "x" },
    ]);
  });
});

describe("evals", () => {
  it("score plans against expectations", () => {
    const lookup = EVAL_CASES.find((c) => c.question.startsWith("What is the capital"))!;
    expect(scorePlan({ strategy: "text", reason: "", blocks: [{ kind: "text", purpose: "" }] }, lookup).pass).toBe(true);
    const bad = scorePlan({ strategy: "compose", reason: "", blocks: [{ kind: "quiz", purpose: "" }] }, lookup);
    expect(bad.failures).toEqual(["strategy was compose, expected text", "shouldn't use quiz"]);
  });
});

describe("ResponseView", () => {
  it("renders a mixed response with streaming placeholders", async () => {
    const model = fakeModel({ plan_response: [plan], write_response: [{ title: "Compound interest", blocks: [text, widget, mcq] }] });
    const events = await collect(composeResponse({ question: "q", model }));
    const midway = events.slice(0, events.findIndex((e) => e.type === "block" && e.index === 1));
    const { rerender } = render(<ResponseView state={midway.reduce(reduceEvent, emptyResponse)} showPlan />);
    expect(screen.getByText(/past interest/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Building an interactive widget");

    rerender(<ResponseView state={events.reduce(reduceEvent, emptyResponse)} showPlan />);
    expect(screen.getByRole("heading", { name: "Compound interest", level: 2 })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Annual return" })).toBeTruthy();
    expect(screen.getByText("Which grows faster over 20 years?")).toBeTruthy();
    expect(screen.getByText("Composed answer")).toBeTruthy();
  });

  it("shows errors", () => {
    render(<ResponseView state={reduceEvent({ ...emptyResponse, status: "writing" }, { type: "error", message: "Network down" })} />);
    expect(screen.getByRole("alert").textContent).toContain("Network down");
  });
});

vi.setConfig({ testTimeout: 10_000 });

describe("plans", () => {
  it("trim over-long text and drop unknown kinds instead of falling back to text", async () => {
    const long = { strategy: "compose", reason: "r".repeat(900), blocks: [{ kind: "text", purpose: "p".repeat(500) }, { kind: "hologram", purpose: "x" }, { kind: "widget", purpose: "w" }] };
    const model = fakeModel({ plan_response: [long], write_response: [{ blocks: [text, widget] }] });
    const result = await compose({ question: "q", model });
    expect(result.plan.strategy).toBe("compose");
    expect(result.plan.blocks.map((b) => b.kind)).toEqual(["text", "widget"]);
  });
});
