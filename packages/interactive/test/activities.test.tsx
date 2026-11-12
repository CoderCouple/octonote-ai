import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gradeQuiz, redactQuiz, type FlashcardsSpec, type ActivityEvent, type MatchingSpec, type McqSpec, type MindmapSpec, type QuizSpec } from "../src/index.js";
import { InteractiveProvider, InteractiveRenderer } from "../src/index.js";
import digestive from "../examples/digestive-system.json" with { type: "json" };
import { defaultComponents, Flashcards, Matching, Mcq, Mindmap, Quiz } from "../src/index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const find = <T,>(type: string) => digestive.activities.find((a) => a.type === type) as unknown as T;
const deck = find<FlashcardsSpec>("flashcards");
const practice = find<McqSpec>("mcq");
const quiz = find<QuizSpec>("quiz");
const map = find<MindmapSpec>("mindmap");
const matching = find<MatchingSpec>("matching");

const eventTypes = (handler: ReturnType<typeof vi.fn>) => handler.mock.calls.map(([e]) => (e as ActivityEvent).type);

describe("Flashcards", () => {
  const cards = deck.cards.slice(0, 2);

  it("flips, marks and completes with a score", async () => {
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    render(<Flashcards id="deck" cards={cards} onEvent={onEvent} onComplete={onComplete} />);
    expect(screen.getByText("Card 1 of 2")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Peristalsis\. Press to see the answer/ }));
    await userEvent.click(screen.getByRole("button", { name: /I know this/ }));
    expect(screen.getByText("Card 2 of 2")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    await userEvent.click(screen.getByRole("button", { name: /Still learning/ }));
    expect(onComplete).toHaveBeenCalledWith({ earned: 1, possible: 2, percent: 50 });
    expect(eventTypes(onEvent)).toEqual(["activity.started", "card.flipped", "card.marked", "card.flipped", "card.marked", "activity.completed"]);
    expect(screen.getByRole("status").textContent).toContain("50%");
  });

  it("reviews only the cards still being learned", async () => {
    render(<Flashcards cards={cards} defaultState={{ order: ["c1", "c2"], index: 1, flipped: true, marks: { c1: true }, reviews: {} }} />);
    await userEvent.click(screen.getByRole("button", { name: /Still learning/ }));
    await userEvent.click(screen.getByRole("button", { name: "Review the 1 still learning" }));
    expect(screen.getByText("Card 1 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salivary amylase/ })).toBeTruthy();
  });

  it("works from the keyboard", async () => {
    render(<Flashcards cards={cards} />);
    const region = screen.getByRole("region", { name: "Flashcards" });
    fireEvent.keyDown(region, { key: "f" });
    expect(screen.getByRole("button", { name: /^Answer:/ })).toBeTruthy();
    fireEvent.keyDown(region, { key: "k" });
    expect(screen.getByText("Card 2 of 2")).toBeTruthy();
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(screen.getByText("Card 1 of 2")).toBeTruthy();
  });

  it("schedules spaced repetition", async () => {
    const onStateChange = vi.fn();
    render(<Flashcards cards={cards} spacedRepetition onStateChange={onStateChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    await userEvent.click(screen.getByRole("button", { name: /I know this/ }));
    const last = onStateChange.mock.calls.at(-1)![0];
    expect(last.reviews.c1).toMatchObject({ box: 1, reviews: 1 });
  });

  it("can be controlled from outside", async () => {
    const onStateChange = vi.fn();
    const state = { order: ["c1", "c2"], index: 0, flipped: false, marks: {}, reviews: {} };
    render(<Flashcards cards={cards} state={state} onStateChange={onStateChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ flipped: true }));
    // The parent didn't pass the new state back, so the card stays on its front.
    expect(screen.getByRole("button", { name: /Show answer/ })).toBeTruthy();
  });
});

describe("Mcq", () => {
  it("checks answers, explains wrong ones and allows a retry", async () => {
    const onComplete = vi.fn();
    render(<Mcq questions={practice.questions.slice(0, 1)} onComplete={onComplete} />);
    await userEvent.click(screen.getByRole("radio", { name: /Stomach/ }));
    await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByText(/Have another look/)).toBeTruthy();
    expect(screen.getByText(/starts protein digestion, not starch/)).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith({ earned: 0, possible: 1, percent: 0 });

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await userEvent.click(screen.getByRole("radio", { name: /Mouth/ }));
    await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByText("Correct!")).toBeTruthy();
  });

  it("supports several correct answers and hints", async () => {
    const onEvent = vi.fn();
    render(<Mcq questions={practice.questions} onEvent={onEvent} defaultState={{ index: 1, answers: {}, hints: {}, completed: false }} />);
    for (const name of [/Liver/, /Pancreas/, /Gallbladder/]) await userEvent.click(screen.getByRole("checkbox", { name }));
    await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByText("Correct!")).toBeTruthy();
    expect(screen.getByText(/food never passes through them/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Question 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByText("Think about what saliva contains.")).toBeTruthy();
    expect(eventTypes(onEvent)).toContain("hint.shown");
  });
});

describe("Quiz", () => {
  const answerAll = async (choices: RegExp[]) => {
    for (const [i, choice] of choices.entries()) {
      await userEvent.click(screen.getAllByRole("radio").find((r) => choice.test(r.closest("label")!.textContent!)) ?? screen.getByRole("checkbox", { name: choice }));
      if (i < choices.length - 1) await userEvent.click(screen.getByRole("button", { name: "Next" }));
    }
  };

  it("grades on submit and shows the review", async () => {
    const onComplete = vi.fn();
    render(<Quiz questions={quiz.questions.slice(0, 2)} passingPercent={75} onComplete={onComplete} />);
    await userEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await answerAll([/Pepsin/, /Digests starch/]);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onComplete).toHaveBeenCalledWith({ earned: 1, possible: 2, percent: 50, passed: false });
    expect(screen.getByRole("status").textContent).toContain("Not passed yet");
    expect(screen.getByText(/Question 2 · Incorrect/)).toBeTruthy();
    expect(screen.getByText(/emulsifies fat/)).toBeTruthy();
  });

  it("asks before submitting with unanswered questions", async () => {
    render(<Quiz questions={quiz.questions} />);
    await userEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Question 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("4 questions are unanswered");
    await userEvent.click(screen.getByRole("button", { name: "Keep answering" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("submits by itself when time runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onComplete = vi.fn();
    render(<Quiz questions={quiz.questions.slice(0, 1)} timeLimitSeconds={10} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    expect(screen.getByRole("timer").textContent).toBe("0:10");
    await act(async () => vi.advanceTimersByTime(11_000));
    expect(onComplete).toHaveBeenCalledWith({ earned: 0, possible: 1, percent: 0 });
  });

  it("sends server-graded quizzes to the grader and never sees the answers", async () => {
    const safe = redactQuiz(quiz);
    const grader = vi.fn(async ({ responses }) => gradeQuiz(quiz, responses));
    render(
      <InteractiveProvider components={defaultComponents} grader={grader}>
        <InteractiveRenderer spec={safe} />
      </InteractiveProvider>,
    );
    expect(JSON.stringify(safe)).not.toContain("correct");
    await userEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await userEvent.click(screen.getByRole("radio", { name: /Pepsin/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit anyway" }));
    expect(grader).toHaveBeenCalledWith({ activityId: "check", responses: { q1: ["b"] } });
    expect(await screen.findByText("25%")).toBeTruthy();
  });

  it("explains when grading fails and lets the learner try again", async () => {
    const grader = vi.fn().mockRejectedValueOnce(new Error("Network down")).mockImplementation(async ({ responses }) => gradeQuiz(quiz, responses));
    render(<Quiz questions={redactQuiz(quiz).questions} grading="server" grader={grader} />);
    await userEvent.click(screen.getByRole("button", { name: "Start quiz" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit anyway" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Network down");
    await userEvent.click(screen.getByRole("button", { name: "Try submitting again" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit anyway" }));
    expect(await screen.findByText("0%")).toBeTruthy();
  });
});

describe("Matching", () => {
  const pairs = matching.pairs.slice(0, 3);
  const left = () => within(screen.getByRole("list", { name: "Items" }));
  const right = () => within(screen.getByRole("list", { name: "Matches" }));

  it("matches pairs, counts mistakes and completes", async () => {
    const onComplete = vi.fn();
    render(<Matching pairs={pairs} onComplete={onComplete} />);
    await userEvent.click(left().getByRole("button", { name: "Stomach" }));
    expect(left().getByRole("button", { name: "Stomach" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(right().getByRole("button", { name: "Absorbs water" }));
    expect(screen.getByText("1 mistake")).toBeTruthy();

    for (const pair of pairs) {
      await userEvent.click(right().getByRole("button", { name: pair.right }));
      await userEvent.click(left().getByRole("button", { name: pair.left }));
    }
    expect(screen.getByText("3 of 3 matched")).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith({ earned: 2, possible: 3, percent: 67 });
  });

  it("stops the round after too many mistakes", async () => {
    render(<Matching pairs={pairs} maxMistakes={1} />);
    await userEvent.click(left().getByRole("button", { name: "Stomach" }));
    await userEvent.click(right().getByRole("button", { name: "Absorbs water" }));
    expect(screen.getByRole("alert").textContent).toContain("Too many wrong matches");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText(/^0 mistakes/)).toBeTruthy();
  });
});

describe("Mindmap", () => {
  it("is a navigable tree that expands and collapses from the keyboard", async () => {
    const onEvent = vi.fn();
    render(<Mindmap nodes={map.nodes} onEvent={onEvent} />);
    const tree = screen.getByRole("tree");
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(map.nodes.length);
    const root = within(tree).getByRole("treeitem", { name: "Digestive system" });
    expect(root.getAttribute("tabindex")).toBe("0");

    root.focus();
    fireEvent.keyDown(root, { key: "ArrowDown" });
    const tract = within(tree).getByRole("treeitem", { name: "Digestive tract" });
    expect(document.activeElement).toBe(tract);
    fireEvent.keyDown(tract, { key: "ArrowLeft" });
    expect(tract.getAttribute("aria-expanded")).toBe("false");
    expect(within(tree).queryByRole("treeitem", { name: "Mouth" })).toBeNull();
    fireEvent.keyDown(tract, { key: "ArrowRight" });
    expect(within(tree).getByRole("treeitem", { name: "Mouth" })).toBeTruthy();
    expect(eventTypes(onEvent)).toEqual(["activity.started", "activity.completed", "node.toggled", "node.toggled"]);
  });

  it("shows the selected node's note", async () => {
    render(<Mindmap nodes={map.nodes} />);
    const stomach = screen.getByRole("treeitem", { name: "Stomach" });
    fireEvent.focus(stomach);
    expect(screen.getByText("Churns food with acid and pepsin to make chyme.")).toBeTruthy();
  });

  it("renames nodes when editable, and Escape cancels", async () => {
    const onEvent = vi.fn();
    render(<Mindmap nodes={map.nodes} editable onEvent={onEvent} />);
    const liver = screen.getByRole("treeitem", { name: "Liver" });
    fireEvent.keyDown(liver, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "Rename Liver" });
    await userEvent.clear(input);
    await userEvent.type(input, "Liver (makes bile){Enter}");
    expect(screen.getByRole("treeitem", { name: "Liver (makes bile)" })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("treeitem", { name: "Pancreas" }), { key: "F2" });
    await userEvent.type(screen.getByRole("textbox", { name: "Rename Pancreas" }), " oops{Escape}");
    expect(screen.getByRole("treeitem", { name: "Pancreas" })).toBeTruthy();
    expect(onEvent.mock.calls.filter(([e]) => e.type === "node.edited")).toHaveLength(1);
  });

  it("starts big maps collapsed and completes once every node was shown", () => {
    const nodes = [{ id: "r", label: "Root" }, ...Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, parent: i < 5 ? "r" : `n${i % 5}` }))];
    const onComplete = vi.fn();
    render(<Mindmap nodes={nodes} onComplete={onComplete} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(6);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(51);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("the full example session", () => {
  it("renders every activity through the default components", async () => {
    render(
      <InteractiveProvider components={defaultComponents}>
        <InteractiveRenderer spec={digestive} />
      </InteractiveProvider>,
    );
    for (const [title, check] of [
      ["Key terms", () => screen.getByText("Card 1 of 6")],
      ["How the parts fit together", () => screen.getByRole("tree")],
      ["Organs and their jobs", () => screen.getByText("Match each organ to its main job.")],
      ["Practice questions", () => screen.getByText("Where does chemical digestion of starch begin?")],
      ["Final check", () => screen.getByRole("button", { name: "Start quiz" })],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
      expect(check()).toBeTruthy();
    }
  });
});
