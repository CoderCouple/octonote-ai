import { describe, expect, it } from "vitest";
import { defaultRegistry, gradeQuiz, isAnswerCorrect, orderByDue, redactQuiz, scheduleReview, seededRandom, shuffle, type QuizSpec } from "../src/index.js";
import example from "../examples/digestive-system.json" with { type: "json" };

const digestive: any = example;


const quiz: QuizSpec = digestive.activities.find((a: { type: string }) => a.type === "quiz");

describe("grading", () => {
  it("needs exactly the correct options", () => {
    expect(isAnswerCorrect(["a", "b"], ["b", "a"])).toBe(true);
    expect(isAnswerCorrect(["a", "b"], ["a"])).toBe(false);
    expect(isAnswerCorrect(["a"], ["a", "c"])).toBe(false);
  });

  it("scores a quiz and applies the passing percent", () => {
    const result = gradeQuiz(quiz, { q1: ["b"], q2: ["b"], q3: ["a"], q4: ["a", "b"] });
    expect(result.score).toEqual({ earned: 3, possible: 4, percent: 75, passed: true });
    expect(result.results[2]).toMatchObject({ questionId: "q3", correct: false, selected: ["a"], correctOptionIds: ["b"] });
  });

  it("ignores unknown and repeated option ids", () => {
    const result = gradeQuiz(quiz, { q1: ["b", "b", "zzz"] });
    expect(result.results[0]).toMatchObject({ correct: true, selected: ["b"] });
    expect(result.score.passed).toBe(false);
  });
});

describe("redacting a quiz for the browser", () => {
  const safe = redactQuiz(quiz);

  it("removes every answer", () => {
    const text = JSON.stringify(safe);
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain("explanation");
    expect(text).not.toContain("rationale");
  });

  it("is still a valid server-graded spec", () => {
    expect(defaultRegistry.validate(safe).ok).toBe(true);
  });

  it("can still be graded on the server with the full spec", () => {
    expect(gradeQuiz(quiz, { q1: ["b"] }).score.earned).toBe(1);
  });
});

describe("spaced repetition", () => {
  const now = Date.UTC(2026, 0, 1);
  const day = 86_400_000;

  it("moves known cards up a box and forgotten ones back to the start", () => {
    const first = scheduleReview(undefined, true, now);
    expect(first).toEqual({ box: 1, due: now + day, reviews: 1 });
    const second = scheduleReview(first, true, now);
    expect(second.due).toBe(now + 3 * day);
    expect(scheduleReview(second, false, now)).toEqual({ box: 0, due: now, reviews: 3 });
  });

  it("orders due cards first", () => {
    const states = { a: scheduleReview(undefined, true, now), c: scheduleReview(undefined, false, now) };
    expect(orderByDue(["a", "b", "c"], states, now)).toEqual(["b", "c", "a"]);
  });
});

describe("shuffle", () => {
  it("is repeatable with a seed and keeps every item", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(shuffle(items, seededRandom(7))).toEqual(shuffle(items, seededRandom(7)));
    expect(shuffle(items, seededRandom(7)).sort()).toEqual(items);
  });
});
