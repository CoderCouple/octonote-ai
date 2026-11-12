import { z } from "zod/v4";
import { widgetSpecSchema } from "./schema.js";

/** How to write a good explorable: the rules a model gets with the schema. */
export const WIDGET_GUIDE = `Write one explorable widget: the reader changes something and immediately sees what follows from it. It should feel like playing with the idea, not filling in a calculator.

Shape:
- inputs: 1-3 that matter. Sliders with sensible ranges and steps (avoid ranges where formulas break, e.g. rate 0 in 70/rate); toggles; selects.
- values: named numbers, in order. A formula, a lookup in a data table (a column read at a point, e.g. the population in the chosen year) or an aggregate (sum, mean, min, max, count…).
- views: what the reader sees, top to bottom.

Make it direct:
- A sentence with draggable numbers often beats sliders: "If you invest [principal] at [rate] for [years] years you'll have {balance|currency}." ([input] inline, {formula|format} live.)
- Let the reader drag the thing itself: chart handles placed by formulas (a point at x: a, y: a^2 on a parabola sets a; a point at (1, m + b) sets the slope), drag on circles, grids and meters.
- Give time-like sliders play: true.
- Probability: a simulation view. Each trial's outcome draws random numbers (coin(), dice(), dicesum(n), binomial(n, p), chance(p), normal(m, sd)); success and expected show the estimate settling onto the theory. Random functions only work there.
- Geometry and vectors: a plane view with points, segments, vectors, polygons, circles, curves and text from formulas; handles with two inputs move freely. Mark inputs hidden when dragging is the control.
- "What if" comparisons: compare: true lets the reader pin settings and see the difference.
- Use real data when the question is about the real world: a data table, data series as points beside a formula line, reference marks that follow inputs, a table view with the current row highlighted. Only include numbers you are confident of, and say where they come from in the note.

Layout and maths:
- layout "side" puts the sentence, stats and sliders beside the chart or plane when there's room.
- A formula line can be TeX (tex: true); live values then use double braces: \\frac{d}{dx}x^2 = 2 \\cdot {{a|1}}.
- For practice questions use a quiz or flashcards, not a widget.

Formats:
- style "percent" expects a ratio (0.35 → 35%); for values already in percent use suffix "%".
- Years: grouping false (2024, not 2,024), or {year|year} in text.
- Currency: style "currency"; big numbers: style "compact".
- A donut's value is a ratio 0-1. A grid has at most 200 cells.

Keep text short. Title says what you can explore; description says what to do ("Drag the point along the curve").`;

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

/** A tool for writing one standalone widget. */
export function widgetToolDefinition(name = "create_widget") {
  return {
    name,
    description: `${WIDGET_GUIDE}\n\nSet schemaVersion to "1.0" and type to "widget".`,
    inputSchema: jsonSchema(widgetSpecSchema),
  };
}
