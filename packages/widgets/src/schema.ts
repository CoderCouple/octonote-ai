import { z } from "zod/v4";
import { widgetBlockSchema } from "./explorable/schema.js";

/** Ceilings on generated content: documents come from models and other untrusted sources. */
export const LIMITS = {
  jsonLength: 1_000_000,
  idLength: 64,
  shortText: 200,
  text: 4000,
  code: 20_000,
  blocks: 200,
  items: 50,
  tableColumns: 8,
  tableRows: 50,
} as const;

export const SCHEMA_VERSION = "1.0";

const short = z.string().trim().min(1).max(LIMITS.shortText);
/** Text that may use the inline Markdown subset: **bold**, *italic*, `code`, [links](https://…) and $math$. */
const rich = z.string().trim().min(1).max(LIMITS.text).describe("Plain text. May use **bold**, *italic*, `code`, [link](https://…) and $math$.");
const id = z.string().min(1).max(LIMITS.idLength).regex(/^[A-Za-z0-9_.:-]+$/, "Use only letters, digits, _ . : or -");
const list = <T extends z.ZodType>(item: T, max: number = LIMITS.items) => z.array(item).min(1).max(max);

const block = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) => z.object({ type: z.literal(type), id: id.optional(), ...shape });

export const headingBlock = block("heading", { level: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(), text: short });
export const paragraphBlock = block("paragraph", { text: rich });
export const listBlock = block("list", { ordered: z.boolean().optional(), items: list(rich) });
export const quoteBlock = block("quote", { text: rich, cite: short.optional() });
export const dividerBlock = block("divider", {});
export const calloutBlock = block("callout", {
  variant: z.enum(["note", "tip", "warning", "important"]).optional().describe('Defaults to "note".'),
  title: short.optional(),
  text: rich,
});
export const definitionBlock = block("definition", { term: short, definition: rich, example: rich.optional() });
export const stepsBlock = block("steps", { title: short.optional(), items: list(z.object({ title: short, text: rich.optional() })) });
export const codeBlock = block("code", {
  language: z.string().trim().max(32).optional(),
  code: z.string().min(1).max(LIMITS.code),
  caption: short.optional(),
});
export const takeawayBlock = block("takeaway", { title: short.optional().describe('Defaults to "Key takeaway".'), points: list(rich, 10) });
export const comparisonBlock = block("comparison", {
  caption: short.optional(),
  columns: z.array(short).min(1).max(LIMITS.tableColumns).describe("Column headings, not counting the row labels."),
  rows: list(z.object({ label: short, values: z.array(rich).min(1).max(LIMITS.tableColumns) }), LIMITS.tableRows),
  highlight: z.number().int().min(0).max(LIMITS.tableColumns - 1).optional().describe("Index of a column to emphasise."),
});
export const statsBlock = block("stats", { items: list(z.object({ label: short, value: z.string().trim().min(1).max(40), detail: short.optional() }), 8) });
export const timelineBlock = block("timeline", { items: list(z.object({ label: short.describe("A date, era or step name."), title: short, text: rich.optional() })) });
export const progressBlock = block("progress", { label: short, value: z.number().min(0), max: z.number().positive().optional().describe("Defaults to 100.") });

/** Blocks that can sit inside tabs and accordions. */
const leafBlocks = [
  headingBlock,
  paragraphBlock,
  listBlock,
  quoteBlock,
  dividerBlock,
  calloutBlock,
  definitionBlock,
  stepsBlock,
  codeBlock,
  takeawayBlock,
  comparisonBlock,
  statsBlock,
  timelineBlock,
  progressBlock,
] as const;
export const leafBlock = z.discriminatedUnion("type", [...leafBlocks]);

export const tabsBlock = block("tabs", { tabs: list(z.object({ label: short, blocks: list(leafBlock, 30) }), 8) });
export const accordionBlock = block("accordion", {
  allowMultiple: z.boolean().optional(),
  items: list(z.object({ title: short, blocks: list(leafBlock, 30) }), 20),
});

export const contentBlock = z.discriminatedUnion("type", [...leafBlocks, tabsBlock, accordionBlock, widgetBlockSchema]);

export const documentSchema = z.object({
  schemaVersion: z.string().regex(/^1\.\d+$/, `Unsupported schemaVersion; this library reads 1.x (current ${SCHEMA_VERSION})`).describe(`Always "${SCHEMA_VERSION}".`),
  type: z.literal("document"),
  id,
  title: short.optional(),
  blocks: list(contentBlock, LIMITS.blocks),
});

export type LeafBlock = z.infer<typeof leafBlock>;
export type ContentBlock = z.infer<typeof contentBlock>;
export type ContentDocument = z.infer<typeof documentSchema>;
export type BlockType = ContentBlock["type"];
export type BlockOf<T extends BlockType> = Extract<ContentBlock, { type: T }>;

export interface SpecIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; spec: T } | { ok: false; issues: SpecIssue[] };

/** Checks a document from any source. Never throws. */
export function validateDocument(input: unknown): ValidationResult<ContentDocument> {
  const parsed = documentSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}

/** Reads JSON text, refusing anything over the size limit. Never throws. */
export function parseDocument(json: string): ValidationResult<ContentDocument> {
  if (json.length > LIMITS.jsonLength) return { ok: false, issues: [{ path: "", message: `Longer than ${LIMITS.jsonLength} characters` }] };
  try {
    return validateDocument(JSON.parse(json));
  } catch (error) {
    return { ok: false, issues: [{ path: "", message: `Not valid JSON: ${(error as Error).message}` }] };
  }
}

/** A provider-neutral tool definition: `inputSchema` is `input_schema` for Anthropic, `parameters` for OpenAI and Gemini. */
export function documentToolDefinition(name = "create_content_document") {
  return {
    name,
    description: [
      "Write explanatory content as a document of blocks rendered as polished UI widgets.",
      `Set schemaVersion to "${SCHEMA_VERSION}". Use plain text with the inline subset **bold**, *italic*, \`code\`, [link](https://…) and $math$; never HTML.`,
      "Blocks: heading, paragraph, list, quote, divider, callout (note/tip/warning/important), definition, steps, code, takeaway, comparison (a table: columns + rows of label and values), stats, timeline, progress, tabs and accordion (each holding other blocks).",
      "Prefer a structured block (steps, comparison, definition, timeline) over a long paragraph whenever it fits.",
    ].join("\n"),
    inputSchema: z.toJSONSchema(documentSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>,
  };
}
