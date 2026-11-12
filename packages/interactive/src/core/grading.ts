import { checkResponse, expectedResponse, isChoice } from "./answers.js";
import { seededRandom, shuffle } from "./shuffle.js";
import type { Question, QuizSpec } from "./schemas/questions.js";

export interface Score {
  earned: number;
  possible: number;
  /** 0 to 100, rounded to a whole number. */
  percent: number;
  /** Set when a passing percent applies. */
  passed?: boolean;
}

/** Each question's response, by question id (option ids, typed answers, an order…; see `Response`). */
export type Responses = Record<string, readonly string[]>;

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  selected: string[];
  /** For choice questions; empty otherwise. */
  correctOptionIds: string[];
  /** The right answer in response form, for every kind (what to reveal). */
  expected?: string[];
  /** Which blanks, positions or items were right. */
  parts?: boolean[];
  /** A short answer that still needs marking. */
  pending?: boolean;
  explanation?: string;
  /** Rationale for each option, by option id. */
  rationales?: Record<string, string>;
}

export interface GradeResult {
  score: Score;
  results: QuestionResult[];
}

/** True when exactly the correct options are selected. */
export function isAnswerCorrect(correct: readonly string[], selected: readonly string[]): boolean {
  const chosen = new Set(selected);
  return chosen.size === correct.length && correct.every((id) => chosen.has(id));
}

export function makeScore(earned: number, possible: number, passingPercent?: number): Score {
  const percent = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return passingPercent === undefined ? { earned, possible, percent } : { earned, possible, percent, passed: percent >= passingPercent };
}

/**
 * Grades every question. Run it where the answers are: in the browser for
 * client-graded quizzes, on your server for server-graded ones.
 */
export function gradeQuestions(questions: readonly Question[], responses: Responses, passingPercent?: number): GradeResult {
  let earned = 0;
  let possible = 0;
  const results = questions.map((q): QuestionResult => {
    const points = q.points ?? 1;
    // Responses are capped, so a tampered one can't be huge; checkResponse ignores anything foreign.
    const raw = (responses[q.id] ?? []).slice(0, 50).map((r) => String(r).slice(0, 2000));
    // For choices, keep only real option ids, once each, so a tampered response can't match by accident.
    const optionIds = new Set(q.options?.map((o) => o.id));
    const selected = isChoice(q) ? [...new Set(raw)].filter((id) => optionIds.has(id)) : raw;
    const check = checkResponse(q, selected);
    possible += points;
    if (check.correct) earned += points;
    const rationales = Object.fromEntries((q.options ?? []).filter((o) => o.rationale).map((o) => [o.id, o.rationale!]));
    return {
      questionId: q.id,
      correct: check.correct,
      selected,
      correctOptionIds: [...(q.correct ?? [])],
      expected: expectedResponse(q),
      ...(check.parts ? { parts: check.parts } : {}),
      ...(check.pending ? { pending: true } : {}),
      ...(q.explanation ? { explanation: q.explanation } : {}),
      ...(Object.keys(rationales).length ? { rationales } : {}),
    };
  });
  return { score: makeScore(earned, possible, passingPercent), results };
}

export function gradeQuiz(spec: QuizSpec, responses: Responses): GradeResult {
  return gradeQuestions(spec.questions, responses, spec.passingPercent);
}

/**
 * The copy of a quiz that is safe to send to a learner: answers, explanations
 * and rationales removed, and grading switched to the server. Keep the full spec
 * on the server and grade with `gradeQuiz`.
 */
export function redactQuiz(spec: QuizSpec): QuizSpec {
  return {
    ...spec,
    grading: "server",
    questions: spec.questions.map(({ correct: _c, explanation: _e, blanks: _b, answer: _a, rubric: _r, sample: _s, ...q }) => ({
      ...q,
      ...(q.options ? { options: q.options.map(({ rationale: _x, ...o }) => o) } : {}),
      // An order question's items are its answer, so they go out shuffled; groups are removed.
      ...(q.items ? { items: (q.kind === "order" ? scrambled(q.items, q.id) : q.items).map(({ group: _g, ...item }) => item) } : {}),
    })),
  };
}

/** Items in a stable shuffled order that is never already the answer. */
export function scrambled<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  if (items.length < 2) return [...items];
  const out = shuffle(items, seededRandom(seedOf(seed)));
  // Rotate when the shuffle happens to land on the right order.
  return out.every((item, i) => item.id === items[i]!.id) ? [...out.slice(1), out[0]!] : out;
}

/** A stable number from a string, to shuffle the same way every time. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
