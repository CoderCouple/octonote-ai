import type { Question, QuizSpec } from "./schemas/questions.js";

export interface Score {
  earned: number;
  possible: number;
  /** 0 to 100, rounded to a whole number. */
  percent: number;
  /** Set when a passing percent applies. */
  passed?: boolean;
}

/** Selected option ids for each question id. */
export type Responses = Record<string, readonly string[]>;

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  selected: string[];
  correctOptionIds: string[];
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
    if (!q.correct) throw new Error(`Question "${q.id}" has no answer key`);
    const points = q.points ?? 1;
    // Ignore ids that aren't options, so a tampered response can't match by accident.
    const optionIds = new Set(q.options.map((o) => o.id));
    const selected = [...new Set(responses[q.id] ?? [])].filter((id) => optionIds.has(id));
    const correct = isAnswerCorrect(q.correct, selected);
    possible += points;
    if (correct) earned += points;
    const rationales = Object.fromEntries(q.options.filter((o) => o.rationale).map((o) => [o.id, o.rationale!]));
    return {
      questionId: q.id,
      correct,
      selected,
      correctOptionIds: [...q.correct],
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
    questions: spec.questions.map(({ correct: _c, explanation: _e, ...q }) => ({
      ...q,
      options: q.options.map(({ rationale: _r, ...o }) => o),
    })),
  };
}
