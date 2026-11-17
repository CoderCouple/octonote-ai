import { ICON_NAMES } from "./icons.js";
import { infographicSchema, ITEM_STYLES, LAYOUTS, LIMITS, PALETTES, TONES } from "./schema.js";

/**
 * The spec as plain JSON Schema for a model's tool definition. Items nest at
 * most three levels, so the nesting is written out rather than recursive
 * ($ref cycles are poorly supported in tool schemas). Field descriptions come
 * from the zod schema, which stays the source of truth for validation.
 */
export function infographicJsonSchema(): Record<string, unknown> {
  const describe = (key: string) => (infographicSchema.shape as Record<string, { description?: string }>)[key]?.description;
  const item = (depth: number): Record<string, unknown> => ({
    type: "object",
    required: ["label"],
    additionalProperties: false,
    properties: {
      label: { type: "string", maxLength: LIMITS.label, description: "A few words. Short labels look best: aim for 2–5 words." },
      desc: { type: "string", maxLength: LIMITS.desc, description: "One short sentence shown under the label." },
      detail: { type: "string", maxLength: LIMITS.detail, description: "Two or three sentences the reader sees when they click this item." },
      value: { type: "number", description: "A number for charts, funnels and rings (rings: 0–100)." },
      display: { type: "string", maxLength: LIMITS.display, description: 'A short figure shown large, e.g. "71%", "3.2B", "1969", "Q3".' },
      icon: { type: "string", enum: ICON_NAMES },
      tone: { type: "string", enum: TONES, description: "Override this item's colour; usually leave it to the palette." },
      done: { type: "boolean", description: "Checklist only: ticked or not." },
      ...(depth < LIMITS.depth
        ? { children: { type: "array", minItems: 1, maxItems: LIMITS.children, items: item(depth + 1), description: "Comparisons, trees, layers and the hub: the items inside this one." } }
        : {}),
    },
  });
  return {
    type: "object",
    required: ["title", "layout", "items"],
    additionalProperties: false,
    properties: {
      title: { type: "string", maxLength: 80 },
      subtitle: { type: "string", maxLength: 200 },
      layout: { type: "string", enum: LAYOUTS, description: describe("layout") },
      style: { type: "string", enum: ITEM_STYLES, description: describe("style") },
      palette: { type: "string", enum: PALETTES },
      items: { type: "array", minItems: 1, maxItems: LIMITS.items, items: item(1) },
      axes: {
        type: "object",
        required: ["x", "y"],
        properties: {
          x: { type: "array", items: { type: "string", maxLength: LIMITS.label }, minItems: 2, maxItems: 2 },
          y: { type: "array", items: { type: "string", maxLength: LIMITS.label }, minItems: 2, maxItems: 2 },
        },
        description: describe("axes"),
      },
      unit: { type: "string", maxLength: 16, description: describe("unit") },
      source: { type: "string", maxLength: 160, description: describe("source") },
    },
  };
}
