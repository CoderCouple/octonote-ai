import type { ActivityEvent } from "@octonote/interactive";
import { composeResponse, fixBlock, type ComposeEvent, type ComposeOptions } from "./agent.js";
import { defaultCatalog, type Catalog, type RenderBlock } from "./catalog.js";
import { composerSystem, MAX_BLOCKS } from "./prompt.js";
import { checkBlock, type ComposedResponse } from "./response.js";

/** One change to an existing response. */
export type EditOp =
  | { op: "replace"; id: string; block: Record<string, unknown> }
  | { op: "insert"; after?: string; block: Record<string, unknown> }
  | { op: "remove"; id: string };

function editTool(catalog: Catalog) {
  const block = { anyOf: catalog.entries.map((e) => e.jsonSchema()) };
  return {
    name: "edit_response",
    description: "Change an existing response with as few operations as possible.",
    inputSchema: {
      type: "object",
      required: ["ops"],
      properties: {
        summary: { type: "string", maxLength: 300, description: "One sentence saying what changed." },
        ops: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            anyOf: [
              { type: "object", required: ["op", "id", "block"], properties: { op: { const: "replace" }, id: { type: "string" }, block } },
              { type: "object", required: ["op", "block"], properties: { op: { const: "insert" }, after: { type: "string", description: "Insert after this block id; leave out to insert first." }, block } },
              { type: "object", required: ["op", "id"], properties: { op: { const: "remove" }, id: { type: "string" } } },
            ],
          },
        },
      },
    } as Record<string, unknown>,
  };
}

const routeTool = {
  name: "route_message",
  description: "Decide whether the message changes the previous answer or asks something new.",
  inputSchema: {
    type: "object",
    required: ["action"],
    properties: {
      action: { enum: ["edit", "new"], description: '"edit" for changes to the previous answer (harder quiz, different numbers, add an example, remove a part); "new" for a new question or topic.' },
    },
  } as Record<string, unknown>,
};

/** What the model sees of the current response: each block as written, with its id. */
export function describeResponse(response: ComposedResponse): string {
  return JSON.stringify(response.blocks.map((b) => ({ id: b.id, ...(b.source ?? { kind: b.kind }) })));
}

export interface EditOptions extends Omit<ComposeOptions, "question"> {
  response: ComposedResponse;
  instruction: string;
}

/**
 * Applies a follow-up like "make the quiz harder" to an existing response.
 * Only the changed blocks are written, checked and (if needed) repaired.
 */
export async function* editResponse({ response, instruction, model, catalog = defaultCatalog, signal, repair = true }: EditOptions): AsyncGenerator<ComposeEvent> {
  try {
    const raw = (await model.callTool({
      system: `${composerSystem(catalog)}\n\nYou are changing an answer you already gave. Change only what the request asks for, keep everything else exactly as it is, and keep block ids.`,
      messages: [{ role: "user", content: `Current answer (blocks with ids):\n${describeResponse(response)}\n\nChange requested: ${instruction}` }],
      tool: editTool(catalog),
      maxTokens: 12_000,
      signal,
    })) as { ops?: unknown };
    const ops = (Array.isArray(raw?.ops) ? raw.ops : []).slice(0, 6) as EditOp[];
    let blocks: RenderBlock[] = [...response.blocks];
    let next = Math.max(0, ...blocks.map((b) => Number(b.id.replace(/^b/, "")) || 0)) + 1;

    const validated = async (block: Record<string, unknown>, id: string) => {
      const first = checkBlock(catalog, block, id);
      if (first.ok || !repair || !first.kind || !catalog.get(first.kind)) return first;
      return fixBlock({ model, catalog, raw: block, kind: first.kind, issues: first.issues, id, signal });
    };

    for (const op of ops) {
      if (op.op === "remove") {
        if (!blocks.some((b) => b.id === op.id) || blocks.length <= 1) continue;
        blocks = blocks.filter((b) => b.id !== op.id);
        yield { type: "remove", id: op.id };
      } else if (op.op === "replace") {
        if (!blocks.some((b) => b.id === op.id)) continue;
        const result = await validated(op.block, op.id);
        if (!result.ok) {
          yield { type: "dropped", index: -1, kind: result.kind, issues: result.issues };
          continue;
        }
        blocks = blocks.map((b) => (b.id === op.id ? result.block : b));
        yield { type: "replace", id: op.id, block: result.block };
      } else if (op.op === "insert" && blocks.length < MAX_BLOCKS) {
        const result = await validated(op.block, `b${next++}`);
        if (!result.ok) {
          yield { type: "dropped", index: -1, kind: result.kind, issues: result.issues };
          continue;
        }
        const at = op.after ? blocks.findIndex((b) => b.id === op.after) + 1 : 0;
        blocks.splice(at, 0, result.block);
        yield { type: "insert", after: at > 0 ? blocks[at - 1]!.id : undefined, block: result.block };
      }
    }
    yield {
      type: "done",
      response: { ...response, blocks },
      plan: { strategy: "edit", reason: "Changed the previous answer.", blocks: blocks.map((b) => ({ kind: b.kind, purpose: "" })) },
    };
  } catch (error) {
    yield { type: "error", message: signal?.aborted ? "Cancelled" : (error as Error).message };
  }
}

export interface RespondOptions extends ComposeOptions {
  /** The answer currently on screen, if any. Follow-ups may edit it instead of starting again. */
  previous?: ComposedResponse;
  /** What the learner did with the previous answer, e.g. from `describeActivity`. */
  learnerContext?: string;
}

/** The entry point for a conversation turn: edit the previous answer or compose a new one. */
export async function* respond(options: RespondOptions): AsyncGenerator<ComposeEvent> {
  const { previous, learnerContext, question, model, signal } = options;
  const context = learnerContext ? `\n\n(What I did with your last answer: ${learnerContext})` : "";
  if (previous?.blocks.length) {
    let action = "new";
    try {
      const route = (await model.callTool({
        system: "You route messages in a tutoring app. The user can see your previous answer.",
        messages: [{ role: "user", content: `Previous answer: ${previous.title ?? ""} (${previous.blocks.map((b) => b.kind).join(", ")})\nMessage: ${question}` }],
        tool: routeTool,
        maxTokens: 200,
        signal,
      })) as { action?: string };
      action = route?.action === "edit" ? "edit" : "new";
    } catch {
      action = "new";
    }
    if (action === "edit") {
      yield* editResponse({ ...options, response: previous, instruction: question + context });
      return;
    }
  }
  yield* composeResponse({ ...options, question: question + context });
}

/** A short summary of what the learner did, to give the agent as context on the next turn. */
export function describeActivity(events: readonly ActivityEvent[]): string {
  const parts: string[] = [];
  for (const e of events) {
    if (e.type === "activity.completed" && e.score) parts.push(`finished the ${e.activityType} with ${e.score.percent}% (${e.score.earned}/${e.score.possible})`);
    else if (e.type === "question.answered" && e.correct === false) parts.push(`got ${e.questionId} in the ${e.activityType} wrong`);
    else if (e.type === "card.marked" && !e.known) parts.push(`marked card ${e.cardId} as still learning`);
    else if (e.type === "hint.shown") parts.push(`asked for a hint on ${e.itemId}`);
  }
  return [...new Set(parts)].slice(-12).join("; ");
}
