/**
 * The in-app AI chat with a scripted model: it reads what was mentioned with
 * the person's own access, streams text, shows checked blocks, turns changes
 * into proposals that run only when applied, and keeps threads private.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import {
  ChatService,
  outlineText,
  type ChatEvent,
} from "../../src/service/chat.service";
import { ComposeAiService } from "../../src/service/compose-ai.service";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { createHarness, statusOf, type Harness } from "./harness";

type Round = {
  text?: string;
  tools?: { name: string; input: Record<string, unknown> }[];
};

/** A stand-in for Claude: each call plays the next scripted round and records what it was sent. */
class ScriptedAi extends ComposeAiService {
  calls: { messages: { role: string; content: unknown }[] }[] = [];
  constructor(private rounds: Round[]) {
    super();
  }
  override async anthropic() {
    const self = this;
    return {
      model: "test",
      client: {
        messages: {
          stream(params: { messages: { role: string; content: unknown }[] }) {
            self.calls.push({ messages: structuredClone(params.messages) });
            const round = self.rounds.shift() ?? { text: "(no more script)" };
            const listeners: ((t: string) => void)[] = [];
            return {
              on: (_: string, cb: (t: string) => void) => listeners.push(cb),
              abort: () => {},
              finalMessage: async () => {
                if (round.text)
                  for (const word of round.text.split(/(?<= )/))
                    listeners.forEach((cb) => cb(word));
                const tools = (round.tools ?? []).map((t, i) => ({
                  type: "tool_use",
                  id: `tu_${self.calls.length}_${i}`,
                  name: t.name,
                  input: t.input,
                }));
                return {
                  content: [
                    ...(round.text ? [{ type: "text", text: round.text }] : []),
                    ...tools,
                  ],
                  stop_reason: tools.length ? "tool_use" : "end_turn",
                };
              },
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

const chat = (rounds: Round[]) => {
  const ai = new ScriptedAi(rounds);
  return {
    ai,
    service: new ChatService(
      h.db,
      tools,
      ai,
      h.pages,
      h.canvases,
      h.projects,
      h.figures,
    ),
  };
};

async function run(
  service: ChatService,
  userId: string,
  input: Parameters<ChatService["send"]>[1],
) {
  const events: ChatEvent[] = [];
  await service.send(userId, input, (e) => events.push(e));
  return events;
}

const WIDGET = {
  title: "Doubling",
  inputs: [
    {
      kind: "slider",
      id: "rate",
      label: "Rate",
      min: 1,
      max: 20,
      value: 7,
      format: { suffix: "%" },
    },
  ],
  values: [{ name: "years", formula: "72 / rate" }],
  views: [
    {
      type: "stats",
      items: [
        { label: "Years to double", value: "years", format: { decimals: 1 } },
      ],
    },
  ],
};

describe("chat", () => {
  it("reads mentioned notes, streams the reply and keeps the thread", async () => {
    const note = await tools.createNote(alice.id, {
      title: "Osmosis",
      markdown: "Water moves across a membrane towards more solute.",
    });
    const { ai, service } = chat([
      { text: "Water moves to where there is more solute." },
    ]);
    const events = await run(service, alice.id, {
      workspaceId: alice.workspaceId,
      text: "Explain it simply",
      mentions: [{ kind: "note", id: note.id, title: "Osmosis" }],
    });

    // The note's text went to the model with the question.
    expect(JSON.stringify(ai.calls[0]!.messages)).toContain(
      "Water moves across a membrane",
    );
    expect(
      events
        .filter((e) => e.type === "text")
        .map((e) => (e as { delta: string }).delta)
        .join(""),
    ).toBe("Water moves to where there is more solute.");
    const threadId = (events[0] as { threadId: string }).threadId;
    const thread = await service.getThread(alice.id, threadId);
    expect(thread.title).toBe("Explain it simply");
    expect(thread.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(thread.messages[1]!.content.text).toBe(
      "Water moves to where there is more solute.",
    );

    // A follow-up carries the earlier turns, alternating.
    const next = chat([{ text: "Sure." }]);
    await run(next.service, alice.id, {
      workspaceId: alice.workspaceId,
      threadId,
      text: "Shorter?",
    });
    expect(next.ai.calls[0]!.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(
      (await service.listThreads(alice.id, alice.workspaceId)).map((t) => t.id),
    ).toEqual([threadId]);
  });

  it("searches, reads and shows checked blocks; problems go back to the model", async () => {
    await tools.createNote(alice.id, {
      title: "Interest",
      markdown: "Compound interest grows on itself.",
    });
    const { ai, service } = chat([
      { tools: [{ name: "search", input: { query: "interest" } }] },
      {
        tools: [
          {
            name: "show_block",
            input: {
              kind: "widget",
              spec: { title: "Broken", inputs: [], views: [] },
            },
          },
        ],
      },
      {
        tools: [
          { name: "show_block", input: { kind: "widget", spec: WIDGET } },
        ],
      },
      { text: "Here's a widget." },
    ]);
    const events = await run(service, alice.id, {
      workspaceId: alice.workspaceId,
      text: "Show me doubling time",
    });
    expect(
      events
        .filter((e) => e.type === "step")
        .map((e) => (e as { label: string }).label),
    ).toEqual(['Searched for "interest"']);
    expect(JSON.stringify(ai.calls[1]!.messages.at(-1))).toContain("Interest");
    // The broken block wasn't shown; the model was told why.
    const second = JSON.stringify(ai.calls[2]!.messages.at(-1));
    expect(second).toContain('"is_error":true');
    expect(second).toContain("Not shown");
    const shown = events.filter((e) => e.type === "block");
    expect(shown).toHaveLength(1);
    expect((shown[0] as { block: { kind: string } }).block.kind).toBe("widget");
  });

  it("proposes changes; nothing happens until they're applied, and only once", async () => {
    const note = await tools.createNote(alice.id, {
      title: "Plan",
      markdown: "First idea.",
    });
    const { service } = chat([
      {
        tools: [
          {
            name: "update_note",
            input: { id: note.id, markdown: "Second idea.", mode: "append" },
          },
        ],
      },
      { text: "I proposed adding it." },
    ]);
    const events = await run(service, alice.id, {
      workspaceId: alice.workspaceId,
      text: "Add my second idea",
    });
    const proposal = (
      events.find((e) => e.type === "proposal") as {
        proposal: { id: string; summary: string };
      }
    ).proposal;
    expect(proposal.summary).toBe('Add to note "Plan"');
    expect((await tools.fetch(alice.id, note.id)).text).not.toContain(
      "Second idea",
    );

    const messageId = (
      events.find((e) => e.type === "done") as { messageId: string }
    ).messageId;
    expect(
      await statusOf(service.decide(bob.id, messageId, proposal.id, "apply")),
    ).toBe(404);
    const applied = await service.decide(
      alice.id,
      messageId,
      proposal.id,
      "apply",
    );
    expect(applied.status).toBe("applied");
    expect((await tools.fetch(alice.id, note.id)).text).toContain(
      "Second idea",
    );
    expect(
      await statusOf(service.decide(alice.id, messageId, proposal.id, "apply")),
    ).toBe(409);
  });

  it("edits one block in a note, only with a valid spec", async () => {
    const note = await tools.createNote(alice.id, {
      title: "Money",
      markdown: `Intro.\n\n\`\`\`widget\n${JSON.stringify(WIDGET)}\n\`\`\``,
    });
    const mentions = await chat([]).service.mentionables(
      alice.id,
      alice.workspaceId,
      "",
      note.id,
    );
    const block = mentions.find((m) => m.kind === "block")!;
    expect(block).toMatchObject({ title: "Doubling", noteId: note.id });

    const better = { ...WIDGET, title: "Rule of 72" };
    const { ai, service } = chat([
      {
        tools: [
          {
            name: "edit_block",
            input: { note: note.id, block: block.id, spec: { title: "x" } },
          },
        ],
      },
      {
        tools: [
          {
            name: "edit_block",
            input: { note: note.id, block: block.id, spec: better },
          },
        ],
      },
      { text: "Proposed." },
    ]);
    const events = await run(service, alice.id, {
      workspaceId: alice.workspaceId,
      text: "Rename it",
      mentions: [block],
    });
    // The mentioned block's spec was attached.
    expect(JSON.stringify(ai.calls[0]!.messages)).toContain("72 / rate");
    expect(JSON.stringify(ai.calls[1]!.messages.at(-1))).toContain(
      "Not proposed",
    );
    const proposals = events.filter((e) => e.type === "proposal");
    expect(proposals).toHaveLength(1);
    const proposal = (
      proposals[0] as { proposal: { id: string; summary: string } }
    ).proposal;
    expect(proposal.summary).toBe('Change widget in "Money"');
    const messageId = (
      events.find((e) => e.type === "done") as { messageId: string }
    ).messageId;
    await service.decide(alice.id, messageId, proposal.id, "apply");
    expect((await tools.fetch(alice.id, note.id)).text).toContain("Rule of 72");
  });

  it("keeps threads and workspaces private", async () => {
    const { service } = chat([{ text: "Hi." }]);
    const events = await run(service, alice.id, {
      workspaceId: alice.workspaceId,
      text: "Hello",
    });
    const threadId = (events[0] as { threadId: string }).threadId;
    expect(await statusOf(service.getThread(bob.id, threadId))).toBe(404);
    expect(
      await statusOf(
        chat([]).service.send(
          bob.id,
          { workspaceId: alice.workspaceId, text: "x" },
          () => {},
        ),
      ),
    ).toBe(404);
    expect(
      await statusOf(
        chat([]).service.send(
          bob.id,
          { workspaceId: bob.workspaceId, threadId, text: "x" },
          () => {},
        ),
      ),
    ).toBe(404);
  });

  it("describes canvases as shapes and connections", () => {
    expect(
      outlineText({
        shapes: [
          {
            kind: "geo",
            geo: "rectangle",
            x: 0,
            y: 0,
            w: 100,
            h: 50,
            label: "Client",
            color: "",
            fill: "",
            dash: "",
            size: "",
          },
          {
            kind: "geo",
            geo: "rectangle",
            x: 300,
            y: 0,
            w: 100,
            h: 50,
            label: "Server",
            color: "",
            fill: "",
            dash: "",
            size: "",
          },
        ],
        arrows: [
          {
            x1: 100,
            y1: 25,
            x2: 300,
            y2: 25,
            bend: 0,
            label: "request",
            color: "",
            dash: "",
            start: "",
            end: "arrow",
          },
        ],
      }),
    ).toBe(
      "Shapes (2):\n- rectangle: Client\n- rectangle: Server\n\nConnections (1):\n- Client → Server (request)",
    );
  });
});
