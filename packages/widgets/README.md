# @octonote/widgets

Accessible React UI widgets in two layers.

**Controls:** `Button`, `IconButton`, `Badge`, `Card`, `Progress`, `Switch`, `Tabs` (+ `useTabs`), `Accordion` (+ `useAccordion`), `Tooltip`, `Dialog` (native `<dialog>`), `ToastProvider` + `useToast`.

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

Example: `examples/digestive-guide.json`.
