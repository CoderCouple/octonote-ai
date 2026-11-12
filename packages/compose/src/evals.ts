import { defaultCatalog, type Catalog } from "./catalog.js";
import type { Plan } from "./response.js";

/**
 * What a good plan looks like for a question. `include` is a list of groups:
 * the plan needs at least one kind from each group.
 */
export interface EvalCase {
  question: string;
  strategy?: Plan["strategy"][];
  include?: string[][];
  exclude?: string[];
  /** Most interactive blocks allowed. */
  maxRich?: number;
}

const RICH = ["widget", "flashcards", "mcq", "quiz", "mindmap", "matching", "scene"];

export const EVAL_CASES: EvalCase[] = [
  { question: "What is the capital of France?", strategy: ["text"], exclude: RICH },
  { question: "What year did the Berlin Wall fall?", strategy: ["text"], exclude: RICH },
  { question: "Thanks, that helped!", strategy: ["text"], exclude: RICH },
  { question: "How do I reverse a list in Python?", include: [["code"]], exclude: RICH },
  { question: "Explain how compound interest works.", include: [["widget"]] },
  { question: "How does the area of a circle change as the radius grows?", include: [["widget"]], exclude: ["quiz"] },
  { question: "Teach me probability interactively.", include: [["widget"], ["mcq", "quiz"]] },
  { question: "How does stopping distance depend on speed?", include: [["widget"]] },
  { question: "Help me memorise the first 10 elements of the periodic table.", include: [["flashcards"]] },
  { question: "Quiz me on the causes of World War I.", include: [["quiz", "mcq"]] },
  { question: "Explain photosynthesis to a 10 year old, then check they understood.", include: [["mcq", "quiz"]] },
  { question: "How does the water cycle work?", include: [["scene", "steps"]], exclude: ["quiz", "mcq"] },
  { question: "Walk me through what happens when I type a URL into a browser.", include: [["scene", "steps"]], exclude: ["quiz", "mcq"] },
  { question: "Give me an overview of machine learning and its main branches.", include: [["mindmap"]] },
  { question: "What's the difference between TCP and UDP?", include: [["comparison"]], exclude: ["quiz", "mcq"] },
  { question: "Let me practise matching European countries to their capitals.", include: [["matching"]] },
  { question: "Create a game where I learn the heart by connecting blood-flow pathways.", strategy: ["custom", "compose"] },
  { question: "Summarise the main events of the French Revolution.", include: [["timeline", "steps", "text"]], maxRich: 2 },
];

export interface EvalResult {
  case: EvalCase;
  plan: Plan;
  pass: boolean;
  failures: string[];
}

/** Checks a plan against what the case expects. */
export function scorePlan(plan: Plan, expected: EvalCase, catalog: Catalog = defaultCatalog): EvalResult {
  const kinds = plan.blocks.map((b) => b.kind);
  const failures: string[] = [];
  if (expected.strategy && !expected.strategy.includes(plan.strategy)) failures.push(`strategy was ${plan.strategy}, expected ${expected.strategy.join(" or ")}`);
  for (const group of expected.include ?? []) if (!group.some((k) => kinds.includes(k))) failures.push(`missing ${group.join(" or ")}`);
  for (const kind of expected.exclude ?? []) if (kinds.includes(kind)) failures.push(`shouldn't use ${kind}`);
  const rich = kinds.filter((k) => catalog.get(k)?.weight === "rich").length;
  if (expected.maxRich !== undefined && rich > expected.maxRich) failures.push(`${rich} interactive blocks, expected at most ${expected.maxRich}`);
  return { case: expected, plan, pass: failures.length === 0, failures };
}
