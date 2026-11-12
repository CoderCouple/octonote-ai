import { describe, expect, it } from "vitest";
import { defaultRegistry, normalizeSpec, outlineToMindmap, outlineToMindmapNodes, parseModelOutput } from "../src/index.js";

const valid = (input: unknown) => {
  const result = defaultRegistry.validate(normalizeSpec(input));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec as any;
};

describe("normalizeSpec", () => {
  it("fills in missing versions and ids", () => {
    const spec = valid({ type: "flashcards", cards: [{ front: "a", back: "b" }, { question: "c", answer: "d" }] });
    expect(spec).toMatchObject({ schemaVersion: "1.0", id: "activity-1", cards: [{ id: "card-1" }, { id: "card-2", front: "c", back: "d" }] });
  });

  it("turns string options and index answers into ids", () => {
    const spec = valid({
      type: "mcq",
      questions: [
        { question: "Two plus two?", options: ["3", "4"], correctIndex: 1 },
        { prompt: "Pick the even ones", kind: "multiple", options: ["1", "2", "4"], correct: [1, "4"] },
      ],
    });
    expect(spec.questions[0]).toMatchObject({ id: "q1", prompt: "Two plus two?", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correct: ["b"] });
    expect(spec.questions[1].correct).toEqual(["b", "c"]);
  });

  it("accepts answers written as option text", () => {
    const spec = valid({ type: "quiz", questions: [{ prompt: "Capital of France?", options: ["Paris", "Rome"], answer: "paris" }] });
    expect(spec.questions[0].correct).toEqual(["a"]);
  });

  it("builds true/false questions from a boolean answer", () => {
    const spec = valid({ type: "quiz", questions: [{ prompt: "Bile is an enzyme.", answer: false }] });
    expect(spec.questions[0]).toMatchObject({ kind: "true_false", options: [{ id: "true" }, { id: "false" }], correct: ["false"] });
  });

  it("flattens nested mind map trees", () => {
    const spec = valid({ type: "mindmap", root: { topic: "Cells", children: [{ topic: "Nucleus" }, { name: "Membrane", children: [{ label: "Lipids" }] }] } });
    expect(spec.nodes).toEqual([
      { id: "n1", label: "Cells" },
      { id: "n2", label: "Nucleus", parent: "n1" },
      { id: "n3", label: "Membrane", parent: "n1" },
      { id: "n4", label: "Lipids", parent: "n3" },
    ]);
  });

  it("renames matching aliases and normalises every activity in a session", () => {
    const spec = valid({ type: "session", title: "Mixed", activities: [{ type: "matching", pairs: [{ term: "H2O", definition: "Water" }, { term: "NaCl", definition: "Salt" }] }] });
    expect(spec).toMatchObject({ id: "session", activities: [{ id: "activity-1", pairs: [{ id: "pair-1", left: "H2O", right: "Water" }, { id: "pair-2" }] }] });
  });

  it("leaves what it can't fix for the validator", () => {
    const result = defaultRegistry.validate(normalizeSpec({ type: "mcq", questions: [{ prompt: "?", options: ["a", "b"], correct: ["z"] }] }));
    expect(result.ok || result.issues[0]!.message).toBe('No option has id "z"');
  });

  it("is used by parseModelOutput unless turned off", () => {
    const reply = '```json\n{"type":"flashcards","cards":[{"front":"a","back":"b"}]}\n```';
    expect(parseModelOutput(reply).ok).toBe(true);
    expect(parseModelOutput(reply, defaultRegistry, { normalize: false }).ok).toBe(false);
  });
});

describe("true/false questions", () => {
  it("must have exactly the true and false options", () => {
    const result = defaultRegistry.validate({
      schemaVersion: "1.0",
      type: "quiz",
      id: "q",
      questions: [{ id: "q1", prompt: "?", kind: "true_false", options: [{ id: "yes", text: "Yes" }, { id: "no", text: "No" }], correct: ["yes"] }],
    });
    expect(result.ok || result.issues[0]!.path).toBe("questions.0.options");
  });
});

describe("outlines to mind maps", () => {
  it("reads headings and nested lists", () => {
    const outline = "# Digestion\n## Organs\n- Stomach\n  - Acid\n- **Liver**\n## Processes\n1. Absorption";
    const labels = (nodes: ReturnType<typeof outlineToMindmapNodes>) => nodes.map((n) => `${n.label}<${n.parent ? nodes.find((p) => p.id === n.parent)!.label : ""}`);
    expect(labels(outlineToMindmapNodes(outline))).toEqual(["Digestion<", "Organs<Digestion", "Stomach<Organs", "Acid<Stomach", "Liver<Organs", "Processes<Digestion", "Absorption<Processes"]);
  });

  it("adds a central topic when there are several top lines, and never skips levels", () => {
    const nodes = outlineToMindmapNodes("- One\n      - Deep\n- Two", "Numbers");
    expect(nodes.map((n) => [n.label, n.parent])).toEqual([
      ["Numbers", undefined],
      ["One", "n1"],
      ["Deep", "n2"],
      ["Two", "n1"],
    ]);
  });

  it("produces a valid spec, directly or through normalizeSpec", () => {
    expect(defaultRegistry.validate(outlineToMindmap("# A\n- B\n- C", { id: "m", title: "Letters" })).ok).toBe(true);
    expect(valid({ type: "mindmap", title: "Letters", outline: "- B\n- C" }).nodes[0]).toEqual({ id: "n1", label: "Letters" });
  });
});
