import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../src/markdown";

const md = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return htmlToMarkdown(div);
};

describe("selections as Markdown", () => {
  it("keeps headings, paragraphs, emphasis and safe links", () => {
    expect(
      md(
        '<h3>Why</h3><p>It is <strong>safer</strong> and <em>denser</em>. See <a href="https://x.org/a">this</a> and <a href="javascript:alert(1)">that</a>.</p>',
      ),
    ).toBe(
      "### Why\n\nIt is **safer** and *denser*. See [this](https://x.org/a) and that.",
    );
  });

  it("keeps nested and numbered lists", () => {
    expect(
      md(
        "<ol><li>First<ul><li>inner</li></ul></li><li><p>Second</p></li></ol>",
      ),
    ).toBe("1. First\n  - inner\n2. Second");
  });

  it("keeps tables, escaping pipes", () => {
    expect(
      md(
        "<table><thead><tr><th>Cell</th><th>Wh/kg</th></tr></thead><tbody><tr><td>Li-ion</td><td>250</td></tr><tr><td>a|b</td><td>400</td></tr></tbody></table>",
      ),
    ).toBe(
      "| Cell | Wh/kg |\n| --- | --- |\n| Li-ion | 250 |\n| a\\|b | 400 |",
    );
  });

  it("keeps code with its language, and inline code", () => {
    expect(
      md(
        '<p>Run <code>pnpm test</code>:</p><pre><code class="language-ts">const a = 1;\n</code></pre>',
      ),
    ).toBe("Run `pnpm test`:\n\n```ts\nconst a = 1;\n```");
  });

  it("uses the TeX behind KaTeX maths, inline and display", () => {
    const katex = (t: string) =>
      `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${t}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E=mc2</span></span>`;
    expect(
      md(
        `<p>Energy ${katex("E=mc^2")} holds.</p><div class="katex-display">${katex("\\int_0^1 x\\,dx")}</div>`,
      ),
    ).toBe("Energy $E=mc^2$ holds.\n\n$$\\int_0^1 x\\,dx$$");
  });

  it("drops buttons, icons and hidden page furniture", () => {
    expect(
      md(
        '<div><p>Answer</p><button>Copy</button><svg></svg><span aria-hidden="true">•</span></div>',
      ),
    ).toBe("Answer");
  });

  it("doesn't turn whitespace between blocks into stray lines, but keeps code indentation", () => {
    expect(
      md(
        "<div>\n  <h3>In short</h3>\n  <p>One.</p>\n  <ul>\n <li>Two</li>\n </ul>\n</div>",
      ),
    ).toBe("### In short\n\nOne.\n\n- Two");
    expect(md("<pre><code>if x:\n    return 1\n</code></pre>")).toBe(
      "```\nif x:\n    return 1\n```",
    );
  });
});
