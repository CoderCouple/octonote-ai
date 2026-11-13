import { removeUnits } from "@octonote/shared";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { clips, collections, type ClipSource } from "../db/schemas";
import { ComposeAiService } from "./compose-ai.service";
import { McpToolsService } from "./mcp-tools.service";

/**
 * Research collections (user decision 2026-11-12): named containers of clips
 * kept from ChatGPT, Claude, Gemini or anywhere else, and documents written
 * from them strictly: Claude may use only the clips and must cite them, a
 * second pass checks every sentence against the clips, numbers are checked
 * mechanically, and anything unsupported is flagged before it's saved.
 */

export const MODES = [
  "summary",
  "report",
  "comparison",
  "study_notes",
  "outline",
  "faq",
  "article",
  "brief",
  "flashcards",
  "custom",
] as const;
export type Mode = (typeof MODES)[number];

const MODE_GUIDE: Record<Mode, string> = {
  summary:
    "A concise summary: a short opening paragraph, then the key points as bullets.",
  report:
    "A structured report with headings (an overview, sections for the main findings, and a conclusion).",
  comparison:
    "A comparison: a Markdown table comparing the options or items found in the clips, with a last column named Sources holding the citations for that row, then two or three sentences of takeaways.",
  study_notes:
    "Study notes: a heading per topic, bullet points underneath, key terms in bold.",
  outline: "A hierarchical outline of the material as nested bullets.",
  faq: "An FAQ: each question as a ### heading, answered in one to three sentences.",
  article:
    "A readable article: an introduction, body sections with headings, and a conclusion.",
  brief:
    "A one-page brief: the bottom line first, then supporting points, then open questions the clips leave unanswered.",
  flashcards:
    "Flashcards: a bulleted list where every item is exactly `Q: question | A: answer [n]`. One fact per card.",
  custom: "",
};

const LIMITS = {
  clipsPerCollection: 100,
  clipChars: 20_000,
  promptChars: 160_000,
  collections: 200,
};

/**
 * "inference" is a conclusion, recommendation or judgement reasoned from the
 * clips without adding facts: the point of a memo or brief, so it's shown as
 * such rather than flagged.
 */
export type Verdict = "supported" | "inference" | "partial" | "unsupported";

/** One checkable piece of a draft: a sentence, list item or table row, with where it is in the Markdown. */
export interface DraftUnit {
  id: number;
  text: string;
  start: number;
  end: number;
  cites: number[];
  status: "ok" | "flagged";
  verdict?: Verdict;
  reasons: string[];
}

export interface Draft {
  title: string;
  mode: Mode;
  /** The document without its Sources section (unit ranges point into this). */
  body: string;
  /** The Sources section to append when saving. */
  sources: string;
  units: DraftUnit[];
  /** False when the checking pass failed: only the mechanical checks ran. */
  checked: boolean;
}

const APP_NAMES: Record<ClipSource["app"], string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  octonote: "Octonote",
  web: "Web",
  other: "Other",
};

@Injectable()
export class CollectionsService {
  private readonly log = new Logger(CollectionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tools: McpToolsService,
    private readonly ai: ComposeAiService,
  ) {}

  // --- Collections ---------------------------------------------------------------

  async list(userId: string, workspaceId: string) {
    await this.tools.workspaceId(userId, workspaceId);
    const rows = await this.db
      .select({
        id: collections.id,
        name: collections.name,
        updatedAt: collections.updatedAt,
        clips: count(clips.id),
      })
      .from(collections)
      .leftJoin(clips, eq(clips.collectionId, collections.id))
      .where(
        and(
          eq(collections.userId, userId),
          eq(collections.workspaceId, workspaceId),
        ),
      )
      .groupBy(collections.id)
      .orderBy(desc(collections.updatedAt));
    return rows.map((r) => ({ ...r, clips: Number(r.clips) }));
  }

  async create(userId: string, input: { workspaceId: string; name: string }) {
    const workspaceId = await this.tools.workspaceId(userId, input.workspaceId);
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: count() })
      .from(collections)
      .where(eq(collections.userId, userId));
    if (Number(n) >= LIMITS.collections)
      throw BadRequest(`You can have up to ${LIMITS.collections} collections.`);
    const [row] = await this.db
      .insert(collections)
      .values({
        workspaceId,
        userId,
        name: input.name.trim().slice(0, 120) || "Untitled collection",
      })
      .returning();
    return row!;
  }

  private async own(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)));
    if (!row) throw NotFound("Collection not found.");
    return row;
  }

  private touch(id: string) {
    return this.db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, id));
  }

  async get(userId: string, id: string) {
    const collection = await this.own(userId, id);
    const items = await this.db
      .select()
      .from(clips)
      .where(eq(clips.collectionId, id))
      .orderBy(asc(clips.position), asc(clips.createdAt));
    return { ...collection, clips: items };
  }

  async rename(userId: string, id: string, name: string) {
    await this.own(userId, id);
    const [row] = await this.db
      .update(collections)
      .set({
        name: name.trim().slice(0, 120) || "Untitled collection",
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id))
      .returning();
    return row!;
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.db.delete(collections).where(eq(collections.id, id));
  }

  // --- Clips -----------------------------------------------------------------------

  async addClip(
    userId: string,
    collectionId: string,
    input: { content: string; source?: ClipSource },
  ) {
    await this.own(userId, collectionId);
    const content = input.content.trim();
    if (!content) throw BadRequest("A clip needs some text.");
    if (content.length > LIMITS.clipChars)
      throw BadRequest(
        `A clip can be up to ${LIMITS.clipChars.toLocaleString()} characters; split it into a few.`,
      );
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: count() })
      .from(clips)
      .where(eq(clips.collectionId, collectionId));
    if (Number(n) >= LIMITS.clipsPerCollection)
      throw BadRequest(
        `A collection holds up to ${LIMITS.clipsPerCollection} clips.`,
      );
    const [{ last } = { last: null }] = await this.db
      .select({ last: max(clips.position) })
      .from(clips)
      .where(eq(clips.collectionId, collectionId));
    const [row] = await this.db
      .insert(clips)
      .values({
        collectionId,
        content,
        source: cleanSource(input.source),
        position: (last ?? -1) + 1,
      })
      .returning();
    await this.touch(collectionId);
    return row!;
  }

  private async ownClip(userId: string, clipId: string) {
    const [row] = await this.db
      .select({ clip: clips, userId: collections.userId })
      .from(clips)
      .innerJoin(collections, eq(collections.id, clips.collectionId))
      .where(eq(clips.id, clipId));
    if (!row || row.userId !== userId) throw NotFound("Clip not found.");
    return row.clip;
  }

  async editClip(
    userId: string,
    clipId: string,
    input: { content?: string; source?: ClipSource },
  ) {
    const clip = await this.ownClip(userId, clipId);
    const content = input.content?.trim();
    if (
      content !== undefined &&
      (!content || content.length > LIMITS.clipChars)
    )
      throw BadRequest("A clip needs some text, up to 20,000 characters.");
    const [row] = await this.db
      .update(clips)
      .set({
        ...(content ? { content } : {}),
        ...(input.source ? { source: cleanSource(input.source) } : {}),
      })
      .where(eq(clips.id, clipId))
      .returning();
    await this.touch(clip.collectionId);
    return row!;
  }

  async removeClip(userId: string, clipId: string) {
    const clip = await this.ownClip(userId, clipId);
    await this.db.delete(clips).where(eq(clips.id, clipId));
    await this.touch(clip.collectionId);
  }

  /** Puts the clips in the given order (ids not in the collection are ignored). */
  async reorder(userId: string, collectionId: string, ids: string[]) {
    await this.own(userId, collectionId);
    const existing = await this.db
      .select({ id: clips.id })
      .from(clips)
      .where(
        and(
          eq(clips.collectionId, collectionId),
          inArray(clips.id, ids.length ? ids : ["-"]),
        ),
      );
    const known = new Set(existing.map((r) => r.id));
    let position = 0;
    for (const id of ids)
      if (known.has(id))
        await this.db
          .update(clips)
          .set({ position: position++ })
          .where(eq(clips.id, id));
    await this.touch(collectionId);
    return this.get(userId, collectionId);
  }

  // --- Writing from clips -----------------------------------------------------------

  /** Writes a document from the clips only, then checks it. Nothing is saved until `save`. */
  async compose(
    userId: string,
    collectionId: string,
    input: { mode: Mode; instructions?: string; title?: string },
  ): Promise<Draft> {
    const collection = await this.get(userId, collectionId);
    if (!collection.clips.length) throw BadRequest("Add some clips first.");
    if (input.mode === "custom" && !input.instructions?.trim())
      throw BadRequest("Say what to make from the clips.");
    await this.ai.useAiCall(userId);
    const { client, model } = await this.ai.anthropic(userId);

    const numbered = collection.clips.map((c, i) => ({
      n: i + 1,
      content: c.content,
      source: c.source as ClipSource,
    }));
    const clipsXml = numbered
      .map(
        (c) =>
          `<clip n="${c.n}" source="${label(c.source)}">\n${c.content}\n</clip>`,
      )
      .join("\n\n");
    if (clipsXml.length > LIMITS.promptChars)
      throw BadRequest(
        "These clips are too long to write from together. Remove a few, or split them into two collections.",
      );

    const written = await this.write(client, model, {
      clipsXml,
      mode: input.mode,
      instructions: input.instructions,
      title: input.title || collection.name,
      count: numbered.length,
    });
    const body = written.markdown.trim();
    const units = splitUnits(body);
    let checked = true;
    try {
      const verdicts = await this.check(client, model, clipsXml, units);
      for (const u of units) {
        const v = verdicts.get(u.id);
        if (!v) continue;
        u.verdict = v.verdict;
        if (v.verdict !== "supported" && v.verdict !== "inference")
          u.reasons.push(
            v.reason ||
              (v.verdict === "partial"
                ? "Only partly in the clips"
                : "Not in the clips"),
          );
      }
    } catch (error) {
      checked = false;
      this.log.warn(`Clip check failed: ${(error as Error).message}`);
    }
    for (const u of units) {
      // A conclusion may rest on the clips as a whole; a factual statement must say which.
      if (!u.cites.length && u.verdict !== "inference")
        u.reasons.unshift("No citation");
      const bad = u.cites.filter((n) => n < 1 || n > numbered.length);
      if (bad.length)
        u.reasons.push(`Cites clip ${bad.join(", ")}, which doesn't exist`);
      // Numbers must appear in the clips they cite (or any clip when uncited): catches made-up figures.
      const pool = (
        u.cites.length
          ? u.cites.map((n) => numbered[n - 1]?.content ?? "")
          : numbered.map((c) => c.content)
      ).join("\n");
      const missing = numbersIn(u.text).filter(
        (num) => !numbersIn(pool).includes(num),
      );
      if (missing.length)
        u.reasons.push(`${missing.join(", ")} isn't in the cited clips`);
      u.status = u.reasons.length ? "flagged" : "ok";
    }
    const sources = [
      "## Sources",
      "",
      ...numbered.map((c) => `${c.n}. ${sourceLine(c.source)}`),
    ].join("\n");
    return {
      title: written.title.trim().slice(0, 120) || collection.name,
      mode: input.mode,
      body,
      sources,
      units,
      checked,
    };
  }

  /** Saves a (reviewed) draft as a note in the collection's workspace. Flashcards become a flashcards block. */
  async save(
    userId: string,
    collectionId: string,
    input: {
      title: string;
      body: string;
      sources: string;
      mode: Mode;
      notebook?: string;
    },
  ) {
    const collection = await this.own(userId, collectionId);
    const content =
      input.mode === "flashcards" ? flashcardsMarkdown(input.body) : input.body;
    const markdown = `${content.trim()}\n\n${input.sources.trim()}\n`;
    return this.tools.createNote(userId, {
      title: input.title.slice(0, 120) || collection.name,
      markdown,
      workspaceId: collection.workspaceId,
      ...(input.notebook ? { notebook: input.notebook } : {}),
    });
  }

  private async write(
    client: Awaited<ReturnType<ComposeAiService["anthropic"]>>["client"],
    model: string,
    input: {
      clipsXml: string;
      mode: Mode;
      instructions?: string;
      title: string;
      count: number;
    },
  ): Promise<{ title: string; markdown: string }> {
    const tool = {
      name: "write_document",
      description: "The finished document.",
      input_schema: {
        type: "object",
        properties: { title: { type: "string" }, markdown: { type: "string" } },
        required: ["title", "markdown"],
      },
    };
    const system = `You write documents strictly from a set of numbered clips that a person collected while researching. Rules:
- Use only information stated in the clips. Don't add facts, numbers, names, dates or examples from your own knowledge, even if you're sure they're true. If the clips don't cover something the format would normally include, leave it out.
- Cite the clip(s) behind every sentence, list item and table row with their numbers in square brackets before the full stop, like "Lithium metal anodes raise energy density [2]." or "[1, 3]". Headings need no citation.
- Keep the clips' numbers, units and names exactly as written.
- Where clips disagree, say so and cite both.
- If the format calls for a conclusion or recommendation, reason only from the clips (no outside facts) and cite the clips it rests on.
- Write plain Markdown (headings, paragraphs, bullets, tables). No HTML, no code fences, no Sources section (it's added for you).
Call write_document once with a title and the Markdown.`;
    const what =
      input.mode === "custom"
        ? input.instructions!.trim()
        : `${MODE_GUIDE[input.mode]}${input.instructions?.trim() ? `\n\nAlso: ${input.instructions.trim()}` : ""}`;
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      tools: [tool] as never,
      tool_choice: { type: "auto" } as never,
      messages: [
        {
          role: "user",
          content: `${input.clipsXml}\n\nMake: ${what}\nWorking title: ${input.title}\nThere are ${input.count} clips.`,
        },
      ] as never,
    });
    const call = (
      response.content as {
        type: string;
        name?: string;
        input?: { title?: string; markdown?: string };
      }[]
    ).find((b) => b.type === "tool_use" && b.name === "write_document");
    const text = (response.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const markdown = call?.input?.markdown ?? text;
    if (!markdown?.trim())
      throw new AppError(
        ErrorCode.SERVER_ERROR,
        "The AI didn't write anything. Try again.",
        HttpStatus.BAD_GATEWAY,
      );
    return { title: call?.input?.title ?? input.title, markdown };
  }

  /** A second, separate pass: is each unit actually said by the clips? */
  private async check(
    client: Awaited<ReturnType<ComposeAiService["anthropic"]>>["client"],
    model: string,
    clipsXml: string,
    units: DraftUnit[],
  ): Promise<Map<number, { verdict: Verdict; reason?: string }>> {
    if (!units.length) return new Map();
    const tool = {
      name: "report_support",
      description: "Whether each statement is supported by the clips.",
      input_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                verdict: {
                  type: "string",
                  enum: ["supported", "inference", "partial", "unsupported"],
                },
                reason: { type: "string" },
              },
              required: ["id", "verdict"],
            },
          },
        },
        required: ["results"],
      },
    };
    const system = `You check a document against the clips it was written from. For each numbered statement, decide:
- "supported": everything it claims is stated in the clips (paraphrase is fine; the citation numbers don't matter for this).
- "inference": a conclusion, recommendation, judgement or framing question that reasons from what the clips say without adding any new fact, number, name or claim about the world (e.g. "Don't wait yet: costs are higher and scale manufacturing is unsolved"). If it slips in a new fact, it's "partial" instead.
- "partial": some of it is in the clips, but it adds or changes something (a number, a qualifier, a cause, a comparison).
- "unsupported": the clips don't say it.
Judge only against the clips, never your own knowledge. Give a short reason for anything not "supported". Call report_support once with every statement.`;
    const statements = units.map((u) => `${u.id}. ${u.text}`).join("\n");
    const response = await client.messages.create({
      model,
      max_tokens: 6000,
      system,
      tools: [tool] as never,
      tool_choice: { type: "auto" } as never,
      messages: [
        { role: "user", content: `${clipsXml}\n\nStatements:\n${statements}` },
      ] as never,
    });
    const call = (
      response.content as {
        type: string;
        name?: string;
        input?: {
          results?: { id: number; verdict: Verdict; reason?: string }[];
        };
      }[]
    ).find((b) => b.type === "tool_use" && b.name === "report_support");
    if (!call?.input?.results) throw new Error("No check results");
    return new Map(
      call.input.results.map((r) => [
        r.id,
        { verdict: r.verdict, reason: r.reason },
      ]),
    );
  }
}

function cleanSource(source?: ClipSource): ClipSource {
  const apps: ClipSource["app"][] = [
    "chatgpt",
    "claude",
    "gemini",
    "octonote",
    "web",
    "other",
  ];
  const app = source && apps.includes(source.app) ? source.app : "other";
  const url =
    source?.url && /^https?:\/\//.test(source.url)
      ? source.url.slice(0, 2000)
      : undefined;
  const title = source?.title?.trim().slice(0, 200) || undefined;
  return { app, ...(url ? { url } : {}), ...(title ? { title } : {}) };
}

const label = (s: ClipSource) =>
  `${APP_NAMES[s.app]}${s.title ? `: ${s.title}` : ""}`.replace(/"/g, "'");

function sourceLine(s: ClipSource): string {
  const name = `${APP_NAMES[s.app]}${s.title ? `: ${s.title}` : ""}`;
  return s.url ? `[${name}](${s.url})` : name;
}

/** Numbers as written ("1,200", "3.5", "40%") normalised for comparison. */
export function numbersIn(text: string): string[] {
  const found =
    text.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, " ").match(/\d+(?:[.,]\d+)*/g) ??
    [];
  return [
    ...new Set(
      found.map((n) => n.replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, "")),
    ),
  ];
}

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const citesOf = (text: string) => [
  ...new Set(
    [...text.matchAll(CITE)].flatMap((m) =>
      m[1]!.split(",").map((n) => Number(n.trim())),
    ),
  ),
];

/**
 * Splits a Markdown draft into checkable units with their character ranges:
 * each list item and table row is one unit, paragraphs split into sentences.
 * Headings, table headers and separators aren't units.
 */
export function splitUnits(markdown: string): DraftUnit[] {
  const units: DraftUnit[] = [];
  let offset = 0;
  const lines = markdown.split("\n");
  let tableRow = 0;
  for (const line of lines) {
    const start = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^#{1,6}\s/.test(trimmed) ||
      /^(-{3,}|\*{3,})$/.test(trimmed)
    ) {
      tableRow = 0;
      continue;
    }
    const add = (text: string, from: number, to: number) => {
      const plain = text.trim();
      if (plain.replace(CITE, "").replace(/[\s*_`>|:-]/g, "").length < 3)
        return;
      units.push({
        id: units.length + 1,
        text: plain,
        start: from,
        end: to,
        cites: citesOf(plain),
        status: "ok",
        reasons: [],
      });
    };
    if (trimmed.startsWith("|")) {
      // Row 0 is the header and row 1 the separator.
      if (tableRow >= 2 && !/^\|?\s*:?-{2,}/.test(trimmed))
        add(trimmed, start, start + line.length);
      tableRow++;
      continue;
    }
    tableRow = 0;
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      add(
        line.replace(/^\s*([-*+]|\d+[.)])\s+/, ""),
        start,
        start + line.length,
      );
      continue;
    }
    // A paragraph line: one unit per sentence (a sentence ends after its citation and full stop).
    const pattern = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
    for (const m of line.matchAll(pattern)) {
      const from = start + (m.index ?? 0);
      add(m[0], from, from + m[0].length);
    }
  }
  return units;
}

export { removeUnits };

/** "Q: … | A: … [n]" items as a flashcards block (citations kept on the back). */
export function flashcardsMarkdown(body: string): string {
  const cards: { id: string; front: string; back: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^\s*(?:[-*+]|\d+[.)])?\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/i.exec(
      line,
    );
    if (m)
      cards.push({
        id: `card-${cards.length + 1}`,
        front: m[1]!.trim(),
        back: m[2]!.trim(),
      });
  }
  if (!cards.length) return body;
  return `\`\`\`flashcards\n${JSON.stringify({ title: "Flashcards", cards }, null, 2)}\n\`\`\``;
}
