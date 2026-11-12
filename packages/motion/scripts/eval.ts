/**
 * Measures how well a model writes scenes: valid, typesettable and cleanly laid out,
 * first time and after feeding the problems back (up to two repairs).
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/motion eval
 *   ANTHROPIC_API_KEY=… MOTION_MODEL=claude-sonnet-5-5 pnpm --filter @octonote/motion eval -- --only=bayes,sine-sum
 *
 * Scenes are saved to scripts/out/ (git-ignored) to look at in the playground's Paste JSON tab.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, computeLayout, lintScene, loadMath, mathIssues, SCHEMA_VERSION, sceneToolDefinition, validateScene, type Scene } from "../src/index.js";

const CASES: { slug: string; concept: string; orientation?: "portrait" }[] = [
  { slug: "derivative", concept: "The derivative as the slope of the tangent line: secant lines approaching the tangent on y = x^2." },
  { slug: "bayes", concept: "Bayes' theorem with a population of 100 people: a test for a rare condition, false positives and the real chance of being sick." },
  { slug: "hash-table", concept: "How a hash table stores and finds keys: hashing, buckets, and a collision." },
  { slug: "sine-sum", concept: "Adding two sine waves of different frequencies makes a new wave (superposition)." },
  { slug: "supply-demand", concept: "Supply and demand curves and the equilibrium price; what happens when demand rises." },
  { slug: "neural-net", concept: "A tiny neural network's forward pass: inputs times weights, summed, through an activation." },
  { slug: "photosynthesis", concept: "Photosynthesis: light, water and CO2 in; glucose and oxygen out.", orientation: "portrait" },
  { slug: "triangle-angles", concept: "Why the angles of a triangle add up to 180 degrees, using a parallel line." },
];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY to run the evals.");
  process.exit(1);
}
const modelName = process.env.MOTION_MODEL ?? "claude-opus-5-5";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const client = new Anthropic({ apiKey });
const tool = sceneToolDefinition();
const math = await loadMath();
const outDir = join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });

const SYSTEM = `You write animated explainer scenes for a notes app. Call ${tool.name} exactly once with the whole scene. If the tool reports problems, fix every one and call it again with the complete corrected scene.`;

/** Everything wrong with a scene, as lines a model can act on. */
function problems(input: unknown, id: string): { scene?: Scene; schema: string[]; tex: string[]; layout: string[] } {
  const result = validateScene({ ...(input as object), schemaVersion: SCHEMA_VERSION, type: "scene", id });
  if (!result.ok) return { schema: result.issues.map((i) => `${i.path}: ${i.message}`), tex: [], layout: [] };
  return {
    scene: result.spec,
    schema: [],
    tex: mathIssues(result.spec, math).map((i) => `${i.path}: ${i.message}`),
    layout: lintScene(result.spec, { math }).map((i) => i.message),
  };
}

interface Outcome {
  slug: string;
  attempts: number;
  firstTry: "clean" | "layout" | "tex" | "invalid" | "no call";
  final: Outcome["firstTry"];
  seconds?: number;
  steps?: number;
  actions?: string[];
  remaining?: string[];
  /** What was wrong the first time, to improve the guide. */
  firstProblems?: string[];
  error?: string;
}

async function run(testCase: (typeof CASES)[number]): Promise<Outcome> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Make one scene explaining: ${testCase.concept}\nOrientation: ${testCase.orientation ?? "landscape"}. Use 5 to 8 steps, each with a caption.`,
    },
  ];
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
      outcome.final = "no call";
      if (attempt === 1) outcome.firstTry = "no call";
      messages.push({ role: "assistant", content: response.content }, { role: "user", content: `Call ${tool.name} with the scene.` });
      continue;
    }
    const found = problems(call.input, testCase.slug);
    const status: Outcome["final"] = found.schema.length ? "invalid" : found.tex.length ? "tex" : found.layout.length ? "layout" : "clean";
    const list = [...found.schema, ...found.tex, ...found.layout];
    if (attempt === 1) {
      outcome.firstTry = status;
      outcome.firstProblems = list;
    }
    outcome.final = status;
    outcome.remaining = list;
    if (found.scene) {
      const compiled = compileScene(found.scene, computeLayout(found.scene, { math }));
      outcome.seconds = Math.round(compiled.duration * 10) / 10;
      outcome.steps = found.scene.steps.length;
      outcome.actions = [...new Set(found.scene.steps.flatMap((s) => s.actions.map((a) => a.do)))].sort();
      writeFileSync(join(outDir, `${testCase.slug}.json`), JSON.stringify(found.scene, null, 2));
    }
    if (status === "clean") break;
    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Fix these problems and call ${tool.name} again with the whole scene:\n- ${list.slice(0, 25).join("\n- ")}` }] },
    );
  }
  return outcome;
}

const cases = CASES.filter((c) => !only || only.includes(c.slug));
const started = Date.now();
// A few at a time, to stay inside rate limits.
const outcomes: Outcome[] = [];
for (let i = 0; i < cases.length; i += 4) {
  outcomes.push(
    ...(await Promise.all(
      cases.slice(i, i + 4).map((c) =>
        run(c).catch((error: unknown): Outcome => ({ slug: c.slug, attempts: 0, firstTry: "no call", final: "no call", error: (error as Error).message })),
      ),
    )),
  );
}

for (const o of outcomes) {
  console.log(`${o.final === "clean" ? "PASS" : "FAIL"}  ${o.slug}  first try: ${o.firstTry}, final: ${o.final} after ${o.attempts}${o.seconds ? `  ·  ${o.steps} steps, ${o.seconds}s` : ""}`);
  if (o.actions) console.log(`      actions: ${o.actions.join(", ")}`);
  if (o.error) console.log(`      error: ${o.error}`);
  if (o.final !== "clean") for (const line of (o.remaining ?? []).slice(0, 5)) console.log(`      ${line}`);
  else if (o.firstTry !== "clean") for (const line of (o.firstProblems ?? []).slice(0, 5)) console.log(`      fixed: ${line}`);
}
const count = (key: "firstTry" | "final") => outcomes.filter((o) => o[key] === "clean").length;
console.log(`\nModel ${modelName}: clean first try ${count("firstTry")}/${outcomes.length}, clean after repair ${count("final")}/${outcomes.length}  (${Math.round((Date.now() - started) / 1000)}s)`);
console.log(`Scenes saved in ${outDir}`);
