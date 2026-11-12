import { defaultRegistry, normalizeSpec, type ActivitySpecBase } from "@octonote/interactive";
import { SCENE_GUIDE, SCHEMA_VERSION, sceneSchema, validateScene, type Scene } from "@octonote/motion";
import { contentBlock, documentSchema, widgetBlockSchema, type ContentBlock, type WidgetBlock } from "@octonote/widgets";
import { z } from "zod/v4";
import type { CustomBlock } from "./custom.js";
import { markdownToBlocks } from "./markdown.js";

export interface Issue {
  path: string;
  message: string;
}

/**
 * A block ready to render: which library draws it, its validated spec, and
 * the block as the model wrote it (`source`), so follow-up edits can start from it.
 */
export type RenderBlock = { source?: Record<string, unknown> } & (
  | { kind: string; id: string; renderer: "content"; blocks: ContentBlock[] }
  | { kind: "widget"; id: string; renderer: "widget"; widget: WidgetBlock }
  | { kind: string; id: string; renderer: "interactive"; spec: ActivitySpecBase }
  | { kind: "scene"; id: string; renderer: "motion"; scene: Scene }
  | { kind: "custom"; id: string; renderer: "custom"; custom: CustomBlock }
);

export type BlockResult = { ok: true; block: RenderBlock } | { ok: false; issues: Issue[] };

/**
 * One kind of block the agent can put in a response. The guidance is what
 * makes the agent choose well: when the block helps, when it doesn't, and an
 * example of a good one.
 */
export interface CatalogEntry {
  kind: string;
  library: "compose" | "widgets" | "interactive" | "motion" | (string & {});
  summary: string;
  useWhen: string[];
  avoidWhen: string[];
  /** Interactive and animated blocks cost the reader effort; responses keep them few. */
  weight: "light" | "rich";
  /** JSON Schema of the block, including its `kind`. */
  jsonSchema(): Record<string, unknown>;
  example: Record<string, unknown>;
  /** Checks a block the model wrote. Never throws. */
  validate(block: Record<string, unknown>, id: string): BlockResult;
}

const toJson = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, any>;

/**
 * Rewrites a library's JSON Schema into a block schema: drops the fields the
 * agent fills in itself (schemaVersion, type, id) and adds `kind`.
 */
function blockSchema(kind: string, librarySchema: Record<string, any>, drop: string[]): Record<string, unknown> {
  const { $schema: _s, ...schema } = structuredClone(librarySchema);
  for (const key of drop) delete schema.properties?.[key];
  schema.required = ["kind", ...(schema.required ?? []).filter((key: string) => !drop.includes(key))];
  schema.properties = { kind: { type: "string", const: kind }, ...schema.properties };
  return schema;
}

const issuesOf = (error: z.ZodError, prefix = ""): Issue[] =>
  error.issues.map((i) => ({ path: [prefix, ...i.path.map(String)].filter(Boolean).join("."), message: i.message }));

const memo = <T,>(make: () => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

/* compose's own block: Markdown text */

const textEntry: CatalogEntry = {
  kind: "text",
  library: "compose",
  summary: "Prose in Markdown: paragraphs, short lists, headings, quotes, code fences, **bold**, `code`, links and $math$.",
  useWhen: ["Every response that needs explanation: frame the idea before any interactive block, and connect blocks with a sentence or two.", "Short factual answers: one text block is the whole response."],
  avoidWhen: ["Long walls of text: move structure into steps, comparison or definition blocks.", "Tables: use a comparison block."],
  weight: "light",
  jsonSchema: memo(() => ({
    type: "object",
    required: ["kind", "markdown"],
    properties: { kind: { type: "string", const: "text" }, markdown: { type: "string", maxLength: 6000, description: "Markdown. No HTML." } },
  })),
  example: { kind: "text", markdown: "Compound interest means you earn interest on your **interest**, not just on what you put in." },
  validate(block, id) {
    const markdown = block.markdown;
    if (typeof markdown !== "string" || !markdown.trim()) return { ok: false, issues: [{ path: "markdown", message: "Write the text in markdown" }] };
    if (markdown.length > 6000) return { ok: false, issues: [{ path: "markdown", message: "Longer than 6000 characters; split it or use structured blocks" }] };
    return { ok: true, block: { kind: "text", id, renderer: "content", blocks: markdownToBlocks(markdown) } };
  },
};

/* widgets: structured content blocks */

const contentKinds: { kind: ContentBlock["type"]; summary: string; useWhen: string[]; avoidWhen: string[]; example: Record<string, unknown> }[] = [
  {
    kind: "steps",
    summary: "A numbered sequence of steps, each with a title and a sentence.",
    useWhen: ["Procedures, algorithms, how-tos and processes in a fixed order."],
    avoidWhen: ["Ideas with no order.", "Processes where seeing things move matters more than reading: use a scene."],
    example: { kind: "steps", title: "Solving 2x + 3 = 11", items: [{ title: "Subtract 3", text: "2x = 8" }, { title: "Divide by 2", text: "x = 4" }] },
  },
  {
    kind: "comparison",
    summary: "A table comparing options across a few rows of features.",
    useWhen: ["Comparing two to five things side by side: options, approaches, before and after."],
    avoidWhen: ["Only one thing to describe."],
    example: { kind: "comparison", columns: ["Simple interest", "Compound interest"], rows: [{ label: "Interest on", values: ["Principal only", "Principal and past interest"] }] },
  },
  {
    kind: "definition",
    summary: "A term, its definition and an example.",
    useWhen: ["Introducing one key term the rest of the answer relies on."],
    avoidWhen: ["Many terms at once: use flashcards to study them."],
    example: { kind: "definition", term: "Principal", definition: "The amount you invest or borrow at the start.", example: "Investing $1,000 means a principal of $1,000." },
  },
  {
    kind: "callout",
    summary: "A highlighted note, tip, warning or important point.",
    useWhen: ["A common mistake, a key caveat or a memorable tip."],
    avoidWhen: ["Regular explanation: use text.", "More than one per response."],
    example: { kind: "callout", variant: "warning", text: "Rates are usually quoted per year, even when interest is paid monthly." },
  },
  {
    kind: "timeline",
    summary: "Dated or ordered events with a title and short text each.",
    useWhen: ["History, chronologies, stages over time."],
    avoidWhen: ["Steps someone performs: use steps."],
    example: { kind: "timeline", items: [{ label: "1687", title: "Principia", text: "Newton publishes his laws of motion." }] },
  },
  {
    kind: "takeaway",
    summary: "One to three key points to remember, as a closing summary.",
    useWhen: ["The end of a longer explanation."],
    avoidWhen: ["Short answers."],
    example: { kind: "takeaway", points: ["Growth compounds: each year's gain is bigger than the last."] },
  },
  {
    kind: "code",
    summary: "A code snippet with a copy button.",
    useWhen: ["Programming answers."],
    avoidWhen: ["Maths: use $math$ in text."],
    example: { kind: "code", language: "python", code: "print(1000 * 1.07 ** 15)" },
  },
];

function contentEntry(def: (typeof contentKinds)[number]): CatalogEntry {
  return {
    ...def,
    library: "widgets",
    weight: "light",
    jsonSchema: memo(() => {
      const all = toJson(documentSchema);
      const union: Record<string, any>[] = all.properties.blocks.items.oneOf ?? all.properties.blocks.items.anyOf;
      const found = union.find((s) => s.properties?.type?.const === def.kind);
      return blockSchema(def.kind, { ...found, $defs: all.$defs }, ["type", "id"]);
    }),
    validate(block, id) {
      const { kind, ...rest } = block;
      const parsed = contentBlock.safeParse({ ...rest, type: kind });
      return parsed.success ? { ok: true, block: { kind: def.kind, id, renderer: "content", blocks: [parsed.data] } } : { ok: false, issues: issuesOf(parsed.error) };
    },
  };
}

/* widgets: explorable widgets */

const widgetEntry: CatalogEntry = {
  kind: "widget",
  library: "widgets",
  summary:
    "An explorable: sliders, toggles or choices drive named formulas, and stats, charts, circles, fraction grids, donuts, meters, stacked bars or a question bank update live. Prefer direct manipulation: a sentence with draggable numbers ([input] inline, {value} live), chart handles the reader drags (a point on the curve at (a, a^2) that sets a), drag on circles, grids and meters, and play on a time-like slider. Can carry real data: tables, values looked up or summarised from them, data series (lines or points) beside formula lines, scatter charts, reference marks that follow inputs, and table views. Also seeded probability simulations (the estimate settles onto the theory), a coordinate plane with draggable points and vectors, and pin-to-compare.",
  useWhen: [
    "The idea is a relationship between quantities the learner can vary: growth, rates, proportions, probability, geometry, physics, budgets, functions.",
    "'What happens if…' questions, where trying values teaches more than reading.",
  ],
  avoidWhen: ["No numbers to vary.", "Pure memorisation: use flashcards."],
  weight: "rich",
  jsonSchema: memo(() => blockSchema("widget", toJson(widgetBlockSchema), ["type", "id"])),
  example: {
    kind: "widget",
    title: "Compound interest",
    badge: "Finance",
    description: "See how the rate changes a $1,000 investment over 15 years.",
    inputs: [{ kind: "slider", id: "rate", label: "Annual return", min: 0, max: 15, step: 0.5, value: 7, format: { suffix: "%" } }],
    values: [
      { name: "balance", formula: "1000 * (1 + rate/100)^15" },
      { name: "gain", formula: "balance - 1000" },
    ],
    views: [
      { type: "stats", items: [{ label: "After 15 years", value: "balance", format: { style: "currency" }, note: "+{gain|currency} earned" }] },
      { type: "chart", x: { from: 0, to: 15, label: "Year" }, series: [{ label: "Balance", y: "1000 * (1 + rate/100)^x" }], y: { format: { style: "currency" } } },
    ],
    note: "Assumes annual compounding with no further deposits.",
  },
  validate(block, id) {
    const { kind: _kind, ...rest } = block;
    const parsed = widgetBlockSchema.safeParse({ ...rest, type: "widget", id });
    return parsed.success ? { ok: true, block: { kind: "widget", id, renderer: "widget", widget: parsed.data } } : { ok: false, issues: issuesOf(parsed.error) };
  },
};

/* interactive: activities */

const activityGuidance: Record<string, Pick<CatalogEntry, "summary" | "useWhen" | "avoidWhen" | "example">> = {
  flashcards: {
    summary: "A deck of two-sided cards with spaced repetition.",
    useWhen: ["The learner wants to memorise terms, definitions, vocabulary, formulas or facts.", "Study or revision requests."],
    avoidWhen: ["Understanding a process or relationship.", "Quick one-off questions."],
    example: { kind: "flashcards", title: "Key terms", cards: [{ id: "c1", front: "Principal", back: "The starting amount." }] },
  },
  mcq: {
    summary: "Practice questions checked one at a time, with hints and why each option is right or wrong.",
    useWhen: ["Practising a concept just explained.", "Common misconceptions worth confronting."],
    avoidWhen: ["Quick factual lookups.", "A formal score is wanted: use quiz."],
    example: { kind: "mcq", questions: [{ id: "q1", prompt: "Which grows faster over 20 years?", options: [{ id: "a", text: "5% simple" }, { id: "b", text: "5% compound" }], correct: ["b"] }] },
  },
  quiz: {
    summary: "A scored assessment: answer everything, submit, then review. Can be timed.",
    useWhen: ["The learner asks to be tested or wants to check understanding at the end of a lesson."],
    avoidWhen: ["Mid-explanation practice: use mcq.", "Casual questions."],
    example: { kind: "quiz", passingPercent: 70, questions: [{ id: "q1", prompt: "Compound interest earns interest on…", options: [{ id: "a", text: "The principal only" }, { id: "b", text: "Principal and past interest" }], correct: ["b"] }] },
  },
  mindmap: {
    summary: "A tree of topics around one central idea that the learner can explore.",
    useWhen: ["Overviews of a broad topic and how its parts relate.", "Planning or organising ideas."],
    avoidWhen: ["Linear processes: use steps or a scene.", "Fewer than about six ideas."],
    example: { kind: "mindmap", nodes: [{ id: "root", label: "Interest" }, { id: "s", label: "Simple", parent: "root" }, { id: "c", label: "Compound", parent: "root" }] },
  },
  matching: {
    summary: "Match items in one column to their partners in the other.",
    useWhen: ["Associations: terms to definitions, causes to effects, people to discoveries."],
    avoidWhen: ["Fewer than three pairs."],
    example: { kind: "matching", prompt: "Match each term to its meaning.", pairs: [{ id: "p1", left: "Principal", right: "Starting amount" }, { id: "p2", left: "Rate", right: "Percent earned per year" }] },
  },
};

function activityEntry(type: string): CatalogEntry {
  const guidance = activityGuidance[type]!;
  return {
    kind: type,
    library: "interactive",
    weight: "rich",
    ...guidance,
    jsonSchema: memo(() => blockSchema(type, defaultRegistry.capabilities().find((c) => c.type === type)!.jsonSchema, ["schemaVersion", "type", "id"])),
    validate(block, id) {
      const { kind, ...rest } = block;
      const result = defaultRegistry.validate(normalizeSpec({ ...rest, schemaVersion: "1.0", type: kind, id }));
      return result.ok ? { ok: true, block: { kind: type, id, renderer: "interactive", spec: result.spec } } : { ok: false, issues: result.issues };
    },
  };
}

/* motion: explainer scenes */

const sceneEntry: CatalogEntry = {
  kind: "scene",
  library: "motion",
  summary:
    "An animated explainer in the style of 3Blue1Brown, played step by step with a caption per step: shapes, arrows, TeX, axes and plots drawn, written, moved, morphed and traced on a 16 × 9 canvas (origin at the centre, y up). Place things by relationship (below another element, in a row, at axis coordinates) rather than coordinates.",
  useWhen: [
    "Processes, flows and cycles where watching things move helps: a network request, an algorithm's steps, the water cycle.",
    "Maths and science where motion shows structure: a shape turning into another, a point tracing a curve, a quantity growing.",
  ],
  avoidWhen: ["Static facts.", "Anything a slider explores better: use a widget."],
  weight: "rich",
  jsonSchema: memo(() => ({ ...blockSchema("scene", toJson(sceneSchema), ["schemaVersion", "type", "id"]), description: SCENE_GUIDE })),
  example: {
    kind: "scene",
    title: "A request to a server",
    elements: [
      { id: "browser", shape: "rect", w: 3, h: 1.4, radius: 0.2, label: "Browser", color: "blue", at: [-4.5, 0.5] },
      { id: "server", shape: "rect", w: 3, h: 1.4, radius: 0.2, label: "Server", color: "green", at: [4.5, 0.5], hidden: true },
      { id: "req", shape: "arrow", from: "browser", to: "server", label: "GET /", color: "orange", hidden: true },
      { id: "packet", shape: "dot", r: 0.15, color: "yellow", at: [-3, 0.5], hidden: true },
    ],
    steps: [
      { caption: "The browser starts a request.", actions: [{ do: "draw", target: "browser" }] },
      { caption: "It names the server it wants and what it is asking for.", actions: [{ do: "draw", target: "server" }, { do: "draw", target: "req" }] },
      { caption: "The request travels across the network.", actions: [{ do: "show", target: "packet" }, { do: "trace", target: "packet", along: "req" }] },
      { caption: "The server receives it.", actions: [{ do: "fadeOut", target: "packet" }, { do: "indicate", target: "server" }] },
    ],
  },
  validate(block, id) {
    const { kind: _kind, ...rest } = block;
    const result = validateScene({ ...rest, schemaVersion: SCHEMA_VERSION, type: "scene", id });
    return result.ok ? { ok: true, block: { kind: "scene", id, renderer: "motion", scene: result.spec } } : { ok: false, issues: result.issues };
  },
};

export interface Catalog {
  entries: CatalogEntry[];
  get(kind: string): CatalogEntry | undefined;
  kinds(): string[];
  /** A new catalog with more (or replaced) entries. */
  with(...entries: CatalogEntry[]): Catalog;
  /** Only these kinds, for a smaller, more focused schema. */
  only(kinds: readonly string[]): Catalog;
}

export function createCatalog(entries: CatalogEntry[]): Catalog {
  const byKind = new Map(entries.map((e) => [e.kind, e]));
  return {
    entries,
    get: (kind) => byKind.get(kind),
    kinds: () => entries.map((e) => e.kind),
    with: (...more) => createCatalog([...entries.filter((e) => !more.some((m) => m.kind === e.kind)), ...more]),
    only: (kinds) => createCatalog(entries.filter((e) => kinds.includes(e.kind))),
  };
}

/** Everything the three libraries offer. */
export const defaultCatalog = createCatalog([
  textEntry,
  widgetEntry,
  ...["flashcards", "mcq", "quiz", "mindmap", "matching"].map(activityEntry),
  sceneEntry,
  ...contentKinds.map(contentEntry),
]);
