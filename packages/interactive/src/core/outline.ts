import { LIMITS } from "./limits.js";
import { SCHEMA_VERSION } from "./schemas/common.js";
import type { MindmapNode } from "./schemas/mindmap.js";

interface Line {
  level: number;
  label: string;
}

const HEADING = /^(#{1,6})\s+(.+)$/;
const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/;

/** Strips the inline Markdown a label might carry, leaving plain text. */
function plain(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .trim()
    .slice(0, LIMITS.titleLength);
}

/**
 * Reads a Markdown outline: headings, then nested list items under them.
 * Headings set the level; list items sit below the nearest heading, two spaces
 * (or a tab) per level of indent.
 */
function readOutline(markdown: string): Line[] {
  const lines: Line[] = [];
  let headingLevel = 0;
  for (const raw of markdown.replace(/\t/g, "  ").split(/\r?\n/)) {
    const heading = HEADING.exec(raw.trim());
    if (heading) {
      headingLevel = heading[1]!.length;
      lines.push({ level: headingLevel, label: plain(heading[2]!) });
      continue;
    }
    const item = ITEM.exec(raw);
    if (item) lines.push({ level: headingLevel + 1 + Math.floor(item[1]!.length / 2), label: plain(item[2]!) });
  }
  return lines.filter((l) => l.label);
}

/**
 * Turns a Markdown outline into mind map nodes, so any model (or person) can
 * write one without learning the JSON. A single top line becomes the central
 * topic; otherwise `rootLabel` does. The result still goes through validation.
 */
export function outlineToMindmapNodes(markdown: string, rootLabel = "Topics"): MindmapNode[] {
  const lines = readOutline(markdown);
  if (!lines.length) return [];
  const top = Math.min(...lines.map((l) => l.level));
  const roots = lines.filter((l) => l.level === top);
  const nodes: MindmapNode[] = [];
  // stack[i] is the id of the latest node at depth i.
  const stack: string[] = [];
  let counter = 0;
  const add = (label: string, depth: number) => {
    const id = `n${++counter}`;
    stack.length = depth;
    const parent = depth > 0 ? stack[depth - 1] : undefined;
    nodes.push(parent ? { id, label, parent } : { id, label });
    stack[depth] = id;
  };
  // With several top-level lines, a central topic is added above them.
  const offset = roots.length === 1 ? 0 : 1;
  if (offset) add(plain(rootLabel) || "Topics", 0);
  let previous = offset - 1;
  for (const line of lines) {
    // Never skip a level, even if the outline jumps from # to ###.
    let depth = Math.min(line.level - top + offset, previous + 1);
    // There is only one root; anything else that lands there goes under it.
    if (depth === 0 && nodes.length) depth = 1;
    add(line.label, depth);
    previous = depth;
  }
  return nodes;
}

/** A whole mind map spec from an outline. */
export function outlineToMindmap(markdown: string, options: { id: string; title?: string }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: "mindmap" as const,
    id: options.id,
    ...(options.title ? { title: options.title } : {}),
    nodes: outlineToMindmapNodes(markdown, options.title),
  };
}
