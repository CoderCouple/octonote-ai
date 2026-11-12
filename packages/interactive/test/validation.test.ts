import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createRegistry, defaultRegistry, LIMITS, parseModelOutput, parseSpec, type SessionSpec } from "../src/index.js";
import example from "../examples/digestive-system.json" with { type: "json" };

const digestive: any = example;


const clone = <T>(value: T): T => structuredClone(value);
const activity = (type: string) => clone(digestive.activities.find((a: { type: string }) => a.type === type));

function issuesOf(input: unknown) {
  const result = defaultRegistry.validate(input);
  if (result.ok) throw new Error("expected the spec to be invalid");
  return result.issues;
}

describe("the example session", () => {
  it("is valid and keeps every activity", () => {
    const result = defaultRegistry.validate(digestive);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.spec as SessionSpec).activities.map((a) => a.type)).toEqual(["flashcards", "mindmap", "matching", "mcq", "quiz"]);
  });

  it("drops keys the schema doesn't know", () => {
    const spec = { ...activity("flashcards"), onClick: "alert(1)" };
    const result = defaultRegistry.validate(spec);
    expect(result.ok && "onClick" in result.spec).toBe(false);
  });
});

describe("malformed input", () => {
  it.each([null, 42, "text", [1, 2]])("rejects %j without throwing", (input) => {
    expect(issuesOf(input)).toEqual([{ path: "", message: "Expected an object" }]);
  });

  it("names unknown types", () => {
    const [issue] = issuesOf({ schemaVersion: "1.0", type: "crossword", id: "x" });
    expect(issue).toMatchObject({ path: "type" });
    expect(issue!.message).toContain("flashcards");
  });

  it("refuses another major version", () => {
    expect(issuesOf({ ...activity("flashcards"), schemaVersion: "2.0" })[0]!.path).toBe("schemaVersion");
    expect(defaultRegistry.validate({ ...activity("flashcards"), schemaVersion: "1.4" }).ok).toBe(true);
  });

  it("points into the failing activity of a session", () => {
    const session = clone(digestive);
    session.activities[3].questions[0].correct = ["z"];
    expect(issuesOf(session)).toEqual([{ path: "activities.3.questions.0.correct.0", message: 'No option has id "z"' }]);
  });

  it("refuses nested sessions and duplicate activity ids", () => {
    const session = clone(digestive);
    session.activities.push({ ...clone(digestive) }, activity("mcq"));
    const paths = issuesOf(session).map((i) => i.path);
    expect(paths).toEqual(["activities.5.type", "activities.6.id"]);
  });

  it("enforces size limits", () => {
    const deck = activity("flashcards");
    deck.cards[0].back = "x".repeat(LIMITS.textLength + 1);
    expect(issuesOf(deck)[0]!.path).toBe("cards.0.back");
    deck.cards = Array.from({ length: LIMITS.cards + 1 }, (_, i) => ({ id: `c${i}`, front: "a", back: "b" }));
    expect(issuesOf(deck)[0]!.path).toBe("cards");
  });

  it("refuses unsafe ids", () => {
    const deck = activity("flashcards");
    deck.cards[0].id = "<script>";
    expect(issuesOf(deck)[0]!.path).toBe("cards.0.id");
  });
});

describe("questions", () => {
  it("needs exactly one answer for single questions", () => {
    const mcq = activity("mcq");
    mcq.questions[0].correct = ["a", "b"];
    expect(issuesOf(mcq)[0]!.message).toContain("exactly one");
  });

  it("needs answers unless graded on the server", () => {
    const quiz = activity("quiz");
    delete quiz.questions[0].correct;
    expect(issuesOf(quiz)[0]!.path).toBe("questions.0.correct");
  });

  it("refuses answers in a server-graded quiz", () => {
    const quiz = { ...activity("quiz"), grading: "server" };
    const paths = issuesOf(quiz).map((i) => i.path);
    expect(paths).toContain("questions.0.correct");
    expect(paths).toContain("questions.0.explanation");
  });
});

describe("mind maps", () => {
  const node = (id: string, parent?: string) => ({ id, label: id, ...(parent ? { parent } : {}) });
  const map = (nodes: object[]) => ({ schemaVersion: "1.0", type: "mindmap", id: "m", nodes });

  it("needs exactly one root", () => {
    expect(issuesOf(map([node("a"), node("b")]))[0]!.message).toContain("found 2");
  });

  it("catches missing parents and cycles", () => {
    const messages = issuesOf(map([node("root"), node("a", "b"), node("b", "a"), node("c", "nope")])).map((i) => i.message);
    expect(messages).toContain('No node has id "nope"');
    expect(messages).toContain("Parents form a cycle");
  });

  it("limits depth", () => {
    const nodes = [node("n0"), ...Array.from({ length: LIMITS.mindmapDepth + 1 }, (_, i) => node(`n${i + 1}`, `n${i}`))];
    expect(issuesOf(map(nodes)).at(-1)!.message).toContain("Deeper than");
  });
});

describe("matching", () => {
  it("refuses two identical answers", () => {
    const matching = activity("matching");
    matching.pairs[1].right = matching.pairs[0].right.toUpperCase();
    expect(issuesOf(matching)[0]!.path).toBe("pairs.1.right");
  });
});

describe("custom activities", () => {
  const poll = {
    type: "poll",
    version: "1.0",
    description: "A one-question poll.",
    schema: z.object({ schemaVersion: z.string(), type: z.literal("poll"), id: z.string(), question: z.string() }),
  };

  it("validates registered types, including inside sessions", () => {
    const registry = defaultRegistry.extend(poll);
    const spec = { schemaVersion: "1.0", type: "poll", id: "p", question: "Tea or coffee?" };
    expect(registry.validate(spec).ok).toBe(true);
    expect(registry.validate({ ...clone(digestive), activities: [spec] }).ok).toBe(true);
    expect(defaultRegistry.validate(spec).ok).toBe(false);
  });

  it("refuses duplicate and reserved types", () => {
    expect(() => defaultRegistry.extend({ ...poll, type: "quiz" })).toThrow("already registered");
    expect(() => createRegistry([{ ...poll, type: "session" }])).toThrow("reserved");
  });
});

describe("parsing text", () => {
  it("reads fenced JSON from a model reply", () => {
    const reply = "Here you go:\n```json\n" + JSON.stringify(activity("matching")) + "\n```\nEnjoy!";
    expect(parseModelOutput(reply).ok).toBe(true);
  });

  it("reports bad JSON and missing JSON as issues", () => {
    expect(parseSpec("{nope").ok).toBe(false);
    expect(parseModelOutput("Sorry, I can't help.")).toEqual({ ok: false, issues: [{ path: "", message: "No JSON object in the reply" }] });
  });

  it("refuses oversized text before parsing", () => {
    const result = parseSpec(" ".repeat(LIMITS.jsonLength + 1));
    expect(result.ok || result.issues[0]!.message).toContain("longer than");
  });
});
