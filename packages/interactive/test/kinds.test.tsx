import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import water from "../examples/water-cycle-practice.json" with { type: "json" };
import { checkResponse, defaultRegistry, normalizeSpec, expectedResponse, gradeQuiz, isAnswered, Mcq, parseNumber, Quiz, redactQuiz, type McqSpec, type Question, type QuizSpec } from "../src/index.js";

afterEach(cleanup);

const spec = water as unknown as McqSpec;
const q = (id: string) => spec.questions.find((x) => x.id === id)! as Question;
const check = () => fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
const feedback = () => document.querySelector(".ix-feedback")?.textContent;

describe("checking each kind", () => {
  it("fill in the blank: forgiving about case, spaces, a full stop and number formats", () => {
    expect(checkResponse(q("q-blank"), ["  Condensation. ", "RAIN"])).toEqual({ correct: true, parts: [true, true] });
    expect(checkResponse(q("q-blank"), ["condensation", "snow"])).toEqual({ correct: false, parts: [true, false] });
    const numbers: Question = { id: "n", kind: "fill_blank", prompt: "2 + 2 = ___", blanks: [{ accept: ["4"] }] };
    expect(checkResponse(numbers, ["4.0"]).correct).toBe(true);
    const strict: Question = { id: "s", kind: "fill_blank", prompt: "Symbol: ___", blanks: [{ accept: ["Na"], caseSensitive: true }] };
    expect(checkResponse(strict, ["na"]).correct).toBe(false);
  });

  it("numbers: tolerance, units and the way people type them", () => {
    expect(checkResponse(q("q-number"), ["2.5 %"]).correct).toBe(true);
    expect(checkResponse(q("q-number"), ["5"]).correct).toBe(false);
    expect(parseNumber("1,200 m")).toBe(1200);
    expect(parseNumber("−0.5")).toBe(-0.5);
    expect(parseNumber("about 3")).toBeUndefined();
    expect(isAnswered(q("q-number"), ["three"])).toBe(false);
  });

  it("order and groups mark each position or item", () => {
    expect(checkResponse(q("q-order"), ["evap", "cond", "precip", "runoff"]).correct).toBe(true);
    expect(checkResponse(q("q-order"), ["cond", "evap", "precip", "runoff"])).toEqual({ correct: false, parts: [false, false, true, true] });
    expect(checkResponse(q("q-groups"), ["i1=up", "i2=up", "i3=down", "i4=down", "i5=down"]).parts).toEqual([true, true, true, true, false]);
    expect(isAnswered(q("q-groups"), ["i1=up"])).toBe(false);
  });

  it("written answers wait for a mark", () => {
    expect(checkResponse(q("q-written"), ["Heat makes it evaporate."])).toEqual({ correct: false, pending: true });
    expect(checkResponse(q("q-written"), ["Heat makes it evaporate.", "self:correct"]).correct).toBe(true);
    expect(expectedResponse(q("q-written"))).toEqual([q("q-written").sample]);
  });
});

describe("validation explains each kind", () => {
  const issues = (question: object) => {
    const r = defaultRegistry.validate({ schemaVersion: "1.0", type: "mcq", id: "m", questions: [{ id: "q", prompt: "P", ...question }] });
    return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
  };

  it("finds missing and misplaced parts", () => {
    expect(issues({ kind: "fill_blank", prompt: "The capital is ___ and ___.", blanks: [{ accept: ["Paris"] }] })).toEqual(["questions.0.blanks: The prompt has 2 blanks (___) but there are 1 entries in blanks"]);
    expect(issues({ kind: "fill_blank", prompt: "No blank here", blanks: [{ accept: ["x"] }] })).toEqual(["questions.0.prompt: Mark each blank in the prompt with ___ (three underscores)"]);
    expect(issues({ kind: "numeric" })).toEqual(['questions.0.answer: A "numeric" question needs an answer (value, optional tolerance and unit)']);
    expect(issues({ kind: "categorize", items: [{ id: "a", text: "A", group: "x" }, { id: "b", text: "B" }], groups: [{ id: "g", text: "G" }, { id: "h", text: "H" }] })).toEqual([
      'questions.0.items.0.group: No group has id "x"',
      "questions.0.items.1.group: Say which group this item belongs in",
    ]);
    expect(issues({ kind: "order", items: [{ id: "a", text: "A" }, { id: "b", text: "B" }], options: [{ id: "x", text: "X" }, { id: "y", text: "Y" }] })).toEqual(['questions.0.options: "options" doesn\'t apply to a "order" question']);
    expect(issues({ kind: "short_answer" })).toEqual(['questions.0.rubric: A "short_answer" question needs a rubric (the points a good answer covers)']);
    expect(issues({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct: ["a"] })).toEqual([]);
  });

  it("the example is valid", () => {
    const r = defaultRegistry.validate(water);
    expect(r.ok ? [] : r.issues).toEqual([]);
  });
});

describe("server grading for every kind", () => {
  const quiz = { ...spec, type: "quiz", id: "water-quiz" } as unknown as QuizSpec;
  const safe = redactQuiz(quiz);

  it("sends no answers to the browser, and order items arrive shuffled", () => {
    const text = JSON.stringify(safe);
    for (const leak of ["accept", "condensation", '"value"', "rubric", "sample", '"group"', "rationale"]) expect(text).not.toContain(leak);
    const order = safe.questions.find((x) => x.id === "q-order")!.items!.map((i) => i.id);
    expect(order).not.toEqual(["evap", "cond", "precip", "runoff"]);
    expect([...order].sort()).toEqual(["cond", "evap", "precip", "runoff"]);
    expect(defaultRegistry.validate(safe).ok).toBe(true);
  });

  it("grades on the server with the full quiz and reports what was right", () => {
    const result = gradeQuiz(quiz, {
      "q-blank": ["condensation", "rain"],
      "q-number": ["40"],
      "q-order": ["evap", "cond", "precip", "runoff"],
      "q-groups": ["i1=up"],
      "q-written": ["Because heat."],
      "q-choice": ["a"],
    });
    expect(result.results.map((r) => [r.questionId, r.correct])).toEqual([
      ["q-blank", true],
      ["q-number", false],
      ["q-order", true],
      ["q-groups", false],
      ["q-written", false],
      ["q-choice", true],
    ]);
    expect(result.results.find((r) => r.questionId === "q-written")!.pending).toBe(true);
    expect(result.results.find((r) => r.questionId === "q-number")!.expected).toEqual(["3 %"]);
  });
});

describe("answering in the page", () => {
  it("fill in the blank: marks each blank and reveals once right", () => {
    render(<Mcq questions={spec.questions} />);
    fireEvent.change(screen.getByLabelText("Blank 1 of 2"), { target: { value: "condensation" } });
    expect(screen.getByRole("button", { name: "Check answer" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Blank 2 of 2"), { target: { value: "snow" } });
    check();
    expect(feedback()).toContain("Not quite");
    expect(document.querySelectorAll(".ix-mark--right").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.change(screen.getByLabelText("Blank 1 of 2"), { target: { value: "Condensation" } });
    fireEvent.change(screen.getByLabelText("Blank 2 of 2"), { target: { value: "precipitation" } });
    check();
    expect(feedback()).toContain("Correct");
  });

  it("order: starts shuffled, arrows move items, and the right order is accepted", () => {
    render(<Mcq questions={[q("q-order")]} />);
    const texts = () => [...document.querySelectorAll(".ix-order__text")].map((n) => n.textContent);
    const wanted = ["Evaporation from the ocean", "Condensation into clouds", "Precipitation as rain or snow", "Runoff back to rivers and the sea"];
    expect(texts()).not.toEqual(wanted);
    // Bubble each item up to its place.
    wanted.forEach((text, target) => {
      while (texts().indexOf(text) > target) fireEvent.click(screen.getByRole("button", { name: `Move "${text}" up` }));
    });
    expect(texts()).toEqual(wanted);
    check();
    expect(feedback()).toContain("Correct");
  });

  it("groups: every item needs a group before checking", () => {
    render(<Mcq questions={[q("q-groups")]} />);
    const answers: Record<string, string> = { Evaporation: "Into the air", "Transpiration from plants": "Into the air", Snowfall: "Back to the ground", Hail: "Back to the ground" };
    for (const [item, group] of Object.entries(answers)) fireEvent.click(within(screen.getByRole("radiogroup", { name: item })).getByRole("radio", { name: group }));
    expect(screen.getByRole("button", { name: "Check answer" })).toHaveProperty("disabled", true);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sublimation from ice" })).getByRole("radio", { name: "Into the air" }));
    check();
    expect(feedback()).toContain("Correct");
  });

  it("written answers: shows the model answer, then the learner marks it", () => {
    render(<Mcq questions={[q("q-written")]} />);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "The Sun heats water so it evaporates." } });
    check();
    expect(screen.getByText(/The Sun's heat gives water molecules/)).toBeTruthy();
    expect(feedback()).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(feedback()).toContain("Correct");
  });

  it("a quiz with mixed kinds scores them, and written answers can be marked in review", () => {
    render(<Quiz questions={[q("q-number"), q("q-written")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Heat evaporates water." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));
    const confirm = screen.queryByRole("button", { name: /Submit anyway|Yes, submit/ });
    if (confirm) fireEvent.click(confirm);
    expect(screen.getByText(/Mark your answer/)).toBeTruthy();
    // The number was right; the written answer counts once marked.
    expect(document.querySelector(".ix-summary__percent")!.textContent).toBe("50%");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(document.querySelector(".ix-summary__percent")!.textContent).toBe("100%");
    expect(screen.queryByText(/Mark your answer/)).toBeNull();
  });
});

describe("fixing model slips in the new kinds", () => {
  it("leaves a valid spec alone and repairs loose ones", () => {
    expect(normalizeSpec(structuredClone(water))).toEqual(water);
    const loose = normalizeSpec({
      type: "mcq",
      questions: [
        { kind: "numeric", prompt: "2 + 2?", answer: 4 },
        { kind: "fill_blank", prompt: "The sky is ___.", answer: "blue" },
        { kind: "order", prompt: "Count up", items: ["one", "two", "three"] },
        { kind: "categorize", prompt: "Sort", groups: ["Fruit", "Veg"], items: [{ text: "Apple", group: "Fruit" }, { text: "Leek", group: "veg" }] },
        { kind: "short_answer", prompt: "Why?", rubric: "Because.", answer: "A model answer." },
      ],
    });
    const result = defaultRegistry.validate(loose);
    expect(result.ok ? [] : result.issues).toEqual([]);
    if (!result.ok) return;
    const [num, blank, order, groups, written] = (result.spec as McqSpec).questions;
    expect(num!.answer).toEqual({ value: 4 });
    expect(blank!.blanks).toEqual([{ accept: ["blue"] }]);
    expect(order!.items!.map((i) => i.text)).toEqual(["one", "two", "three"]);
    expect(groups!.items!.map((i) => i.group)).toEqual(["group-1", "group-2"]);
    expect(written!.sample).toBe("A model answer.");
  });
});

describe("learning loop: confidence and review rounds", () => {
  const two = [q("q-choice"), q("q-number")];
  const answerChoice = (id: string) => fireEvent.click(screen.getByRole("radio", { name: id }));

  it("records how sure the learner was and says so when it disagrees with the result", () => {
    const events: { type: string; confidence?: string }[] = [];
    render(<Mcq questions={two} onEvent={(e) => events.push(e)} />);
    fireEvent.click(screen.getByRole("button", { name: "Certain" }));
    answerChoice("Infiltration");
    check();
    expect(feedback()).toContain("You were certain");
    expect(events.find((e) => e.type === "question.answered")?.confidence).toBe("sure");
  });

  it("review round asks again only what was missed or guessed, and keeps the first-try score", () => {
    render(<Mcq questions={two} allowRetry={false} />);
    // 1: right but guessed.
    fireEvent.click(screen.getByRole("button", { name: "Guessing" }));
    answerChoice("Transpiration");
    check();
    expect(feedback()).toContain("you were guessing");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // 2: right and sure.
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "3" } });
    check();
    expect(document.querySelector(".ix-summary__percent")!.textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "Review the 1 that need it" }));
    expect(screen.getByText(/Review round/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Question \d/ })).toHaveLength(1);
    answerChoice("Transpiration");
    check();
    // The score is still the first-round one.
    expect(document.querySelector(".ix-summary__percent")!.textContent).toBe("100%");
    expect(screen.queryByRole("button", { name: /Review the/ })).toBeNull();
  });
});
