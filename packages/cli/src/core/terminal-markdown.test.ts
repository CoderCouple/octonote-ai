import { describe, expect, it } from "vitest";
import { renderMarkdown, renderNote } from "./terminal-markdown.js";

const MD = `# Caching plan

Put **Redis** in front of \`postgres\`, see [docs](https://example.com/d).

- [x] Measure
- [ ] Add TTLs
- plain bullet

\`\`\`mermaid
graph LR
  A-->B
\`\`\`

> keep it simple\\
> on two lines`;

describe("terminal markdown", () => {
  it("renders structure without colour for pipes and NO_COLOR", () => {
    const out = renderMarkdown(MD, false);
    expect(out).toContain("Caching plan");
    expect(out).not.toContain("# ");
    expect(out).toContain("☑ Measure");
    expect(out).toContain("☐ Add TTLs");
    expect(out).toContain("• plain bullet");
    expect(out).toContain("docs (https://example.com/d)");
    expect(out).toContain("┌─ diagram (mermaid)");
    expect(out).toContain("│ graph LR");
    expect(out).toContain("│ keep it simple\n│ on two lines");
    expect(out).not.toContain("\u001b[");
  });

  it("adds ANSI styles only when colour is on", () => {
    const out = renderMarkdown(MD, true);
    expect(out).toContain("\u001b[1m");
    expect(out).toContain("\u001b[36mpostgres");
  });
});

describe("renderNote", () => {
  it("puts the title above the body", () => {
    const out = renderNote("To-do List", "## To-do\n\n- [ ] Sell stock.", false);
    expect(out.split("\n")[0]).toBe("To-do List");
    expect(out).toContain("☐ Sell stock.");
  });
  it("doesn't repeat a title the body already opens with", () => {
    const out = renderNote("Launch plan", "# Launch plan\n\nShip it.", false);
    expect(out.match(/Launch plan/g)).toHaveLength(1);
  });
  it("makes the title bold and underlined in colour", () => {
    expect(renderNote("Plan", "Body", true).startsWith("\u001b[1m\u001b[4mPlan")).toBe(true);
  });
});

describe("layout like Claude Code", () => {
  it("wraps long lines to the width with hanging indents", () => {
    const out = renderMarkdown("- " + "word ".repeat(30).trim() + "\n\n1. " + "item ".repeat(30).trim(), false, 40);
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(40);
    expect(out).toMatch(/^• word/);
    expect(out).toMatch(/\n  word/);
    expect(out).toMatch(/\n   item/);
  });

  it("draws tables with box lines and wraps cells to fit", () => {
    const md = "| Who | What |\n| --- | --- |\n| Rajat | " + "a long cell ".repeat(12).trim() + " |";
    const out = renderMarkdown(md, false, 50);
    expect(out).toContain("┌");
    expect(out).toContain("├");
    expect(out).toContain("└");
    expect(out).toContain("│ Who");
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(50);
  });

  it("makes links clickable in colour and spells them out without", () => {
    expect(renderMarkdown("[docs](https://example.com/d)", true)).toContain("\u001b]8;;https://example.com/d\u001b\\");
    expect(renderMarkdown("see https://example.com/x.", false)).toBe("see https://example.com/x.");
  });
});

describe("wide characters", () => {
  it("counts an emoji as two columns so table rows line up", () => {
    const out = renderMarkdown("| When | Who |\n| --- | --- |\n| ✅ 10-30 | Mayank |\n| Mon | Rajat |", false, 60);
    const rows = out.split("\n").filter((l) => l.startsWith("│"));
    const width = (l: string) => [...l].reduce((n, ch) => n + (/\p{Emoji_Presentation}/u.test(ch) ? 2 : 1), 0);
    expect(new Set(rows.map(width)).size).toBe(1);
  });
});
