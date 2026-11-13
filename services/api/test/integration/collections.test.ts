/**
 * Research collections: clips kept per named collection, and documents written
 * strictly from them, with every unsupported sentence, missing citation and
 * made-up number flagged before anything is saved.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import {
  CollectionsService,
  flashcardsMarkdown,
  numbersIn,
  removeUnits,
  splitUnits,
} from "../../src/service/collections.service";
import { ComposeAiService } from "../../src/service/compose-ai.service";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { createHarness, statusOf, type Harness } from "./harness";

/** A stand-in for Claude: answers write_document and report_support from a script, recording what it was sent. */
class ScriptedAi extends ComposeAiService {
  sent: { tool: string; content: string }[] = [];
  constructor(
    private script: {
      markdown: string;
      title?: string;
      verdicts?: Record<
        number,
        "supported" | "inference" | "partial" | "unsupported"
      >;
    },
  ) {
    super();
  }
  override async anthropic() {
    const self = this;
    return {
      model: "test",
      client: {
        messages: {
          async create(params: {
            tools: { name: string }[];
            messages: { content: string }[];
          }) {
            const tool = params.tools[0]!.name;
            self.sent.push({ tool, content: params.messages[0]!.content });
            if (tool === "write_document")
              return {
                content: [
                  {
                    type: "tool_use",
                    name: tool,
                    input: {
                      title: self.script.title ?? "Draft",
                      markdown: self.script.markdown,
                    },
                  },
                ],
              };
            const ids = [
              ...params.messages[0]!.content.matchAll(/^(\d+)\. /gm),
            ].map((m) => Number(m[1]));
            const results = ids.map((id) => ({
              id,
              verdict: self.script.verdicts?.[id] ?? "supported",
              reason: self.script.verdicts?.[id]
                ? "Not what the clips say"
                : undefined,
            }));
            return {
              content: [{ type: "tool_use", name: tool, input: { results } }],
            };
          },
        },
      } as never,
    };
  }
}

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let tools: McpToolsService;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  tools = new McpToolsService(
    new WorkspaceMembersRepository(h.db),
    h.pages,
    h.canvases,
    h.projects,
    h.notebooks,
    h.noteMarkdown,
    h.canvasDiagrams,
    h.settings,
    h.shares,
    h.figures,
  );
});

const service = (script: ConstructorParameters<typeof ScriptedAi>[0]) => {
  const ai = new ScriptedAi(script);
  return { ai, collections: new CollectionsService(h.db, tools, ai) };
};

async function batteryCollection(collections: CollectionsService) {
  const c = await collections.create(alice.id, {
    workspaceId: alice.workspaceId,
    name: "Solid-state batteries",
  });
  await collections.addClip(alice.id, c.id, {
    content:
      "Solid-state cells replace the liquid electrolyte with a solid one, which is not flammable.",
    source: {
      app: "chatgpt",
      url: "https://chatgpt.com/c/abc",
      title: "Battery basics",
    },
  });
  await collections.addClip(alice.id, c.id, {
    content:
      "Prototype cells reach about 400 Wh/kg, roughly 1.5 times today's lithium-ion cells.",
    source: { app: "claude", title: "Energy density" },
  });
  return c;
}

describe("drafts", () => {
  it("split into sentences, list items and table rows with exact ranges, and lose flagged ones cleanly", () => {
    const md =
      "# Title\n\nFirst point [1]. Second point [2].\n\n- A bullet [1]\n- Another [2]\n\n| Item | Sources |\n| --- | --- |\n| Row one | [1] |\n| Row two | [2] |";
    const units = splitUnits(md);
    expect(units.map((u) => [u.text, u.cites])).toEqual([
      ["First point [1].", [1]],
      ["Second point [2].", [2]],
      ["A bullet [1]", [1]],
      ["Another [2]", [2]],
      ["| Row one | [1] |", [1]],
      ["| Row two | [2] |", [2]],
    ]);
    // Ranges cover the unit (a list item's whole line, bullet included), so removing it is exact.
    for (const u of units) expect(md.slice(u.start, u.end)).toContain(u.text);
    expect(removeUnits(md, [units[1]!, units[3]!, units[5]!])).toBe(
      "# Title\n\nFirst point [1].\n\n- A bullet [1]\n\n| Item | Sources |\n| --- | --- |\n| Row one | [1] |",
    );
  });

  it("compare numbers as written", () => {
    expect(numbersIn("about 1,200 cells, 3.50 V and 40% [2]")).toEqual([
      "1200",
      "3.50",
      "40",
    ]);
  });

  it("turn Q/A lists into a flashcards block", () => {
    expect(
      flashcardsMarkdown(
        "- Q: What replaces the liquid? | A: A solid electrolyte [1]",
      ),
    ).toContain('"front": "What replaces the liquid?"');
  });
});

describe("collections", () => {
  it("keep clips in order, and only their owner sees them", async () => {
    const { collections } = service({ markdown: "x" });
    const c = await batteryCollection(collections);
    const got = await collections.get(alice.id, c.id);
    expect(got.clips.map((x) => x.source.app)).toEqual(["chatgpt", "claude"]);
    await collections.reorder(alice.id, c.id, [
      got.clips[1]!.id,
      got.clips[0]!.id,
    ]);
    expect(
      (await collections.get(alice.id, c.id)).clips.map((x) => x.source.app),
    ).toEqual(["claude", "chatgpt"]);
    expect(
      (await collections.list(alice.id, alice.workspaceId))[0],
    ).toMatchObject({ name: "Solid-state batteries", clips: 2 });
    expect(await statusOf(collections.get(bob.id, c.id))).toBe(404);
    expect(
      await statusOf(collections.addClip(bob.id, c.id, { content: "x" })),
    ).toBe(404);
    expect(
      await statusOf(collections.removeClip(bob.id, got.clips[0]!.id)),
    ).toBe(404);
    expect(await statusOf(collections.list(bob.id, alice.workspaceId))).toBe(
      404,
    );
  });

  it("write only from the clips, and flag unsupported claims, missing citations and made-up numbers", async () => {
    const { ai, collections } = service({
      title: "Solid-state batteries",
      markdown: [
        "Solid-state cells use a solid electrolyte that is not flammable [1].",
        "Prototypes reach about 400 Wh/kg [2].",
        "They will be in every car by 2030 [2].",
        "Charging takes 10 minutes [1].",
        "They are the future.",
      ].join(" "),
      verdicts: { 3: "unsupported", 4: "unsupported" },
    });
    const c = await batteryCollection(collections);
    const draft = await collections.compose(alice.id, c.id, {
      mode: "summary",
    });

    // Only the clips went to the writer, numbered, with their sources.
    expect(ai.sent[0]!.content).toContain(
      '<clip n="1" source="ChatGPT: Battery basics">',
    );
    expect(ai.sent[0]!.content).toContain("Make: A concise summary");
    expect(draft.units.map((u) => u.status)).toEqual([
      "ok",
      "ok",
      "flagged",
      "flagged",
      "flagged",
    ]);
    expect(draft.units[2]!.reasons).toEqual([
      "Not what the clips say",
      "2030 isn't in the cited clips",
    ]);
    expect(draft.units[4]!.reasons).toContain("No citation");
    expect(draft.sources).toBe(
      "## Sources\n\n1. [ChatGPT: Battery basics](https://chatgpt.com/c/abc)\n2. Claude: Energy density",
    );

    // Saving after removing the flagged sentences gives a note with only supported text and its sources.
    const body = removeUnits(
      draft.body,
      draft.units.filter((u) => u.status === "flagged"),
    );
    const note = await collections.save(alice.id, c.id, {
      title: draft.title,
      body,
      sources: draft.sources,
      mode: "summary",
    });
    const text = (await tools.fetch(alice.id, note.id)).text;
    expect(text).toContain("400 Wh/kg");
    expect(text).not.toContain("2030");
    expect(text).toContain("## Sources");
  });

  it("make anything you describe, and need clips to do it", async () => {
    const { ai, collections } = service({
      markdown: "Decision: wait for 2028 production [2].",
    });
    const empty = await collections.create(alice.id, {
      workspaceId: alice.workspaceId,
      name: "Empty",
    });
    expect(
      await statusOf(
        collections.compose(alice.id, empty.id, { mode: "summary" }),
      ),
    ).toBe(400);
    const c = await batteryCollection(collections);
    expect(
      await statusOf(collections.compose(alice.id, c.id, { mode: "custom" })),
    ).toBe(400);
    await collections.compose(alice.id, c.id, {
      mode: "custom",
      instructions: "A decision memo for my manager",
    });
    expect(ai.sent[0]!.content).toContain(
      "Make: A decision memo for my manager",
    );
  });

  it("show conclusions reasoned from the clips as such, but still catch new facts in them", async () => {
    const { collections } = service({
      markdown:
        "Prototypes reach about 400 Wh/kg [2]. Don't wait. Wait until 2031, when prices halve [2].",
      verdicts: { 2: "inference", 3: "inference" },
    });
    const c = await batteryCollection(collections);
    const draft = await collections.compose(alice.id, c.id, {
      mode: "custom",
      instructions: "A decision memo",
    });
    // An uncited conclusion is fine; one that brings in a new number is still flagged.
    expect(draft.units.map((u) => [u.verdict, u.status])).toEqual([
      ["supported", "ok"],
      ["inference", "ok"],
      ["inference", "flagged"],
    ]);
    expect(draft.units[2]!.reasons).toEqual(["2031 isn't in the cited clips"]);
  });

  it("save flashcards as a flashcards block", async () => {
    const { collections } = service({
      markdown:
        "- Q: What does a solid-state cell replace? | A: The liquid electrolyte [1]",
    });
    const c = await batteryCollection(collections);
    const draft = await collections.compose(alice.id, c.id, {
      mode: "flashcards",
    });
    const note = await collections.save(alice.id, c.id, {
      title: "Cards",
      body: draft.body,
      sources: draft.sources,
      mode: "flashcards",
    });
    expect((await tools.fetch(alice.id, note.id)).text).toContain(
      "```flashcards",
    );
  });
});
