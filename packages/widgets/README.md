# @octonote/widgets

Accessible React UI widgets in two layers.

**Controls:** `Button`, `IconButton`, `Badge`, `Card`, `Progress`, `Switch`, `Tabs` (+ `useTabs`), `Accordion` (+ `useAccordion`), `Tooltip`, `Dialog` (native `<dialog>`), `ToastProvider` + `useToast`.

**Explorable widgets (`type: "widget"`):** inputs (slider, toggle, select) drive named formulas, and views update live: stats, line, area and bar charts, bars, circle, fraction grid, donut, meter, stacked bar, formula line, text, sentence and a question bank.

- **Direct manipulation.** Readers can change what they see as well as move sliders.
  - A `sentence` view puts inputs inline (`If you invest [principal] at [rate]…, you'll have {balance|currency}`). Readers drag the numbers sideways or use the arrow keys.
  - Chart `handles` are points the reader drags, placed by formulas (e.g. `x: "a", y: "a^2"` on a parabola). The widget works out the input's value from where the point is dropped, for any formula, so specs never need an inverse.
  - Circles (by their edge), grids (by cell) and meters (along the bar) take `drag: inputId`.
  - Sliders can have `play` to sweep through their range.
  - Every draggable thing is also a keyboard slider. A Reset button appears once anything has changed.
- **Real data.**
  - `data` holds tables (up to 6 tables of 500 rows).
  - Values can be formulas, `lookup`s (a column read at a point, interpolated, e.g. the population in the chosen year) or `aggregate`s (sum, mean, min, max, count, first or last, optionally `where`).
  - Chart series can plot a table (`data`, `x` column, `y` formula per row). They can be drawn as lines or as `points` over a formula line, and a text column gives categories.
  - Charts can be line, area, bar or `scatter`. `marks` draw reference lines or labelled points that follow inputs.
  - Bars can come from a table. A `table` view highlights rows by formula.
  - `grouping: false` (or the `year` template format) prints years as 2024, not 2,024.
- **Input sweep checker.** `lintWidget` moves every input through its range, and all of them to their extremes together. It reports:
  - values that break (with the setting that breaks them);
  - `percent` formats fed percentages;
  - donuts outside 0–1;
  - meters and circles that overflow;
  - grids over 200 cells;
  - charts hidden by a fixed range;
  - stats too long to fit;
  - inputs that change nothing;
  - handles that start off the chart.
- **Writing with models.** `widgetToolDefinition()` gives a model the schema and `WIDGET_GUIDE`.
  - `pnpm eval` (needs `ANTHROPIC_API_KEY`) has Claude build widgets for eight questions. Validation and sweep problems go back to it, with up to two repairs.
  - It reports first-try and repaired results, and how often Claude reaches for direct manipulation. Results land in `scripts/out/`, and the playground's "Written by Claude" tab shows them.
- **Safe formulas.** A small Pratt parser, never `eval`. Validation reports unknown names, cycles, bad ranges, and handles that can't move.

**Content blocks from JSON:** heading, paragraph, list, quote, divider, callout, definition, steps, code (with copy), takeaway, comparison table, stats, timeline, progress, and tabs/accordion holding other blocks.

```tsx
import { WidgetRenderer, WidgetsProvider } from "@octonote/widgets";
import "@octonote/widgets/styles.css";

<WidgetsProvider theme="system" renderMath={(tex) => katexToReact(tex)}>
  <WidgetRenderer spec={documentFromAnyModel} />
</WidgetsProvider>;
```

- Text fields accept a safe inline subset: `**bold**`, `*italic*`, `` `code` ``, `[links](https://…)` and `$math$`. It is parsed to React elements, never HTML; only http(s) and mailto links survive.
- `validateDocument` / `parseDocument` never throw; invalid documents render a safe message.
- `documentToolDefinition()` gives models a tool with the document's JSON Schema.
- Theme with `--wg-*` variables. Maths renders through your `renderMath` (e.g. KaTeX), so there's no maths dependency here.

Examples: `examples/explorables.json` (11 widgets) and `examples/digestive-guide.json`.
