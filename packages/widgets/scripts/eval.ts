/**
 * Measures how well a model writes explorable widgets: valid and clean across
 * every input's range, first time and after feeding the problems back (up to
 * two repairs). Also counts how often it reaches for direct manipulation and data.
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/widgets eval
 *   ANTHROPIC_API_KEY=… WIDGETS_MODEL=claude-sonnet-5-5 pnpm --filter @octonote/widgets eval -- --only=loan,dice
 *
 * Widgets are saved to scripts/out/ (git-ignored); the playground shows them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lintWidget, validateWidget, widgetToolDefinition, type WidgetSpec } from "../src/index.js";

const CASES: { slug: string; question: string }[] = [
  { slug: "loan", question: "How much of my mortgage payment goes to interest?" },
  { slug: "pendulum", question: "Why does a longer pendulum swing more slowly?" },
  { slug: "dice", question: "What's the chance of rolling at least one six with several dice?" },
  { slug: "co2", question: "How has the CO2 in the atmosphere changed since 1960?" },
  { slug: "quadratic", question: "What do a, b and c do to the graph of a quadratic?" },
  { slug: "half-life", question: "How does radioactive half-life work?" },
  { slug: "unit-circle", question: "How do sine and cosine come from the unit circle?" },
  { slug: "inflation", question: "How much will $100 be worth in 20 years with inflation?" },
];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY to run the evals.");
  process.exit(1);
}
const modelName = process.env.WIDGETS_MODEL ?? "claude-opus-5-5";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const client = new Anthropic({ apiKey });
const tool = widgetToolDefinition();
const outDir = join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });

const SYSTEM = `You build interactive explorable widgets for a notes app. Call ${tool.name} exactly once with the whole widget. If the tool reports problems, fix every one and call it again with the complete corrected widget.`;

type Status = "clean" | "sweep" | "invalid" | "no call";

function problems(input: unknown, id: string): { spec?: WidgetSpec; list: string[]; status: Status } {
  const result = validateWidget({ ...(input as object), schemaVersion: "1.0", type: "widget", id });
  if (!result.ok) return { list: result.issues.map((i) => `${i.path}: ${i.message}`), status: "invalid" };
  const sweep = lintWidget(result.spec).map((i) => `${i.path}: ${i.message}`);
  return { spec: result.spec, list: sweep, status: sweep.length ? "sweep" : "clean" };
}

interface Outcome {
  slug: string;
  attempts: number;
  firstTry: Status;
  final: Status;
  firstProblems?: string[];
  remaining?: string[];
  features?: string[];
  error?: string;
}

/** What the widget uses, to see whether the model reaches beyond sliders and stats. */
function features(spec: WidgetSpec): string[] {
  const found = new Set<string>();
  if (spec.data?.length) found.add("data");
  for (const v of spec.views) {
    found.add(v.type);
    if (v.type === "chart") {
      if (v.handles?.length) found.add("handles");
      if (v.marks?.length) found.add("marks");
      if (v.series.some((s) => s.data)) found.add("data series");
    }
    if ("drag" in v && v.drag) found.add("drag");
  }
  if (spec.inputs.some((i) => i.kind === "slider" && i.play)) found.add("play");
  return [...found].sort();
}

async function run(testCase: (typeof CASES)[number]): Promise<Outcome> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `A reader asked: "${testCase.question}"\nBuild one widget that lets them explore the answer.` }];
  const outcome: Outcome = { slug: testCase.slug, attempts: 0, firstTry: "no call", final: "no call" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    outcome.attempts = attempt;
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "auto" },
      messages,
    });
    const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) {
      messages.push({ role: "assistant", content: response.content }, { role: "user", content: `Call ${tool.name} with the widget.` });
      continue;
    }
    const found = problems(call.input, testCase.slug);
    if (attempt === 1) {
      outcome.firstTry = found.status;
      outcome.firstProblems = found.list;
    }
    outcome.final = found.status;
    outcome.remaining = found.list;
    if (found.spec) {
      outcome.features = features(found.spec);
      writeFileSync(join(outDir, `${testCase.slug}.json`), JSON.stringify(found.spec, null, 2));
    }
    if (found.status === "clean") break;
    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Fix these problems and call ${tool.name} again with the whole widget:\n- ${found.list.slice(0, 25).join("\n- ")}` }] },
    );
  }
  return outcome;
}

const cases = CASES.filter((c) => !only || only.includes(c.slug));
const started = Date.now();
const outcomes: Outcome[] = [];
// A few at a time, to stay inside rate limits.
for (let i = 0; i < cases.length; i += 4) {
  outcomes.push(
    ...(await Promise.all(cases.slice(i, i + 4).map((c) => run(c).catch((error: unknown): Outcome => ({ slug: c.slug, attempts: 0, firstTry: "no call", final: "no call", error: (error as Error).message }))))),
  );
}

for (const o of outcomes) {
  console.log(`${o.final === "clean" ? "PASS" : "FAIL"}  ${o.slug}  first try: ${o.firstTry}, final: ${o.final} after ${o.attempts}`);
  if (o.features) console.log(`      uses: ${o.features.join(", ")}`);
  if (o.error) console.log(`      error: ${o.error.slice(0, 200)}`);
  const lines = o.final === "clean" ? (o.firstProblems ?? []).map((l) => `fixed: ${l}`) : (o.remaining ?? []);
  for (const line of lines.slice(0, 5)) console.log(`      ${line}`);
}
const count = (key: "firstTry" | "final") => outcomes.filter((o) => o[key] === "clean").length;
const direct = outcomes.filter((o) => o.features?.some((f) => ["sentence", "handles", "drag", "play"].includes(f))).length;
console.log(`\nModel ${modelName}: clean first try ${count("firstTry")}/${outcomes.length}, clean after repair ${count("final")}/${outcomes.length}, direct manipulation in ${direct}/${outcomes.length}  (${Math.round((Date.now() - started) / 1000)}s)`);
console.log(`Widgets saved in ${outDir}`);
