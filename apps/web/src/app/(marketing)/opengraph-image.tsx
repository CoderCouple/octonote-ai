import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  siteCard,
} from "../(public)/pub/_lib/og-card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt =
  "Octonote AI — notes and canvas side by side, for you and your AI agents";

export default function Image() {
  return siteCard({
    title: "Notes and canvas side by side.",
    subtitle:
      "Written by you, or by Claude Code and Codex. Publish any page in one click.",
    path: "/",
  });
}
