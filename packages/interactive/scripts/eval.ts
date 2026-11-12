/**
 * Measures how well a model turns notes into study activities: valid, free of
 * item-writing problems, first time and after feeding the problems back (up to
 * two repairs), and how many kinds of question it uses beyond multiple choice.
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/interactive eval
 *   ANTHROPIC_API_KEY=… INTERACTIVE_MODEL=claude-sonnet-5-5 pnpm --filter @octonote/interactive eval -- --only=photosynthesis
 *
 * Sessions are saved to scripts/out/ (git-ignored).
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRegistry, lintActivity, normalizeSpec, sessionToolDefinition, type ActivitySpecBase } from "../src/index.js";

const NOTES: { slug: string; note: string }[] = [
  {
    slug: "photosynthesis",
    note: "Photosynthesis happens in chloroplasts. Plants take in carbon dioxide through stomata and water through their roots. Using light energy captured by chlorophyll, they make glucose and release oxygen. The light-dependent reactions happen in the thylakoids; the Calvin cycle happens in the stroma.",
  },
  {
    slug: "french-revolution",
    note: "The French Revolution began in 1789. The Estates-General met in May, the Third Estate declared itself the National Assembly in June, and the Bastille fell on 14 July. The Declaration of the Rights of Man came in August. The monarchy was abolished in 1792 and Louis XVI executed in January 1793.",
  },
  {
    slug: "ohms-law",
    note: "Ohm's law: voltage equals current times resistance (V = IR). Voltage is measured in volts, current in amperes, resistance in ohms. In series circuits resistances add; in parallel circuits the reciprocals add. A 12 V battery across a 4 ohm resistor drives 3 A.",
  },
  {
    slug: "cell-organelles",
    note: "The nucleus holds DNA. Mitochondria release energy through respiration. Ribosomes make proteins. The cell membrane controls what enters and leaves. Plant cells also have a cell wall made of cellulose, chloroplasts, and a large vacuole.",
  },
  {
    slug: "supply-demand",
    note: "When the price of a good rises, people usually buy less of it (the law of demand) and producers want to sell more (the law of supply). The market settles at the equilibrium price, where quantity demanded equals quantity supplied. A shortage pushes prices up; a surplus pushes them down.",
  },
];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY to run the evals.");
  process.exit(1);
}
const modelName = process.env.INTERACTIVE_MODEL ?? "claude-opus-5-5";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const client = new Anthropic({ apiKey });
const tool = sessionToolDefinition();
const outDir = join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });

const SYSTEM = `You turn a learner's notes into a short study session. Call ${tool.name} exactly once. Use a mix of activities (flashcards, practice questions, a quiz, a mind map, matching) and a mix of question kinds where they fit (fill in the blank, a number, putting steps in order, sorting into groups, a short written answer), not only multiple choice. If the tool reports problems, fix every one and call it again with the whole session.`;

type Status = "clean" | "lint" | "invalid" | "no call";

function problems(input: unknown): { spec?: ActivitySpecBase; list: string[]; status: Status } {
  const result = defaultRegistry.validate(normalizeSpec(input));
  if (!result.ok) return { list: result.issues.map((i) => `${i.path}: ${i.message}`), status: "invalid" };
  const lint = lintActivity(result.spec).map((i) => `${i.path}: ${i.message}`);
  return { spec: result.spec, list: lint, status: lint.length ? "lint" : "clean" };
}

/** Which activities and question kinds were used. */
function kinds(spec: ActivitySpecBase): string[] {
  const found = new Set<string>();
  const visit = (a: ActivitySpecBase & Record<string, unknown>) => {
    found.add(a.type);
    if (a.type === "session") (a.activities as ActivitySpecBase[]).forEach((x) => visit(x as never));
    for (const q of (a.questions as { kind?: string }[] | undefined) ?? []) found.add(`q:${q.kind ?? "single"}`);
  };
  visit(spec as never);
  return [...found].sort();
}

interface Outcome {
  slug: string;
  attempts: number;
  firstTry: Status;
  final: Status;
  firstProblems?: string[];
  remaining?: string[];
  kinds?: string[];
  error?: string;
}

async function run(testCase: (typeof NOTES)[number]): Promise<Outcome> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `My notes:\n\n${testCase.note}\n\nMake me a study session from them.` }];
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
      messages.push({ role: "assistant", content: response.content }, { role: "user", content: `Call ${tool.name} with the session.` });
      continue;
    }
    const found = problems(call.input);
    if (attempt === 1) {
      outcome.firstTry = found.status;
      outcome.firstProblems = found.list;
    }
    outcome.final = found.status;
    outcome.remaining = found.list;
    if (found.spec) {
      outcome.kinds = kinds(found.spec);
      writeFileSync(join(outDir, `${testCase.slug}.json`), JSON.stringify(found.spec, null, 2));
    }
    if (found.status === "clean") break;
    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Fix these problems and call ${tool.name} again with the whole session:\n- ${found.list.slice(0, 25).join("\n- ")}` }] },
    );
  }
  return outcome;
}

const cases = NOTES.filter((c) => !only || only.includes(c.slug));
const started = Date.now();
const outcomes: Outcome[] = [];
// A few at a time, to stay inside rate limits.
for (let i = 0; i < cases.length; i += 3) {
  outcomes.push(
    ...(await Promise.all(cases.slice(i, i + 3).map((c) => run(c).catch((error: unknown): Outcome => ({ slug: c.slug, attempts: 0, firstTry: "no call", final: "no call", error: (error as Error).message }))))),
  );
}

for (const o of outcomes) {
  console.log(`${o.final === "clean" ? "PASS" : "FAIL"}  ${o.slug}  first try: ${o.firstTry}, final: ${o.final} after ${o.attempts}`);
  if (o.kinds) console.log(`      uses: ${o.kinds.join(", ")}`);
  if (o.error) console.log(`      error: ${o.error.slice(0, 200)}`);
  const lines = o.final === "clean" ? (o.firstProblems ?? []).map((l) => `fixed: ${l}`) : (o.remaining ?? []);
  for (const line of lines.slice(0, 5)) console.log(`      ${line}`);
}
const count = (key: "firstTry" | "final") => outcomes.filter((o) => o[key] === "clean").length;
const varied = outcomes.filter((o) => (o.kinds ?? []).filter((k) => k.startsWith("q:") && !["q:single", "q:multiple", "q:true_false"].includes(k)).length >= 2).length;
console.log(`\nModel ${modelName}: clean first try ${count("firstTry")}/${outcomes.length}, clean after repair ${count("final")}/${outcomes.length}, two or more new question kinds in ${varied}/${outcomes.length}  (${Math.round((Date.now() - started) / 1000)}s)`);
console.log(`Sessions saved in ${outDir}`);
