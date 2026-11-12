import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { chatMessages, chatThreads } from "../db/schemas";
import { CanvasesService } from "./canvases.service";
import { ComposeAiService, interactiveBlocks } from "./compose-ai.service";
import { FiguresService } from "./figures.service";
import { canvasOutline, type CanvasOutline } from "./lib/canvas-outline";
import { kindOf, McpToolsService } from "./mcp-tools.service";
import { PagesService } from "./pages.service";
import { ProjectsService } from "./projects.service";

/**
 * The in-app AI chat. The person @-mentions things (notes, canvases, figures,
 * projects, notebooks, blocks inside a note) and talks to them; Claude reads
 * and searches freely with the person's own access, shows widgets and quizzes
 * in the chat, and proposes changes that run only when the person applies
 * them (user decision 2026-11-12). Nothing is published, shared or deleted.
 */

export type MentionKind =
  "note" | "canvas" | "project" | "notebook" | "figure" | "block";

export interface Mention {
  kind: MentionKind;
  id: string;
  title: string;
  /** For a block: the note it lives in. */
  noteId?: string;
}

/** What the person is looking at, so "this note" means something. */
export interface Here {
  kind: "note" | "canvas" | "project" | "notebook";
  id: string;
  title?: string;
}

/** A change Claude wants to make; it runs only when the person applies it. */
export interface Proposal {
  id: string;
  tool: ProposalTool;
  args: Record<string, unknown>;
  /** One line for the card: what will change. */
  summary: string;
  status: "proposed" | "applied" | "dismissed" | "failed";
  /** After applying: where the result is, or why it failed. */
  result?: { id?: string; url?: string; title?: string; error?: string };
}

type ProposalTool =
  | "create_note"
  | "update_note"
  | "create_canvas"
  | "redraw_canvas"
  | "edit_block"
  | "insert_block"
  | "rename";

export interface ShownBlock {
  id: string;
  kind: string;
  spec: Record<string, unknown>;
}

/** A message as stored and sent to the browser. */
export interface MessageContent {
  text: string;
  mentions?: Mention[];
  here?: Here;
  blocks?: ShownBlock[];
  proposals?: Proposal[];
  /** What the assistant did on the way ("Searched for …", "Read …"). */
  steps?: string[];
  error?: string;
}

export type ChatEvent =
  | { type: "thread"; threadId: string; title: string }
  | { type: "text"; delta: string }
  | { type: "step"; label: string }
  | { type: "block"; block: ShownBlock }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

/** Rounds of tool use in one reply, so a confused model can't loop for ever. */
const MAX_ROUNDS = 8;
/** Characters of one item's text given to the model; longer notes are cut with a note saying so. */
const MAX_ITEM_TEXT = 40_000;
/** Earlier turns sent back each time (the newest ones). */
const HISTORY_TURNS = 16;

const BLOCK_KINDS = [
  "widget",
  "flashcards",
  "mcq",
  "quiz",
  "mindmap",
  "matching",
  "scene",
];

const SYSTEM = `You are the assistant inside Octonote, a workspace of notes, canvases (diagrams), projects (a note and a canvas side by side) and notebooks (folders). You help the person think, learn and get work done with what they have.

How to work:
- Things the person @-mentions are attached to their message: read them before answering. Ids look like pag_… (note), cnv_… (canvas), prj_… (project), ntb_… (notebook), fig_… (figure), and a block is "pag_…#blockId".
- Use search and read to find and open other things; never guess what a note says.
- Answer in short Markdown. Refer to items by title.
- To teach or explore something, you can show an interactive block in the chat with show_block: a widget (sliders, charts, simulations, draggable points), flashcards, mcq (practice questions, eight kinds: single, multiple, true_false, fill_blank, numeric, order, categorize, short_answer), quiz, mindmap, matching or scene (an animated explainer). Call block_format first to get a kind's format. Show at most one or two per reply.
- To change the person's work, use the proposal tools (create_note, update_note, create_canvas, redraw_canvas, edit_block, insert_block, rename). They don't run: the person sees a card and applies it if they want. Say in your reply what you proposed. Prefer edit_block for a single widget or quiz, update_note with mode "append" to add to a note, and keep the person's existing content.
- You can't publish, share or delete anything; tell the person where to do it in the app if they ask.
- Canvases are drawn from mermaid flowcharts (flowchart LR/TD) or class diagrams.`;

/** The tools Claude has. Reads run straight away; proposals become cards. */
const TOOLS = [
  {
    name: "search",
    description:
      "Find notes, canvases, projects and notebooks by title and note text. Returns ids and titles.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "read",
    description:
      "Read an item: a note's Markdown (interactive blocks appear as fenced JSON named after their kind, with their block ids), a canvas's shapes and arrows, a project's note and canvas, a notebook's contents, a figure (fig_…, with its picture), or one block (pag_…#blockId).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_items",
    description:
      "List items in the workspace, newest first, optionally of one kind or inside one notebook (name or id).",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["note", "canvas", "project", "notebook"],
        },
        notebook: { type: "string" },
      },
    },
  },
  {
    name: "block_format",
    description:
      "The JSON format of an interactive block kind, with an example. Call before show_block, edit_block or insert_block.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", enum: BLOCK_KINDS } },
      required: ["kind"],
    },
  },
  {
    name: "show_block",
    description:
      "Show an interactive block in the chat (not saved anywhere). Problems in the spec are returned for you to fix and show again.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: BLOCK_KINDS },
        spec: { type: "object" },
      },
      required: ["kind", "spec"],
    },
  },
  {
    name: "create_note",
    description:
      "Propose a new note (Markdown; interactive blocks as fences named after their kind).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        markdown: { type: "string" },
        notebook: { type: "string" },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "update_note",
    description:
      'Propose changing a note: mode "append" adds Markdown at the end (default), "replace" swaps the whole note (keep what should stay).',
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        markdown: { type: "string" },
        mode: { type: "string", enum: ["append", "replace"] },
        title: { type: "string" },
      },
      required: ["id", "markdown"],
    },
  },
  {
    name: "create_canvas",
    description:
      "Propose a new canvas drawn from a mermaid flowchart or class diagram.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        mermaid: { type: "string" },
        notebook: { type: "string" },
      },
      required: ["title", "mermaid"],
    },
  },
  {
    name: "redraw_canvas",
    description:
      "Propose redrawing a canvas from a mermaid diagram (replaces what's on it).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, mermaid: { type: "string" } },
      required: ["id", "mermaid"],
    },
  },
  {
    name: "edit_block",
    description:
      "Propose a new spec for one interactive block in a note (by note id and block id). Checked before it's proposed.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string" },
        block: { type: "string" },
        spec: { type: "object" },
      },
      required: ["note", "block", "spec"],
    },
  },
  {
    name: "insert_block",
    description:
      "Propose adding an interactive block at the end of a note. Checked before it's proposed.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string" },
        kind: { type: "string", enum: BLOCK_KINDS },
        spec: { type: "object" },
      },
      required: ["note", "kind", "spec"],
    },
  },
  {
    name: "rename",
    description: "Propose renaming a note, canvas, project or notebook.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
] as const;

const PROPOSAL_TOOLS = new Set<string>([
  "create_note",
  "update_note",
  "create_canvas",
  "redraw_canvas",
  "edit_block",
  "insert_block",
  "rename",
]);

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/png"; data: string };
    };
type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
};
type ModelMessage = { role: "user" | "assistant"; content: string | unknown[] };

type DocBlock = {
  id?: unknown;
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
};

@Injectable()
export class ChatService {
  private readonly log = new Logger(ChatService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tools: McpToolsService,
    private readonly ai: ComposeAiService,
    private readonly pages: PagesService,
    private readonly canvases: CanvasesService,
    private readonly projects: ProjectsService,
    private readonly figures: FiguresService,
  ) {}

  // --- Threads ----------------------------------------------------------------

  async listThreads(userId: string, workspaceId: string) {
    await this.tools.workspaceId(userId, workspaceId);
    return this.db
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        updatedAt: chatThreads.updatedAt,
      })
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(chatThreads.updatedAt))
      .limit(100);
  }

  private async ownThread(userId: string, threadId: string) {
    const [thread] = await this.db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
    if (!thread) throw NotFound("Chat not found.");
    return thread;
  }

  async getThread(userId: string, threadId: string) {
    const thread = await this.ownThread(userId, threadId);
    const messages = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt));
    return {
      id: thread.id,
      title: thread.title,
      workspaceId: thread.workspaceId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content as MessageContent,
        createdAt: m.createdAt,
      })),
    };
  }

  async deleteThread(userId: string, threadId: string) {
    await this.ownThread(userId, threadId);
    await this.db.delete(chatThreads).where(eq(chatThreads.id, threadId));
  }

  // --- Mentions -----------------------------------------------------------------

  /**
   * What the person can @-mention for a query: notes, canvases, projects and
   * notebooks, figures, and the interactive blocks in the note they're on.
   */
  async mentionables(
    userId: string,
    workspaceId: string,
    query: string,
    noteId?: string,
  ): Promise<Mention[]> {
    const ws = await this.tools.workspaceId(userId, workspaceId);
    const q = query.trim().toLowerCase();
    const items = q
      ? await this.tools.search(userId, q, 12, ws)
      : (await this.tools.list(userId, { workspaceId: ws })).slice(0, 12);
    const out: Mention[] = items.map((i) => ({
      kind: i.kind,
      id: i.id,
      title: i.title,
    }));
    const figures = await this.figures
      .listForWorkspace(ws, userId)
      .catch(() => []);
    for (const f of figures)
      if (!q || f.title.toLowerCase().includes(q))
        out.push({ kind: "figure", id: f.id, title: f.title });
    if (noteId?.startsWith("pag_")) {
      const { page } = await this.pages
        .getOne(noteId, userId)
        .catch(() => ({ page: null }));
      for (const b of page ? interactiveBlocks(page.document) : []) {
        const title =
          titleOf(b) || `${labelOf(String(b.props?.kind))} in "${page!.title}"`;
        if (
          !q ||
          title.toLowerCase().includes(q) ||
          String(b.props?.kind).includes(q)
        )
          out.push({ kind: "block", id: String(b.id), title, noteId });
      }
    }
    return out.slice(0, 30);
  }

  /** Adds a block the assistant showed to a note: the person clicked it, so it runs straight away. */
  async insertShown(
    userId: string,
    input: { noteId: string; kind: string; spec: Record<string, unknown> },
  ) {
    const check = await this.ai.checkSpec(input.kind, input.spec);
    if (!check.ok)
      throw BadRequest(
        `This block has problems: ${check.issues.map((i) => i.message).join("; ")}`,
      );
    const fence = `\`\`\`${input.kind}\n${JSON.stringify(input.spec, null, 2)}\n\`\`\``;
    return this.tools.updateNote(userId, {
      id: input.noteId,
      markdown: fence,
      mode: "append",
    });
  }

  // --- A turn -----------------------------------------------------------------

  /**
   * Saves the person's message, then streams the assistant's reply as events
   * while Claude reads, searches, shows blocks and proposes changes; the reply
   * is saved when it ends (also when it fails, with what was written so far).
   */
  async send(
    userId: string,
    input: {
      workspaceId: string;
      threadId?: string;
      text: string;
      mentions?: Mention[];
      here?: Here;
    },
    emit: (event: ChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const workspaceId = await this.tools.workspaceId(userId, input.workspaceId);
    this.ai.useAiCall(userId);
    const { client, model } = await this.ai.anthropic();

    let thread = input.threadId
      ? await this.ownThread(userId, input.threadId)
      : null;
    if (thread && thread.workspaceId !== workspaceId)
      throw BadRequest("That chat belongs to another workspace.");
    if (!thread) {
      [thread] = await this.db
        .insert(chatThreads)
        .values({
          workspaceId,
          userId,
          title:
            input.text.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat",
        })
        .returning();
    }
    emit({ type: "thread", threadId: thread!.id, title: thread!.title });

    const userContent: MessageContent = {
      text: input.text,
      ...(input.mentions?.length ? { mentions: input.mentions } : {}),
      ...(input.here ? { here: input.here } : {}),
    };
    await this.db
      .insert(chatMessages)
      .values({ threadId: thread!.id, role: "user", content: userContent });

    const history = await this.history(thread!.id);
    const attached = await this.attachments(userId, input.mentions ?? []);
    const hereLine = input.here
      ? `\n\n(The person is looking at ${input.here.kind} ${input.here.id}${input.here.title ? ` "${input.here.title}"` : ""}; "this" usually means it.)`
      : "";
    const messages: ModelMessage[] = [
      ...history,
      {
        role: "user",
        content: [...attached, { type: "text", text: input.text + hereLine }],
      },
    ];

    const reply: MessageContent = {
      text: "",
      steps: [],
      blocks: [],
      proposals: [],
    };
    const ctx = { userId, workspaceId, reply, emit };
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (signal?.aborted) break;
        const stream = client.messages.stream({
          model,
          max_tokens: 8000,
          system: SYSTEM,
          tools: TOOLS as never,
          messages: messages as never,
        });
        stream.on("text", (delta: string) => {
          reply.text += delta;
          emit({ type: "text", delta });
        });
        signal?.addEventListener("abort", () => stream.abort(), { once: true });
        const message = await stream.finalMessage();
        const calls = message.content.filter(
          (b) => b.type === "tool_use",
        ) as unknown as {
          id: string;
          name: string;
          input: Record<string, unknown>;
        }[];
        if (!calls.length || message.stop_reason !== "tool_use") break;
        messages.push({ role: "assistant", content: message.content });
        const results: ToolResult[] = [];
        for (const call of calls) results.push(await this.runTool(ctx, call));
        messages.push({ role: "user", content: results });
        if (reply.text && !reply.text.endsWith("\n")) {
          reply.text += "\n\n";
          emit({ type: "text", delta: "\n\n" });
        }
      }
    } catch (error) {
      if (!signal?.aborted) {
        this.log.warn(`Chat failed: ${(error as Error).message}`);
        reply.error =
          "The assistant stopped with an error. Try again in a moment.";
        emit({ type: "error", message: reply.error });
      }
    }

    const [saved] = await this.db
      .insert(chatMessages)
      .values({ threadId: thread!.id, role: "assistant", content: tidy(reply) })
      .returning({ id: chatMessages.id });
    await this.db
      .update(chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(chatThreads.id, thread!.id));
    emit({ type: "done", messageId: saved!.id });
  }

  /** Earlier turns as plain text: what was said, what was mentioned and what was proposed. */
  private async history(threadId: string): Promise<ModelMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(HISTORY_TURNS + 1);
    // The newest row is the message just saved; it's sent with its attachments separately.
    const earlier = rows.slice(1).reverse();
    const out: ModelMessage[] = [];
    for (const row of earlier) {
      const c = row.content as MessageContent;
      const extra = [
        c.mentions?.length
          ? `Mentioned: ${c.mentions.map((m) => `${m.title} (${m.kind === "block" ? `${m.noteId}#${m.id}` : m.id})`).join(", ")}`
          : "",
        c.proposals?.length
          ? `Proposed: ${c.proposals.map((p) => `${p.summary} [${p.status}]`).join("; ")}`
          : "",
        c.blocks?.length
          ? `Showed: ${c.blocks.map((b) => b.kind).join(", ")}`
          : "",
      ].filter(Boolean);
      const text = [c.text, ...extra].filter(Boolean).join("\n") || "(empty)";
      const role = row.role === "assistant" ? "assistant" : "user";
      // The API wants turns to alternate.
      if (out.length && out[out.length - 1]!.role === role)
        out[out.length - 1]!.content += `\n\n${text}`;
      else out.push({ role, content: text });
    }
    while (out.length && out[0]!.role !== "user") out.shift();
    return out;
  }

  /** The content of everything the person mentioned, read with their own access. */
  private async attachments(
    userId: string,
    mentions: Mention[],
  ): Promise<ContentBlock[]> {
    const parts: ContentBlock[] = [];
    for (const mention of mentions.slice(0, 8)) {
      try {
        const id =
          mention.kind === "block"
            ? `${mention.noteId}#${mention.id}`
            : mention.id;
        parts.push(...(await this.read(userId, id)));
      } catch (error) {
        parts.push({
          type: "text",
          text: `(Couldn't open "${mention.title}": ${(error as Error).message})`,
        });
      }
    }
    return parts;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One item as model input: text, and for figures their picture. */
  private async read(userId: string, id: string): Promise<ContentBlock[]> {
    if (id.includes("#")) {
      const [noteId, blockId] = id.split("#") as [string, string];
      const block = await this.block(userId, noteId, blockId);
      return [
        {
          type: "text",
          text: `<block note="${noteId}" id="${blockId}" kind="${block.kind}">\n${JSON.stringify(block.spec, null, 2).slice(0, MAX_ITEM_TEXT)}\n</block>`,
        },
      ];
    }
    if (id.startsWith("fig_")) {
      const figure = await this.figures.get(id, userId);
      const parts: ContentBlock[] = [
        {
          type: "text",
          text: `<figure id="${id}" title="${figure.title}" canvas="${figure.canvasId ?? ""}">A titled part of a canvas. Its picture follows when it has one.</figure>`,
        },
      ];
      const image = await this.figures.image(id, userId).catch(() => null);
      if (image?.bytes)
        parts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: image.bytes.toString("base64"),
          },
        });
      return parts;
    }
    const kind = kindOf(id);
    if (kind === "canvas") {
      const { canvas } = await this.canvases.getOne(id, userId);
      return [
        {
          type: "text",
          text: `<canvas id="${id}" title="${canvas.title}">\n${outlineText(canvasOutline(canvas.document, new Map()))}\n</canvas>`,
        },
      ];
    }
    if (kind === "project") {
      const item = await this.tools.fetch(userId, id);
      const p = await this.projects.getOne(id, userId);
      const canvas = p.canvasId
        ? (await this.canvases.getOne(p.canvasId, userId)).canvas
        : null;
      const drawing = canvas
        ? `\n\n## Canvas ${canvas.id}\n${outlineText(canvasOutline(canvas.document, new Map()))}`
        : "";
      return [
        {
          type: "text",
          text: `<project id="${id}" title="${item.title}">\n${cut(item.text + drawing)}\n</project>`,
        },
      ];
    }
    const item = await this.tools.fetch(userId, id);
    const blockIds = kind === "page" ? await this.blockList(userId, id) : "";
    return [
      {
        type: "text",
        text: `<${item.kind} id="${id}" title="${item.title}">\n${cut(item.text)}${blockIds}\n</${item.kind}>`,
      },
    ];
  }

  /** A note's interactive blocks with their ids, so the model can target one. */
  private async blockList(userId: string, noteId: string): Promise<string> {
    const { page } = await this.pages.getOne(noteId, userId);
    const blocks = interactiveBlocks(page.document);
    if (!blocks.length) return "";
    return `\n\nInteractive blocks in this note (use edit_block with these ids):\n${blocks.map((b) => `- ${String(b.props?.kind)} ${String(b.id)}${titleOf(b) ? `: ${titleOf(b)}` : ""}`).join("\n")}`;
  }

  private async block(
    userId: string,
    noteId: string,
    blockId: string,
  ): Promise<{ kind: string; spec: Record<string, unknown> }> {
    const { page } = await this.pages.getOne(noteId, userId);
    const block = interactiveBlocks(page.document).find(
      (b) => String(b.id) === blockId,
    );
    if (!block) throw NotFound(`No interactive block ${blockId} in ${noteId}.`);
    let spec: Record<string, unknown> = {};
    try {
      spec = JSON.parse(String(block.props?.spec ?? "{}")) as Record<
        string,
        unknown
      >;
    } catch {
      // An unreadable block reads as empty; editing it replaces it.
    }
    return { kind: String(block.props?.kind ?? ""), spec };
  }

  // --- Tools -------------------------------------------------------------------------

  private async runTool(
    ctx: {
      userId: string;
      workspaceId: string;
      reply: MessageContent;
      emit: (e: ChatEvent) => void;
    },
    call: { id: string; name: string; input: Record<string, unknown> },
  ): Promise<ToolResult> {
    const { userId, workspaceId, reply, emit } = ctx;
    const ok = (content: string | ContentBlock[]): ToolResult => ({
      type: "tool_result",
      tool_use_id: call.id,
      content,
    });
    const fail = (message: string): ToolResult => ({
      type: "tool_result",
      tool_use_id: call.id,
      content: message,
      is_error: true,
    });
    const step = (label: string) => {
      reply.steps!.push(label);
      emit({ type: "step", label });
    };
    const arg = (name: string) =>
      typeof call.input[name] === "string" ? (call.input[name] as string) : "";
    try {
      switch (call.name) {
        case "search": {
          step(`Searched for "${arg("query")}"`);
          const found = await this.tools.search(
            userId,
            arg("query"),
            15,
            workspaceId,
          );
          return ok(
            found.length
              ? found.map((i) => `- ${i.kind} ${i.id}: ${i.title}`).join("\n")
              : "Nothing matched.",
          );
        }
        case "read": {
          const id = arg("id");
          step(
            `Read ${id.startsWith("fig_") ? "a figure" : id.includes("#") ? "a block" : (kindOfSafe(id) ?? "an item")}`,
          );
          return ok(await this.read(userId, id));
        }
        case "list_items": {
          step("Listed items");
          const kind = arg("kind") as
            "note" | "canvas" | "project" | "notebook" | "";
          const items = await this.tools.list(userId, {
            ...(kind ? { kind } : {}),
            ...(arg("notebook") ? { notebook: arg("notebook") } : {}),
            workspaceId,
          });
          return ok(
            items
              .slice(0, 60)
              .map((i) => `- ${i.kind} ${i.id}: ${i.title}`)
              .join("\n") || "(nothing)",
          );
        }
        case "block_format":
          return ok(
            JSON.stringify(await this.ai.format(arg("kind"))).slice(0, 60_000),
          );
        case "show_block": {
          const kind = arg("kind");
          const spec = call.input.spec;
          const check = await this.ai.checkSpec(kind, spec);
          if (!check.ok)
            return fail(
              `Not shown; fix these and call show_block again:\n${check.issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}`,
            );
          const block = {
            id: randomUUID().slice(0, 8),
            kind,
            spec: spec as Record<string, unknown>,
          };
          reply.blocks!.push(block);
          emit({ type: "block", block });
          return ok("Shown in the chat.");
        }
        default:
          if (PROPOSAL_TOOLS.has(call.name))
            return await this.propose(
              ctx,
              call.name as ProposalTool,
              call.input,
              ok,
              fail,
            );
          return fail(`Unknown tool ${call.name}.`);
      }
    } catch (error) {
      return fail((error as Error).message || "That didn't work.");
    }
  }

  /** Checks a change and turns it into a card; nothing changes until the person applies it. */
  private async propose(
    ctx: {
      userId: string;
      reply: MessageContent;
      emit: (e: ChatEvent) => void;
    },
    tool: ProposalTool,
    input: Record<string, unknown>,
    ok: (c: string) => ToolResult,
    fail: (m: string) => ToolResult,
  ): Promise<ToolResult> {
    const { userId, reply, emit } = ctx;
    const str = (k: string) =>
      typeof input[k] === "string" ? (input[k] as string) : "";
    let summary = "";
    switch (tool) {
      case "create_note":
        summary = `Create note "${str("title")}"`;
        break;
      case "update_note": {
        const item = await this.tools.fetch(userId, str("id"));
        summary = `${str("mode") === "replace" ? "Rewrite" : "Add to"} note "${item.title}"`;
        break;
      }
      case "create_canvas":
        summary = `Create canvas "${str("title")}"`;
        break;
      case "redraw_canvas": {
        const { canvas } = await this.canvases.getOne(str("id"), userId);
        summary = `Redraw canvas "${canvas.title}"`;
        break;
      }
      case "edit_block":
      case "insert_block": {
        const kind =
          tool === "edit_block"
            ? (await this.block(userId, str("note"), str("block"))).kind
            : str("kind");
        const check = await this.ai.checkSpec(kind, input.spec);
        if (!check.ok)
          return fail(
            `Not proposed; fix these and try again:\n${check.issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}`,
          );
        const { page } = await this.pages.getOne(str("note"), userId);
        summary = `${tool === "edit_block" ? "Change" : "Add"} ${kind === "mcq" ? "practice questions" : kind} ${tool === "edit_block" ? "in" : "to"} "${page.title}"`;
        if (tool === "insert_block") input = { ...input, kind };
        break;
      }
      case "rename":
        summary = `Rename to "${str("name")}"`;
        break;
    }
    const proposal: Proposal = {
      id: randomUUID().slice(0, 12),
      tool,
      args: input,
      summary,
      status: "proposed",
    };
    reply.proposals!.push(proposal);
    emit({ type: "proposal", proposal });
    return ok(
      `Proposed to the person as a card ("${summary}"). It runs only if they apply it.`,
    );
  }

  // --- Applying a proposal --------------------------------------------------------------

  async decide(
    userId: string,
    messageId: string,
    proposalId: string,
    decision: "apply" | "dismiss",
  ): Promise<Proposal> {
    const [row] = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId));
    if (!row) throw NotFound("Message not found.");
    const thread = await this.ownThread(userId, row.threadId);
    const content = row.content as MessageContent;
    const proposal = content.proposals?.find((p) => p.id === proposalId);
    if (!proposal) throw NotFound("Proposal not found.");
    if (proposal.status !== "proposed")
      throw new AppError(
        ErrorCode.CONFLICT,
        `This change was already ${proposal.status}.`,
        HttpStatus.CONFLICT,
      );

    if (decision === "dismiss") proposal.status = "dismissed";
    else {
      try {
        proposal.result = await this.apply(
          userId,
          thread.workspaceId,
          proposal,
        );
        proposal.status = "applied";
      } catch (error) {
        proposal.status = "failed";
        proposal.result = {
          error: (error as Error).message || "It couldn't be applied.",
        };
      }
    }
    await this.db
      .update(chatMessages)
      .set({ content })
      .where(eq(chatMessages.id, messageId));
    return proposal;
  }

  /** Runs a change with the person's own permissions, through the same services as the rest of the app. */
  private async apply(
    userId: string,
    workspaceId: string,
    p: Proposal,
  ): Promise<Proposal["result"]> {
    const a = p.args as Record<string, string> & {
      spec?: Record<string, unknown>;
    };
    switch (p.tool) {
      case "create_note":
        return this.tools.createNote(userId, {
          title: a.title,
          markdown: a.markdown,
          ...(a.notebook ? { notebook: a.notebook } : {}),
          workspaceId,
        });
      case "update_note":
        return this.tools.updateNote(userId, {
          id: a.id,
          markdown: a.markdown,
          mode: a.mode === "replace" ? "replace" : "append",
          ...(a.title ? { title: a.title } : {}),
        });
      case "create_canvas":
        return this.tools.createCanvas(userId, {
          title: a.title,
          mermaid: a.mermaid,
          ...(a.notebook ? { notebook: a.notebook } : {}),
          workspaceId,
        });
      case "redraw_canvas":
        return this.tools.redrawCanvas(userId, {
          id: a.id,
          mermaid: a.mermaid,
        });
      case "rename":
        await this.tools.rename(userId, { id: a.id, name: a.name });
        return { id: a.id, title: a.name };
      case "insert_block": {
        const fence = `\`\`\`${a.kind}\n${JSON.stringify(a.spec, null, 2)}\n\`\`\``;
        return this.tools.updateNote(userId, {
          id: a.note,
          markdown: fence,
          mode: "append",
        });
      }
      case "edit_block": {
        const { page } = await this.pages.getOne(a.note, userId);
        const document = structuredClone(page.document) as { blocks?: unknown };
        const target = findBlock(document.blocks, a.block);
        if (!target) throw NotFound("That block isn't in the note any more.");
        target.props = {
          ...(target.props ?? {}),
          spec: JSON.stringify(a.spec),
        };
        // Refuse rather than demote: a proposal that no longer fits should fail visibly.
        const updated = await this.pages.update(
          a.note,
          { document } as never,
          userId,
          { interactive: "reject" },
        );
        return {
          id: updated.id,
          title: updated.title,
          url: `/n/${updated.id}`,
        };
      }
    }
  }
}

function findBlock(blocks: unknown, id: string): DocBlock | null {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks as DocBlock[]) {
    if (String(b?.id) === id && b.type === "interactive") return b;
    const inner = findBlock(b?.children, id);
    if (inner) return inner;
  }
  return null;
}

function titleOf(block: { props?: Record<string, unknown> }): string {
  try {
    const spec = JSON.parse(String(block.props?.spec ?? "{}")) as {
      title?: unknown;
    };
    return typeof spec.title === "string" ? spec.title : "";
  } catch {
    return "";
  }
}

const LABELS: Record<string, string> = {
  widget: "Widget",
  flashcards: "Flashcards",
  mcq: "Practice questions",
  quiz: "Quiz",
  mindmap: "Mind map",
  matching: "Matching",
  scene: "Animation",
  custom: "App",
};
const labelOf = (kind: string) => LABELS[kind] ?? kind;

const cut = (text: string) =>
  text.length > MAX_ITEM_TEXT
    ? `${text.slice(0, MAX_ITEM_TEXT)}\n\n(… cut: the rest is longer than fits here)`
    : text;

function kindOfSafe(id: string): string | null {
  try {
    const kind = kindOf(id);
    return kind === "page" ? "a note" : `a ${kind}`;
  } catch {
    return null;
  }
}

/** A canvas as text a model can reason about: its shapes with labels, and what connects to what. */
export function outlineText(outline: CanvasOutline | null): string {
  if (!outline || (!outline.shapes.length && !outline.arrows.length))
    return "(an empty canvas)";
  const named = outline.shapes.map((s, i) => ({
    ...s,
    name: s.label.trim() || `${s.kind} ${i + 1}`,
  }));
  const nearest = (x: number, y: number) => {
    let best: (typeof named)[number] | undefined;
    let bestD = Infinity;
    for (const s of named) {
      const dx = Math.max(s.x - x, 0, x - (s.x + s.w));
      const dy = Math.max(s.y - y, 0, y - (s.y + s.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) [best, bestD] = [s, d];
    }
    return bestD < 60 ? best : undefined;
  };
  const shapes = named.map(
    (s) => `- ${s.kind === "geo" ? s.geo : s.kind}: ${s.name}`,
  );
  const arrows = outline.arrows.map((a) => {
    const from = nearest(a.x1, a.y1)?.name ?? "somewhere";
    const to = nearest(a.x2, a.y2)?.name ?? "somewhere";
    return `- ${from} → ${to}${a.label ? ` (${a.label})` : ""}`;
  });
  return [
    `Shapes (${shapes.length}):`,
    ...shapes.slice(0, 300),
    arrows.length ? `\nConnections (${arrows.length}):` : "",
    ...arrows.slice(0, 300),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Leaves out empty parts so stored messages stay small. */
function tidy(c: MessageContent): MessageContent {
  return {
    text: c.text.trim(),
    ...(c.steps?.length ? { steps: c.steps } : {}),
    ...(c.blocks?.length ? { blocks: c.blocks } : {}),
    ...(c.proposals?.length ? { proposals: c.proposals } : {}),
    ...(c.error ? { error: c.error } : {}),
  };
}
