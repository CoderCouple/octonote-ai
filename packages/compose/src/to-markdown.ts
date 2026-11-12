import type { RenderBlock } from "./catalog.js";
import type { ComposedResponse } from "./response.js";

/** Kinds that notes embed as live blocks (a fence named after the kind, holding the JSON). */
export const EMBEDDABLE_KINDS = new Set(["widget", "flashcards", "mcq", "quiz", "mindmap", "matching", "scene", "custom"]);

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

/**
 * One block as markdown for a note: live kinds become a fence holding their
 * JSON (notes read it back as an interactive block); text and structured
 * content become ordinary markdown, since notes have their own blocks for those.
 */
export function blockToMarkdown(block: RenderBlock): string {
  const source = (block.source ?? {}) as Record<string, any>;
  if (EMBEDDABLE_KINDS.has(block.kind)) {
    const { kind: _kind, ...spec } = source;
    return `\`\`\`${block.kind}\n${JSON.stringify(spec, null, 2)}\n\`\`\``;
  }
  switch (block.kind) {
    case "text":
      return String(source.markdown ?? "");
    case "steps":
      return [source.title ? `**${source.title}**\n` : "", ...(source.items ?? []).map((s: any, i: number) => `${i + 1}. **${s.title}**${s.text ? ` ${s.text}` : ""}`)].join("\n").trim();
    case "comparison": {
      const columns: string[] = source.columns ?? [];
      const rows = (source.rows ?? []).map((r: any) => `| **${cell(r.label)}** | ${columns.map((_, i) => cell(r.values?.[i] ?? "")).join(" | ")} |`);
      return [source.caption ? `**${source.caption}**\n` : "", `|  | ${columns.map(cell).join(" | ")} |`, `| --- | ${columns.map(() => "---").join(" | ")} |`, ...rows].join("\n").trim();
    }
    case "definition":
      return `**${source.term}**: ${source.definition}${source.example ? `\n\n*Example:* ${source.example}` : ""}`;
    case "callout": {
      const label = source.title ?? { note: "Note", tip: "Tip", warning: "Warning", important: "Important" }[source.variant as string] ?? "Note";
      return `> **${label}:** ${source.text}`;
    }
    case "timeline":
      return (source.items ?? []).map((t: any) => `- **${t.label}**: ${t.title}${t.text ? `. ${t.text}` : ""}`).join("\n");
    case "takeaway":
      return [`**${source.title ?? "Key takeaway"}**`, "", ...(source.points ?? []).map((p: string) => `- ${p}`)].join("\n");
    case "code":
      return `\`\`\`${source.language ?? ""}\n${source.code ?? ""}\n\`\`\``;
    default:
      return "";
  }
}

/** A whole response as note markdown, title first. */
export function responseToMarkdown(response: ComposedResponse): string {
  return [response.title ? `## ${response.title}` : "", ...response.blocks.map(blockToMarkdown)].filter(Boolean).join("\n\n");
}
