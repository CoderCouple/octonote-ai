import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { AiKeysService } from "./ai-keys.service";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";

/**
 * Interactive note blocks (widgets, flashcards, quizzes, mind maps, matching,
 * animated scenes, sandboxed apps) and the AI that writes them.
 *
 * @octonote/compose is an ES module; TypeScript turns this import() into
 * require(), which Node 22.12+ can do for ES modules (require(esm)).
 */
type Compose = typeof import("@octonote/compose");
let composeModule: Promise<Compose> | null = null;
function loadCompose(): Promise<Compose> {
  composeModule ??= import("@octonote/compose");
  return composeModule;
}

/** AI calls per person per hour; the model is the expensive part. */
const MAX_AI_PER_HOUR = 30;
const HOUR = 3_600_000;

type Block = { type?: unknown; id?: unknown; props?: Record<string, unknown>; content?: unknown; children?: unknown };

export interface InteractiveProblem {
  blockId: string;
  kind: string;
  issues: { path: string; message: string }[];
}

@Injectable()
export class ComposeAiService {
  private readonly recent = new Map<string, number[]>();

  /** Without the keys service (some tests), everyone uses the server's key. */
  constructor(@Optional() private readonly keys?: AiKeysService) {}

  /**
   * The API key for this person's AI calls: their own when they've added one
   * (bring your own key), else the server's. `own` says which.
   */
  private async keyFor(userId: string): Promise<{ apiKey: string; own: boolean }> {
    const own = (await this.keys?.keyFor(userId)) ?? null;
    if (own) return { apiKey: own, own: true };
    const server = process.env.ANTHROPIC_API_KEY?.trim();
    if (!server) throw new AppError(ErrorCode.SERVER_ERROR, "AI isn't set up on this server. You can add your own Anthropic key in Settings → AI.", HttpStatus.SERVICE_UNAVAILABLE);
    return { apiKey: server, own: false };
  }

  /** Notes may embed every catalog kind, including sandboxed custom apps (user decision 2026-11-11). */
  private async catalog() {
    const compose = await loadCompose();
    return { compose, catalog: compose.defaultCatalog.with(compose.customEntry) };
  }

  private async model(userId: string) {
    const { apiKey } = await this.keyFor(userId);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const compose = await loadCompose();
    return compose.anthropicModel(new Anthropic({ apiKey }), process.env.COMPOSE_MODEL?.trim() || "claude-opus-5-5");
  }

  /**
   * Counts one AI call against the person's hourly allowance (shared by every
   * AI feature), or refuses. People using their own key pay for their calls,
   * so they have no allowance.
   */
  async useAiCall(userId: string) {
    if ((await this.keys?.keyFor(userId)) ?? null) return;
    this.limit(userId);
  }

  /** The Anthropic client and model for this person, for features that talk to Claude directly (the in-app chat). */
  async anthropic(userId: string) {
    const { apiKey } = await this.keyFor(userId);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    return { client: new Anthropic({ apiKey }), model: process.env.CHAT_MODEL?.trim() || process.env.COMPOSE_MODEL?.trim() || "claude-opus-5-5" };
  }

  /** Checks one block's spec; issues read like instructions, for a model to fix. */
  async checkSpec(kind: string, spec: unknown): Promise<{ ok: true } | { ok: false; issues: { path: string; message: string }[] }> {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { ok: false, issues: [{ path: "spec", message: "Must be a JSON object" }] };
    const { compose, catalog } = await this.catalog();
    if (!catalog.get(kind)) return { ok: false, issues: [{ path: "kind", message: `Unknown kind "${kind}"` }] };
    const result = compose.checkBlock(catalog, { ...(spec as object), kind }, "b1");
    return result.ok ? { ok: true } : { ok: false, issues: result.issues.slice(0, 12) };
  }

  /** In-memory, per API instance: enough to stop runaway loops and abuse while we run one instance. */
  private limit(userId: string) {
    const now = Date.now();
    const calls = (this.recent.get(userId) ?? []).filter((t) => now - t < HOUR);
    if (calls.length >= MAX_AI_PER_HOUR) {
      throw new AppError(ErrorCode.RATE_LIMITED, "That's a lot of AI requests in one hour. Please try again a little later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    calls.push(now);
    this.recent.set(userId, calls);
  }

  /** Writes a note section for a request: text plus whatever interactive blocks fit, as markdown. */
  async compose(userId: string, request: string): Promise<{ markdown: string; strategy: string; kinds: string[] }> {
    await this.useAiCall(userId);
    const [{ compose, catalog }, model] = await Promise.all([this.catalog(), this.model(userId)]);
    try {
      const { response, plan } = await compose.compose({ question: request, model, catalog, allowCustom: true });
      return { markdown: compose.responseToMarkdown(response), strategy: plan.strategy, kinds: response.blocks.map((b) => b.kind) };
    } catch (error) {
      throw new AppError(ErrorCode.SERVER_ERROR, `The AI couldn't build this: ${(error as Error).message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  /** Changes one interactive block as asked ("make it harder", "add two cards"). */
  async editBlock(userId: string, input: { kind: string; spec: Record<string, unknown>; instruction: string }): Promise<{ kind: string; spec: Record<string, unknown> }> {
    await this.useAiCall(userId);
    const [{ compose, catalog }, model] = await Promise.all([this.catalog(), this.model(userId)]);
    const current = compose.restoreResponse(catalog, { blocks: [{ id: "b1", ...input.spec, kind: input.kind }] });
    if (!current) throw new AppError(ErrorCode.VALIDATION_ERROR, "Fix this block's errors before asking the AI to change it.", HttpStatus.UNPROCESSABLE_ENTITY);
    let result: { kind: string; spec: Record<string, unknown> } | null = null;
    for await (const event of compose.editResponse({ response: current, instruction: input.instruction, model, catalog })) {
      if (event.type === "error") throw new AppError(ErrorCode.SERVER_ERROR, `The AI couldn't change this: ${event.message}`, HttpStatus.BAD_GATEWAY);
      if (event.type === "done") {
        const block = event.response.blocks[0];
        if (block?.source) {
          const { kind, ...spec } = block.source as Record<string, unknown>;
          result = { kind: String(kind), spec };
        }
      }
    }
    if (!result) throw new AppError(ErrorCode.SERVER_ERROR, "The AI didn't return a usable block.", HttpStatus.BAD_GATEWAY);
    return result;
  }

  /** What an agent needs to write one kind of interactive block: guidance, an example and the JSON Schema. */
  async format(kind?: string) {
    const { catalog } = await this.catalog();
    const kinds = ["widget", "flashcards", "mcq", "quiz", "mindmap", "matching", "scene", "custom"];
    if (!kind) {
      return {
        how: "Put a fence named after the kind in the note's markdown, holding the block's JSON (without a kind field), e.g. ```quiz\n{\"questions\":[…]}\n```. Invalid blocks are refused with the reason; fix and retry.",
        kinds: kinds.map((k) => ({ kind: k, summary: catalog.get(k)!.summary, useWhen: catalog.get(k)!.useWhen })),
      };
    }
    const entry = kinds.includes(kind) ? catalog.get(kind) : undefined;
    if (!entry) throw new AppError(ErrorCode.INVALID_REQUEST, `Unknown kind "${kind}". Use one of: ${kinds.join(", ")}`, HttpStatus.BAD_REQUEST);
    const { kind: _kind, ...example } = entry.example;
    return {
      kind,
      fence: `\`\`\`${kind}\n${JSON.stringify(example)}\n\`\`\``,
      summary: entry.summary,
      useWhen: entry.useWhen,
      avoidWhen: entry.avoidWhen,
      jsonSchema: entry.jsonSchema(),
    };
  }

  /** Every interactive block in a note that doesn't validate. */
  async findProblems(document: unknown): Promise<InteractiveProblem[]> {
    const blocks = interactiveBlocks(document);
    if (!blocks.length) return [];
    const { compose, catalog } = await this.catalog();
    const problems: InteractiveProblem[] = [];
    for (const block of blocks) {
      const kind = String(block.props?.kind ?? "");
      const blockId = String(block.id ?? "");
      let spec: unknown;
      try {
        spec = JSON.parse(String(block.props?.spec ?? ""));
      } catch {
        problems.push({ blockId, kind, issues: [{ path: "spec", message: "Not valid JSON" }] });
        continue;
      }
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        problems.push({ blockId, kind, issues: [{ path: "spec", message: "Must be a JSON object" }] });
        continue;
      }
      const result = compose.checkBlock(catalog, { ...(spec as object), kind }, "b1");
      if (!result.ok) problems.push({ blockId, kind, issues: result.issues.slice(0, 5) });
    }
    return problems;
  }

  /** For writes from the CLI and assistants: refuse invalid blocks with a message an agent can act on. */
  async assertValid(document: unknown): Promise<void> {
    const problems = await this.findProblems(document);
    if (!problems.length) return;
    const detail = problems
      .slice(0, 3)
      .map((p) => `${p.kind} block: ${p.issues.map((i) => `${i.path || "(block)"} ${i.message}`).join("; ")}`)
      .join(" | ");
    throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid interactive block. ${detail}`, HttpStatus.UNPROCESSABLE_ENTITY);
  }

  /**
   * For autosaves from the editor: never block saving. An invalid interactive
   * block becomes a code block holding its JSON, so nothing is lost and it
   * reads back as interactive once fixed.
   */
  async demoteInvalid(document: unknown): Promise<unknown> {
    const problems = await this.findProblems(document);
    if (!problems.length) return document;
    const bad = new Set(problems.map((p) => p.blockId));
    const visit = (blocks: Block[]): Block[] =>
      blocks.map((b) => {
        const children = Array.isArray(b.children) ? visit(b.children as Block[]) : b.children;
        if (b.type !== "interactive" || !bad.has(String(b.id ?? ""))) return { ...b, children };
        return {
          id: b.id,
          type: "codeBlock",
          props: { language: String(b.props?.kind ?? "json") },
          content: [{ type: "text", text: String(b.props?.spec ?? ""), styles: {} }],
          children,
        };
      });
    const doc = document as { blocks?: Block[] };
    return { ...doc, blocks: visit(doc.blocks ?? []) };
  }
}

export function interactiveBlocks(document: unknown): Block[] {
  const found: Block[] = [];
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks as Block[]) {
      if (b && typeof b === "object") {
        if (b.type === "interactive") found.push(b);
        visit(b.children);
      }
    }
  };
  visit((document as { blocks?: unknown } | null)?.blocks);
  return found;
}
