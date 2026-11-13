import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/render";

describe("renderMarkdown", () => {
  it("shows a clip the way it read in the chat", () => {
    const html = renderMarkdown(
      "### In short\n\nSolid-state cells use a **solid** electrolyte, see `ions`.\n\n- Safer\n- Denser\n\n| | Li-ion | Solid |\n| --- | --- | --- |\n| Wh/kg | 250 | 400 |",
    );
    expect(html).toBe(
      '<p class="h">In short</p><p>Solid-state cells use a <strong>solid</strong> electrolyte, see <code>ions</code>.</p><ul><li>Safer</li><li>Denser</li></ul><table><thead><tr><th></th><th>Li-ion</th><th>Solid</th></tr></thead><tbody><tr><td>Wh/kg</td><td>250</td><td>400</td></tr></tbody></table>',
    );
  });

  it("never lets a clip inject markup", () => {
    const html = renderMarkdown(
      '<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://a.b/c)\n\n```\n<script>1</script>\n```',
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('<a href="https://a.b/c" target="_blank" rel="noreferrer">ok</a>');
  });
});
