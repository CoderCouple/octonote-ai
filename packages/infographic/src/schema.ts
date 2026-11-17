import { z } from "zod/v4";
import { ICON_NAMES } from "./icons.js";

/**
 * An infographic spec: a title, a layout, an item style, a palette and the
 * items themselves. Every layout reads the same item shape (a label, a short
 * description, a number and/or a display figure, an icon, a longer detail
 * that opens on click, and children for the layouts that nest), so the AI
 * only has one thing to learn and switching layouts keeps the content.
 *
 * Text has hard caps, so nothing can overflow the layout it lands in.
 */

export const SCHEMA_VERSION = "1.0" as const;

/** Every layout, by family. */
export const LAYOUT_FAMILIES = {
  list: ["grid", "arrows", "checklist", "tiers", "sector"],
  sequence: ["steps", "timeline", "roadmap", "snake", "zigzag", "stairs", "funnel", "pyramid", "cycle"],
  compare: ["versus", "pros-cons", "swot", "quadrant", "columns"],
  hierarchy: ["tree", "layers"],
  chart: ["bars", "columns-chart", "pie", "donut", "stats", "rings", "line"],
  relation: ["hub"],
} as const;

export type LayoutFamily = keyof typeof LAYOUT_FAMILIES;
export const LAYOUTS = Object.values(LAYOUT_FAMILIES).flat() as [Layout, ...Layout[]];
export type Layout = (typeof LAYOUT_FAMILIES)[LayoutFamily][number];

export const familyOf = (layout: Layout): LayoutFamily =>
  (Object.keys(LAYOUT_FAMILIES) as LayoutFamily[]).find((f) => (LAYOUT_FAMILIES[f] as readonly string[]).includes(layout))!;

/** How each item is drawn, where the layout lets you choose. */
export const ITEM_STYLES = ["badge", "card", "ribbon", "candy", "indexed", "pill", "underline", "plain", "icon"] as const;
export type ItemStyle = (typeof ITEM_STYLES)[number];

/** The styles each layout offers; the first is its default. Layouts not listed draw their own items. */
export const LAYOUT_STYLES: Partial<Record<Layout, readonly ItemStyle[]>> = {
  grid: ["badge", "card", "ribbon", "candy", "indexed", "icon", "underline"],
  arrows: ["badge", "plain"],
  steps: ["card", "badge", "underline", "plain"],
  timeline: ["card", "underline", "plain"],
  roadmap: ["card", "badge", "pill", "underline"],
  snake: ["card", "pill", "underline"],
  zigzag: ["card", "underline", "plain"],
  stairs: ["card", "indexed", "underline"],
  versus: ["card", "badge", "underline"],
  "pros-cons": ["card", "underline"],
  columns: ["card", "pill", "underline"],
  tree: ["card", "pill", "badge"],
  layers: ["pill", "card"],
  hub: ["icon", "card", "pill"],
};

export const PALETTES = ["default", "ocean", "sunset", "forest", "berry", "mono"] as const;
export type Palette = (typeof PALETTES)[number];

export const TONES = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "indigo", "gray"] as const;
export type Tone = (typeof TONES)[number];

export const LIMITS = {
  items: 12,
  children: 8,
  depth: 3,
  label: 48,
  desc: 140,
  detail: 400,
  display: 16,
} as const;

/** How many top-level items each layout takes. */
export const ITEM_COUNTS: Record<Layout, [number, number]> = {
  grid: [2, 12],
  arrows: [2, 6],
  checklist: [2, 10],
  tiers: [3, 6],
  sector: [3, 8],
  steps: [2, 6],
  timeline: [2, 8],
  roadmap: [2, 8],
  snake: [4, 12],
  zigzag: [3, 8],
  stairs: [3, 6],
  funnel: [3, 6],
  pyramid: [3, 6],
  cycle: [3, 8],
  versus: [2, 2],
  "pros-cons": [2, 2],
  swot: [4, 4],
  quadrant: [4, 4],
  columns: [2, 4],
  tree: [1, 1],
  layers: [2, 6],
  bars: [2, 10],
  "columns-chart": [2, 12],
  pie: [2, 8],
  donut: [2, 8],
  stats: [2, 6],
  rings: [2, 6],
  line: [3, 24],
  hub: [1, 1],
};

/** Layouts whose items group children: comparisons, trees, layers and the hub. */
const NESTED: ReadonlySet<Layout> = new Set(["versus", "pros-cons", "swot", "columns", "tree", "layers", "hub"]);
/** Layouts that need a number on every item. */
const NUMERIC: ReadonlySet<Layout> = new Set(["bars", "columns-chart", "pie", "donut", "rings", "line", "funnel"]);

const label = z.string().trim().min(1).max(LIMITS.label).describe("A few words. Short labels look best: aim for 2–5 words.");
const desc = z.string().trim().min(1).max(LIMITS.desc).describe("One short sentence shown under the label.");
const detail = z.string().trim().min(1).max(LIMITS.detail).describe("Two or three sentences the reader sees when they click this item.");
const display = z.string().trim().min(1).max(LIMITS.display).describe('A short figure shown large, e.g. "71%", "3.2B", "1969", "Q3".');

export interface InfographicItem {
  label: string;
  desc?: string;
  detail?: string;
  value?: number;
  display?: string;
  icon?: (typeof ICON_NAMES)[number];
  tone?: Tone;
  done?: boolean;
  children?: InfographicItem[];
}

export const itemSchema: z.ZodType<InfographicItem> = z.lazy(() =>
  z.object({
    label,
    desc: desc.optional(),
    detail: detail.optional(),
    value: z.number().finite().optional().describe("A number for charts, funnels and rings (rings: 0–100)."),
    display: display.optional(),
    icon: z.enum(ICON_NAMES).optional(),
    tone: z.enum(TONES).optional().describe("Override this item's colour; usually leave it to the palette."),
    done: z.boolean().optional().describe("Checklist only: ticked or not."),
    children: z.array(itemSchema).min(1).max(LIMITS.children).optional().describe("Comparisons, trees, layers and the hub: the items inside this one."),
  }),
);

export const infographicSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    type: z.literal("infographic"),
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(80),
    subtitle: z.string().trim().min(1).max(200).optional(),
    layout: z.enum(LAYOUTS).describe(
      [
        "list — grid: cards in a grid · arrows: a row of chevrons · checklist: ticked items · tiers: stacked bands, widest first · sector: a ring cut into segments",
        "sequence — steps: numbered steps joined by a line · timeline: dated events on a line (display = the date) · roadmap: a vertical spine, items alternating sides · snake: steps that wrap row by row · zigzag: steps above and below a line · stairs: steps climbing up · funnel: narrowing stages (value each) · pyramid: a triangle cut into levels, base last · cycle: a loop of stages",
        "compare — versus: two sides with a VS badge (2 items with children) · pros-cons: good vs bad (2 items with children) · swot: 4 items (Strengths, Weaknesses, Opportunities, Threats) with children · quadrant: a 2×2 matrix (4 items, see axes) · columns: 2–4 columns with children",
        "hierarchy — tree: one root item with children (and grandchildren) · layers: rows (items) each holding pills (children), like an architecture stack",
        "chart — bars: horizontal bars · columns-chart: vertical columns · pie / donut: shares of a whole · stats: big numbers (display) · rings: progress rings (value 0–100) · line: a trend (value per point)",
        "relation — hub: one centre item with children around it",
      ].join("\n"),
    ),
    style: z.enum(ITEM_STYLES).optional().describe("How items are drawn; each layout offers a few and picks a good default."),
    palette: z.enum(PALETTES).optional(),
    items: z.array(itemSchema).min(1).max(LIMITS.items),
    axes: z
      .object({ x: z.tuple([label, label]), y: z.tuple([label, label]) })
      .optional()
      .describe("Quadrant only: the low and high end of each axis, e.g. x: [Low effort, High effort]."),
    unit: z.string().trim().min(1).max(16).optional().describe("Charts: shown after each number, e.g. %, kg, M users."),
    source: z.string().trim().min(1).max(160).optional().describe("Where the facts come from."),
  })
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const [min, max] = ITEM_COUNTS[spec.layout];
    if (spec.items.length < min || spec.items.length > max)
      issue(["items"], min === max ? `The ${spec.layout} layout needs exactly ${min} item${min === 1 ? "" : "s"}.` : `The ${spec.layout} layout needs ${min} to ${max} items.`);
    const styles = LAYOUT_STYLES[spec.layout];
    if (spec.style && !styles?.includes(spec.style))
      issue(["style"], styles ? `The ${spec.layout} layout offers these styles: ${styles.join(", ")}.` : `The ${spec.layout} layout draws its own items; leave style out.`);
    if (spec.axes && spec.layout !== "quadrant") issue(["axes"], "Only the quadrant layout uses axes.");

    const nested = NESTED.has(spec.layout);
    spec.items.forEach((item, i) => {
      if (nested && !item.children?.length) issue(["items", i, "children"], `In the ${spec.layout} layout every item needs children.`);
      if (!nested && item.children?.length) issue(["items", i, "children"], `The ${spec.layout} layout doesn't nest items; use a tree, layers or a comparison.`);
      if (NUMERIC.has(spec.layout) && item.value === undefined) issue(["items", i, "value"], `Every item in a ${spec.layout} needs a value.`);
      if (spec.layout === "rings" && item.value !== undefined && (item.value < 0 || item.value > 100)) issue(["items", i, "value"], "Ring values are percentages, 0 to 100.");
      if ((spec.layout === "pie" || spec.layout === "donut" || spec.layout === "funnel") && item.value !== undefined && item.value < 0) issue(["items", i, "value"], "Values can't be negative here.");
      if ((spec.layout === "stats" || spec.layout === "timeline") && !item.display && item.value === undefined)
        issue(["items", i, "display"], spec.layout === "stats" ? "Every stat needs a display figure (or a value)." : "Every event needs its date in display.");
      if (item.done !== undefined && spec.layout !== "checklist") issue(["items", i, "done"], "Only checklists use done.");
      const depthOf = (it: InfographicItem): number => 1 + Math.max(0, ...(it.children ?? []).map(depthOf));
      if (depthOf(item) > LIMITS.depth) issue(["items", i], `Items nest at most ${LIMITS.depth} levels deep.`);
    });
    if ((spec.layout === "pie" || spec.layout === "donut") && spec.items.every((it) => !it.value)) issue(["items"], "At least one slice needs a value above zero.");
  });

export type InfographicSpec = z.infer<typeof infographicSchema>;
export type InfographicContent = Omit<InfographicSpec, "schemaVersion" | "type" | "id">;

export type ValidationResult = { ok: true; spec: InfographicSpec } | { ok: false; issues: { path: string; message: string }[] };
