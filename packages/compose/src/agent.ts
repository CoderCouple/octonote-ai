import { defaultCatalog, type Catalog, type Issue, type RenderBlock } from "./catalog.js";
import { customEntry } from "./custom.js";
import { composerSystem, MAX_BLOCKS, MAX_RICH_BLOCKS, plannerSystem } from "./prompt.js";
import { checkBlock, planSchema, planTool, repairTool, responseTool, type BlockCheck, type ComposedResponse, type Plan } from "./response.js";
import { readPartialResponse } from "./stream.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The only thing compose needs from a model provider: force one tool call and
 * return its input. `onPartial` gets the tool input's JSON text as it streams,
 * when the provider can stream. See `anthropicModel` for an implementation.
 */
export interface ModelClient {
  callTool(request: {
    system: string;
    messages: ModelMessage[];
    tool: ToolDefinition;
    maxTokens?: number;
    onPartial?: (jsonSoFar: string) => void;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export type ComposeEvent =
  | { type: "plan"; plan: Plan }
  | { type: "title"; title: string }
  /** The block being written right now; `markdown` grows while a text block streams. */
  | { type: "pending"; index: number; kind?: string; markdown?: string }
  | { type: "block"; index: number; block: RenderBlock; repaired?: boolean }
  | { type: "dropped"; index: number; kind?: string; issues: Issue[] }
  /** Follow-up edits to a response already on screen. */
  | { type: "replace"; id: string; block: RenderBlock }
  | { type: "insert"; after?: string; block: RenderBlock }
  | { type: "remove"; id: string }
  | { type: "done"; response: ComposedResponse; plan: Plan }
  | { type: "error"; message: string };

export interface ComposeOptions {
  question: string;
  model: ModelClient;
  catalog?: Catalog;
  /** Earlier turns, oldest first, for follow-up questions. */
  history?: ModelMessage[];
  signal?: AbortSignal;
  /** Fix invalid blocks with one more model call each. Defaults to true. */
  repair?: boolean;
  /**
   * Let the agent write custom sandboxed code when no block fits. Off by
   * default; render the result with ResponseView, which isolates it.
   */
  allowCustom?: boolean;
}

/** A simple queue that turns callbacks into an async iterator. */
function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(item: T) {
      items.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        while (items.length) yield items.shift()!;
        if (closed) return;
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
      }
    },
  };
}

/** One repair round for a block that failed validation: the model sees its block and the exact problems. Never throws. */
export async function fixBlock({
  model,
  catalog,
  raw,
  kind,
  issues,
  id,
  signal,
}: {
  model: ModelClient;
  catalog: Catalog;
  raw: Record<string, unknown>;
  kind: string;
  issues: Issue[];
  id: string;
  signal?: AbortSignal;
}): Promise<BlockCheck> {
  try {
    const fixed = await model.callTool({
      system: composerSystem(catalog.only([kind])),
      messages: [
        {
          role: "user",
          content: `This ${kind} block failed validation. Fix every problem and keep its content otherwise.\n\nBlock:\n${JSON.stringify(raw)}\n\nProblems:\n${issues.map((i) => `- ${i.path || "(block)"}: ${i.message}`).join("\n")}`,
        },
      ],
      tool: repairTool(catalog, kind),
      maxTokens: 6000,
      signal,
    });
    return checkBlock(catalog, fixed, id);
  } catch (error) {
    return { ok: false, kind, issues: [{ path: "", message: `Repair failed: ${(error as Error).message}` }] };
  }
}

/**
 * Lossless fixes before the plan is checked: over-long text is trimmed and
 * blocks of unknown kinds are dropped, instead of throwing a good plan away.
 */
function tidyPlan(raw: unknown, catalog: Catalog): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const plan = raw as Record<string, unknown>;
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
  return {
    ...plan,
    reason: clip(plan.reason, 400),
    title: clip(plan.title, 120),
    customIdea: clip(plan.customIdea, 600),
    blocks: Array.isArray(plan.blocks)
      ? plan.blocks
          .filter((b) => b && typeof b === "object" && catalog.get(String((b as { kind?: unknown }).kind)))
          .slice(0, MAX_BLOCKS)
          .map((b) => ({ ...(b as object), purpose: clip((b as { purpose?: unknown }).purpose, 200) }))
      : plan.blocks,
  };
}

/** Asks the model to plan the response. The plan is validated; an invalid plan falls back to text only. */
export async function planResponse({ question, model, catalog = defaultCatalog, history = [], signal }: ComposeOptions): Promise<Plan> {
  const raw = await model.callTool({ system: plannerSystem(catalog), messages: [...history, { role: "user", content: question }], tool: planTool(catalog), maxTokens: 1200, signal });
  const parsed = planSchema(catalog).safeParse(tidyPlan(raw, catalog));
  if (parsed.success) return parsed.data;
  return { strategy: "text", reason: "The plan was unusable, so the answer is text only.", blocks: [{ kind: "text", purpose: "Answer the question" }] };
}

/**
 * Answers a question with a composed response: plan, write (streaming), check
 * every block, repair only the invalid ones, and report everything as events.
 */
export async function* composeResponse(options: ComposeOptions): AsyncGenerator<ComposeEvent> {
  const base = options.catalog ?? defaultCatalog;
  const catalog = options.allowCustom ? base.with(customEntry) : base;
  const { model, question, history = [], signal } = options;
  const events = channel<ComposeEvent>();

  const run = async () => {
    const plan = await planResponse({ ...options, catalog });
    events.push({ type: "plan", plan });

    // Offer the model only the planned kinds (plus text): a smaller schema it follows more reliably.
    const custom = plan.strategy === "custom" && catalog.get("custom") ? ["custom"] : [];
    const kinds = [...new Set(["text", ...plan.blocks.map((b) => b.kind), ...custom])].filter((k) => catalog.get(k));
    const focused = catalog.only(kinds);
    const planText = plan.blocks.map((b, i) => `${i + 1}. ${b.kind}: ${b.purpose}`).join("\n");

    const checked: (RenderBlock | null)[] = [];
    const repairs: Promise<void>[] = [];
    let titleSent = false;
    let lastPending = "";
    let richCount = 0;

    const accept = (raw: Record<string, unknown>, index: number) => {
      const id = `b${index + 1}`;
      const result = checkBlock(focused, raw, id);
      if (result.ok) {
        const rich = focused.get(result.block.kind)?.weight === "rich";
        if (rich && ++richCount > MAX_RICH_BLOCKS) {
          events.push({ type: "dropped", index, kind: result.block.kind, issues: [{ path: "", message: `More than ${MAX_RICH_BLOCKS} interactive blocks` }] });
          return;
        }
        checked[index] = result.block;
        events.push({ type: "block", index, block: result.block });
        return;
      }
      if (options.repair === false || !result.kind || !focused.get(result.kind)) {
        events.push({ type: "dropped", index, kind: result.kind, issues: result.issues });
        return;
      }
      // Repairs run alongside the rest of the stream; only this block waits.
      repairs.push(
        fixBlock({ model, catalog: focused, raw, kind: result.kind, issues: result.issues, id, signal }).then((second) => {
          if (second.ok) {
            checked[index] = second.block;
            events.push({ type: "block", index, block: second.block, repaired: true });
          } else events.push({ type: "dropped", index, kind: result.kind, issues: second.issues });
        }),
      );
    };

    let seen = 0;
    const onPartial = (json: string) => {
      const partial = readPartialResponse(json);
      if (partial.title && !titleSent) {
        titleSent = true;
        events.push({ type: "title", title: partial.title });
      }
      while (seen < partial.complete.length) accept(partial.complete[seen]!, seen++);
      if (partial.pending) {
        const key = `${seen}:${partial.pending.kind}:${partial.pending.markdown?.length ?? 0}`;
        if (key !== lastPending) {
          lastPending = key;
          events.push({ type: "pending", index: seen, ...partial.pending });
        }
      }
    };

    const final = (await model.callTool({
      system: composerSystem(focused),
      messages: [...history, { role: "user", content: `${question}\n\nPlan to follow:\n${planText}${plan.title ? `\nTitle: ${plan.title}` : ""}` }],
      tool: responseTool(focused),
      maxTokens: 16_000,
      onPartial,
      signal,
    })) as { title?: unknown; blocks?: unknown };

    // Whatever the stream didn't deliver (or a provider that doesn't stream) is checked now.
    const blocks = Array.isArray(final?.blocks) ? final.blocks : [];
    const title = typeof final?.title === "string" ? final.title.slice(0, 120) : plan.title;
    if (title && !titleSent) events.push({ type: "title", title });
    for (; seen < blocks.length; seen++) accept(blocks[seen] as Record<string, unknown>, seen);
    await Promise.all(repairs);

    const response: ComposedResponse = { title, blocks: checked.filter((b): b is RenderBlock => !!b) };
    if (!response.blocks.length) throw new Error("The model didn't produce any usable blocks.");
    events.push({ type: "done", response, plan });
  };

  run()
    .catch((error) => events.push({ type: "error", message: signal?.aborted ? "Cancelled" : (error as Error).message }))
    .finally(() => events.close());
  yield* events.drain();
}

/** Runs composeResponse to the end and returns the result, for servers that don't stream. */
export async function compose(options: ComposeOptions): Promise<{ response: ComposedResponse; plan: Plan; dropped: Extract<ComposeEvent, { type: "dropped" }>[] }> {
  const dropped: Extract<ComposeEvent, { type: "dropped" }>[] = [];
  for await (const event of composeResponse(options)) {
    if (event.type === "dropped") dropped.push(event);
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") return { response: event.response, plan: event.plan, dropped };
  }
  throw new Error("Compose ended without a response");
}
