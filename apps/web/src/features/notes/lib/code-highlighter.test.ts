import { describe, expect, it } from "vitest";
import { octoCodeBlockOptions } from "./code-highlighter";

/** Colours of one line, as the editor would paint it. */
async function lineColours(code: string, lang: string, line: number) {
  const h = await octoCodeBlockOptions.createHighlighter!();
  await h.loadLanguage(lang as never);
  return h.codeToTokensBase(code, { lang: lang as never, theme: "github-dark" })[line]!.map((t) => t.color);
}

const STRING = "#9ECBFF"; // github-dark string colour

describe("code block highlighting", () => {
  it("ends a Python docstring that spans several lines", async () => {
    const code = 'def f():\n    """Doc.\n\n    Args:\n      x: on (e.g. "cuda").\n    """\n    # Create results\n    results = {"a": []}\n';
    expect(await lineColours(code, "python", 6)).not.toContain(STRING); // the comment
    expect(await lineColours(code, "python", 7)).toContain("#F97583"); // `=` is an operator again
  });

  it("ends a shell heredoc and a YAML block", async () => {
    expect(await lineColours("cat <<EOF\nhello\nEOF\necho done\n", "bash", 3)).not.toEqual(
      await lineColours("cat <<EOF\nhello\nEOF\necho done\n", "bash", 1),
    );
    expect(await lineColours("a: |\n  line\nb: 2\n", "yaml", 2)).not.toEqual(
      await lineColours("a: |\n  line\nb: 2\n", "yaml", 1),
    );
  });
});
