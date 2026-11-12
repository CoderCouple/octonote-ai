/**
 * Reads a response's JSON while it is still being written, so finished blocks
 * can be shown before the rest arrive. It only ever JSON.parses complete
 * objects; the block being written is reported by its kind, plus its Markdown
 * so far when it's a text block.
 */
export interface PartialResponse {
  title?: string;
  /** Blocks whose JSON is complete, in order. Still unvalidated. */
  complete: Record<string, unknown>[];
  /** The block being written, if any. */
  pending?: { kind?: string; markdown?: string };
}

export function readPartialResponse(json: string): PartialResponse {
  const result: PartialResponse = { complete: [] };
  const title = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json.slice(0, json.search(/"blocks"\s*:/) >>> 0 || json.length));
  if (title) result.title = unescape(title[1]!);

  const key = /"blocks"\s*:\s*\[/.exec(json);
  if (!key) return result;
  let i = key.index + key[0].length;
  let depth = 0;
  let start = -1;
  let inString = false;
  for (; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const block = JSON.parse(json.slice(start, i + 1));
          if (block && typeof block === "object" && !Array.isArray(block)) result.complete.push(block);
        } catch {
          // Malformed object: the validator will report the final JSON instead.
        }
        start = -1;
      }
    } else if (ch === "]" && depth === 0) {
      return result;
    }
  }
  if (depth > 0 && start !== -1) {
    const partial = json.slice(start);
    const kind = /"kind"\s*:\s*"([A-Za-z0-9_-]+)"/.exec(partial)?.[1];
    result.pending = { kind };
    if (kind === "text") {
      const md = /"markdown"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(partial);
      if (md) result.pending.markdown = unescape(md[1]!.replace(/\\$/, ""));
    }
  }
  return result;
}

function unescape(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    // A cut-off escape like \u00 at the very end: drop the broken tail.
    return raw.replace(/\\u[0-9a-fA-F]{0,3}$/, "").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}
