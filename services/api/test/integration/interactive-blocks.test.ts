/**
 * Interactive blocks in notes (widgets, quizzes, flashcards…): assistants and
 * the CLI write them as ```kind fences; invalid ones are refused with the
 * reason, while editor autosaves turn them into code blocks so saving never
 * gets stuck.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
});

const quiz = { questions: [{ id: "q1", prompt: "2 + 2?", options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correct: ["a"] }] };
const fence = (kind: string, spec: unknown) => `\`\`\`${kind}\n${JSON.stringify(spec, null, 2)}\n\`\`\``;

describe("interactive blocks", () => {
  it("are stored from markdown and read back as fences", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Maths", markdown: `Try this:\n\n${fence("quiz", quiz)}` }, alice.id);
    const blocks = (page.document as { blocks: { type: string; props: Record<string, string> }[] }).blocks;
    const block = blocks.find((b) => b.type === "interactive")!;
    expect(block.props.kind).toBe("quiz");
    expect(JSON.parse(block.props.spec)).toEqual(quiz);
    expect((await h.noteMarkdown.read(page.id, alice.id)).markdown).toContain("```quiz");
  });

  it("are refused from markdown when invalid, with the reason", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Maths", markdown: "Start" }, alice.id);
    const broken = { questions: [{ ...quiz.questions[0], correct: ["z"] }] };
    const attempt = h.noteMarkdown.append(page.id, fence("quiz", broken), alice.id);
    expect(await statusOf(attempt)).toBe(422);
    expect(String((await attempt.catch((e) => e)).message)).toContain('No option has id "z"');
  });

  it("refuse widgets whose formulas use unknown names", async () => {
    const widget = {
      title: "Growth",
      inputs: [{ kind: "slider", id: "rate", label: "Rate", min: 0, max: 10, value: 5 }],
      views: [{ type: "stats", items: [{ label: "Value", value: "1000 * (1 + ratee/100)" }] }],
    };
    const attempt = h.noteMarkdown.create(alice.workspaceId, { title: "W", markdown: fence("widget", widget) }, alice.id);
    expect(await statusOf(attempt)).toBe(422);
    expect(String((await attempt.catch((e) => e)).message)).toContain('Unknown name "ratee"');
  });

  it("are turned into code blocks on autosave when invalid, keeping their JSON", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Draft", markdown: "Start" }, alice.id);
    const document = {
      blocks: [
        { id: "ok", type: "interactive", props: { kind: "quiz", spec: JSON.stringify(quiz) }, children: [] },
        { id: "bad", type: "interactive", props: { kind: "quiz", spec: '{"questions": []' }, children: [] },
      ],
    };
    const saved = await h.pages.update(page.id, { document }, alice.id);
    const blocks = (saved.document as { blocks: { id: string; type: string; props: Record<string, string>; content?: { text: string }[] }[] }).blocks;
    expect(blocks.map((b) => `${b.id}:${b.type}`)).toEqual(["ok:interactive", "bad:codeBlock"]);
    expect(blocks[1]!.props.language).toBe("quiz");
    expect(blocks[1]!.content![0]!.text).toBe('{"questions": []');
  });
});

describe("the connector's format tool", () => {
  it("gives agents example fences that the API accepts, for every kind", async () => {
    const { ComposeAiService } = await import("../../src/service/compose-ai.service");
    const ai = new ComposeAiService();
    const listing = (await ai.format()) as { kinds: { kind: string }[] };
    expect(listing.kinds.map((k) => k.kind)).toEqual(["widget", "flashcards", "mcq", "quiz", "mindmap", "matching", "scene", "custom"]);
    const fences = await Promise.all(listing.kinds.map(async (k) => ((await ai.format(k.kind)) as { fence: string }).fence));
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "All kinds", markdown: fences.join("\n\n") }, alice.id);
    const types = (page.document as { blocks: { type: string }[] }).blocks.filter((b) => b.type === "interactive");
    expect(types).toHaveLength(8);
  });
});
