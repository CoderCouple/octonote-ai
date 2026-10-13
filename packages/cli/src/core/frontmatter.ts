/**
 * Minimal YAML front matter for pulled notes, so `note push file.md` knows
 * which note it is without an id flag:
 *
 *   ---
 *   octonote: pag_…
 *   title: "My note"
 *   ---
 *
 * Only flat `key: value` pairs; values may be quoted. Anything else in the
 * file is the note's markdown.
 */
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontMatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(FM_RE);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (/^".*"$/.test(value)) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
    data[kv[1]!] = value;
  }
  // Drop the blank line withFrontMatter puts after the block, so pull → push round-trips exactly.
  return { data, body: text.slice(m[0].length).replace(/^\r?\n/, "") };
}

export function withFrontMatter(data: Record<string, string>, body: string): string {
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.replace(/^\n+/, "")}`;
}
