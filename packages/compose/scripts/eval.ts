/**
 * Measures how well the agent chooses components.
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/compose eval            # plans only (fast, cheap)
 *   ANTHROPIC_API_KEY=… pnpm --filter @octonote/compose eval -- --full  # also writes and validates each response
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicModel, compose, EVAL_CASES, planResponse, scorePlan } from "../src/index.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY to run the evals.");
  process.exit(1);
}
const full = process.argv.includes("--full");
const model = anthropicModel(new Anthropic({ apiKey }), process.env.COMPOSE_MODEL ?? "claude-opus-5-5");

let passed = 0;
let validBlocks = 0;
let totalBlocks = 0;
for (const testCase of EVAL_CASES) {
  try {
    let plan;
    if (full) {
      const result = await compose({ question: testCase.question, model });
      plan = result.plan;
      validBlocks += result.response.blocks.length;
      totalBlocks += result.response.blocks.length + result.dropped.length;
    } else {
      plan = await planResponse({ question: testCase.question, model });
    }
    const score = scorePlan(plan, testCase);
    if (score.pass) passed++;
    console.log(`${score.pass ? "PASS" : "FAIL"}  ${testCase.question}\n      ${plan.strategy}: ${plan.blocks.map((b) => b.kind).join(", ")}${score.failures.length ? `\n      ${score.failures.join("; ")}` : ""}`);
  } catch (error) {
    console.log(`ERROR ${testCase.question}\n      ${(error as Error).message}`);
  }
}
console.log(`\nChoice: ${passed}/${EVAL_CASES.length} plans as expected`);
if (full) console.log(`Validity: ${validBlocks}/${totalBlocks} blocks valid after repair`);
