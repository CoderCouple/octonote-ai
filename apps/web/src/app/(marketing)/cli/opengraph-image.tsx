import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  siteCard,
} from "../../(public)/pub/_lib/og-card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "The octonote CLI for Claude Code and Codex";

export default function Image() {
  return siteCard({
    title: "Let your AI agents write into Octonote.",
    subtitle:
      "Notes from markdown, canvases from mermaid, published in one command.",
    path: "/cli",
  });
}
