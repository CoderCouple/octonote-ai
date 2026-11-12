import { z } from "zod/v4";
import type { Catalog, Issue, RenderBlock } from "./catalog.js";
import { MAX_BLOCKS } from "./prompt.js";

export interface PlanBlock {
  kind: string;
  purpose: string;
}

export interface Plan {
  /** "edit" only appears for follow-ups that changed an earlier answer. */
  strategy: "text" | "compose" | "custom" | "edit";
  reason: string;
  title?: string;
  blocks: PlanBlock[];
  /** For "custom": the experience the catalog couldn't provide. */
  customIdea?: string;
}

/** A finished response: validated blocks in order. */
export interface ComposedResponse {
  title?: string;
  blocks: RenderBlock[];
}

export function planSchema(catalog: Catalog) {
  return z.object({
    strategy: z.enum(["text", "compose", "custom"]),
    reason: z.string().min(1).max(400).describe("One sentence: why this strategy and these blocks suit the request."),
    title: z.string().max(120).optional(),
    blocks: z
      .array(z.object({ kind: z.enum(catalog.kinds() as [string, ...string[]]), purpose: z.string().min(1).max(200).describe("One short sentence.") }))
      .min(1)
      .max(MAX_BLOCKS),
    customIdea: z.string().max(600).optional(),
  });
}

export function planTool(catalog: Catalog) {
  return {
    name: "plan_response",
    description: "Plan which blocks the response will use, in order, before writing it.",
    inputSchema: z.toJSONSchema(planSchema(catalog), { io: "input" }) as Record<string, unknown>,
  };
}

/** The tool the model writes the response with. Its schema only offers the given kinds. */
export function responseTool(catalog: Catalog) {
  const blocks = catalog.entries.map((e) => e.jsonSchema());
  return {
    name: "write_response",
    description: "Write the response as an ordered list of blocks.",
    inputSchema: {
      type: "object",
      required: ["blocks"],
      properties: {
        title: { type: "string", maxLength: 120 },
        blocks: { type: "array", minItems: 1, maxItems: MAX_BLOCKS, items: blocks.length === 1 ? blocks[0] : { anyOf: blocks } },
      },
    } as Record<string, unknown>,
  };
}

/** The tool for fixing one block that failed validation. */
export function repairTool(catalog: Catalog, kind: string) {
  return {
    name: "fix_block",
    description: `Return the corrected ${kind} block.`,
    inputSchema: catalog.get(kind)!.jsonSchema(),
  };
}

export type BlockCheck = { ok: true; block: RenderBlock } | { ok: false; kind?: string; issues: Issue[] };

/** Validates one block the model wrote against the catalog. Never throws. */
export function checkBlock(catalog: Catalog, raw: unknown, id: string): BlockCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, issues: [{ path: "", message: "A block must be an object" }] };
  const block = raw as Record<string, unknown>;
  const kind = typeof block.kind === "string" ? block.kind : undefined;
  const entry = kind ? catalog.get(kind) : undefined;
  if (!entry) return { ok: false, kind, issues: [{ path: "kind", message: `Unknown kind "${String(block.kind)}". Use one of: ${catalog.kinds().join(", ")}` }] };
  try {
    const result = entry.validate(block, id);
    return result.ok ? { ok: true, block: { ...result.block, source: block } } : { ok: false, kind, issues: result.issues };
  } catch (error) {
    return { ok: false, kind, issues: [{ path: "", message: `Could not check this block: ${(error as Error).message}` }] };
  }
}

/** Validates a whole response at once (e.g. one stored earlier). Invalid blocks are left out and reported. */
export function checkResponse(catalog: Catalog, raw: unknown): { response: ComposedResponse; dropped: { index: number; issues: Issue[] }[] } {
  const value = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; blocks?: unknown };
  const blocks = Array.isArray(value.blocks) ? value.blocks.slice(0, MAX_BLOCKS) : [];
  const dropped: { index: number; issues: Issue[] }[] = [];
  const ok: RenderBlock[] = [];
  blocks.forEach((raw, index) => {
    const result = checkBlock(catalog, raw, `b${index + 1}`);
    if (result.ok) ok.push(result.block);
    else dropped.push({ index, issues: result.issues });
  });
  return { response: { title: typeof value.title === "string" ? value.title.slice(0, 120) : undefined, blocks: ok }, dropped };
}

/**
 * Rebuilds a response the client sent back (blocks as written, with their ids),
 * validating every block again: the client is not trusted.
 */
export function restoreResponse(catalog: Catalog, raw: unknown): ComposedResponse | undefined {
  const value = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; blocks?: unknown };
  if (!Array.isArray(value.blocks)) return undefined;
  const blocks: RenderBlock[] = [];
  for (const item of value.blocks.slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== "object") continue;
    const { id, ...source } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^b\d{1,3}$/.test(id)) continue;
    const result = checkBlock(catalog, source, id);
    if (result.ok) blocks.push(result.block);
  }
  return blocks.length ? { title: typeof value.title === "string" ? value.title.slice(0, 120) : undefined, blocks } : undefined;
}
