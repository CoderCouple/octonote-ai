import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  siteCard,
} from "../(public)/pub/_lib/og-card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt =
  "Octonote AI — the AI workspace for humans and agents: notes and canvas side by side";

export default function Image() {
  return siteCard({
    title: "The AI workspace for Humans and Agents.",
    subtitle:
      "Notes and canvas side by side, written by you, Claude or Codex. Published as a beautiful page.",
    path: "/",
  });
}
