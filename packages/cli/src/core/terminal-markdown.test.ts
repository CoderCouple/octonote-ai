import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./terminal-markdown.js";

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
