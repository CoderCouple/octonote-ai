import { z } from "zod/v4";
import { ICONS, PALETTE } from "../explorable/schema.js";

/**
 * An infographic: a handful of facts laid out as a picture. Each layout is
 * drawn by Octonote itself (no chart library), so it follows the note's theme
 * and never overflows: every text field has a hard length cap.
 */
export const INFOGRAPHIC_LAYOUTS = ["cards", "process", "stats", "compare", "timeline", "bars"] as const;

export const INFOGRAPHIC_LIMITS = { items: 8, groups: 3, groupItems: 6 } as const;

const label = z.string().trim().min(1).max(48).describe("A few words, e.g. Faster redirects.");
const value = z.string().trim().min(1).max(16).describe('A short figure shown large, e.g. "71%", "3.2B", "1969".');
const detail = z.string().trim().min(1).max(280).describe("One or two sentences the reader sees when they open this item.");

export const infographicItemSchema = z.object({
  label,
  value: value.optional(),
  detail: detail.optional(),
  icon: z.enum(ICONS).optional(),
  color: z.enum(PALETTE).optional(),
  amount: z.number().finite().min(0).optional().describe("Bars only: the number the bar's length shows."),
});

export const infographicGroupSchema = z.object({
  label,
  color: z.enum(PALETTE).optional(),
  items: z.array(infographicItemSchema).min(1).max(INFOGRAPHIC_LIMITS.groupItems),
});

export const infographicSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    type: z.literal("infographic"),
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(80),
    subtitle: z.string().trim().min(1).max(200).optional(),
    layout: z
      .enum(INFOGRAPHIC_LAYOUTS)
      .describe(
        "cards: ideas in a grid with icons · process: ordered steps · stats: big numbers · compare: 2–3 groups side by side · timeline: dated events (value is the date) · bars: amounts as horizontal bars",
      ),
    items: z.array(infographicItemSchema).min(2).max(INFOGRAPHIC_LIMITS.items).optional().describe("Every layout except compare."),
    groups: z.array(infographicGroupSchema).min(2).max(INFOGRAPHIC_LIMITS.groups).optional().describe("compare only."),
    unit: z.string().trim().min(1).max(16).optional().describe("Bars: the unit after each amount, e.g. %, kg, M users."),
    source: z.string().trim().min(1).max(160).optional().describe("Where the numbers come from."),
  })
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (spec.layout === "compare") {
      if (!spec.groups) issue(["groups"], "The compare layout needs 2 or 3 groups.");
      if (spec.items) issue(["items"], "The compare layout uses groups, not items.");
      return;
    }
    if (!spec.items) issue(["items"], `The ${spec.layout} layout needs 2 to ${INFOGRAPHIC_LIMITS.items} items.`);
    if (spec.groups) issue(["groups"], "Only the compare layout uses groups.");
    spec.items?.forEach((item, i) => {
      if (spec.layout === "bars" && item.amount === undefined) issue(["items", i, "amount"], "Every bar needs an amount.");
      if ((spec.layout === "stats" || spec.layout === "timeline") && !item.value)
        issue(["items", i, "value"], spec.layout === "stats" ? "Every stat needs a value." : "Every event needs a date in value.");
    });
  });

export type InfographicSpec = z.infer<typeof infographicSpecSchema>;
export type InfographicItem = z.infer<typeof infographicItemSchema>;
export type InfographicLayout = (typeof INFOGRAPHIC_LAYOUTS)[number];

export type InfographicResult = { ok: true; spec: InfographicSpec } | { ok: false; issues: { path: string; message: string }[] };

/** Checks an infographic spec. Never throws. */
export function validateInfographic(input: unknown): InfographicResult {
  const parsed = infographicSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}
