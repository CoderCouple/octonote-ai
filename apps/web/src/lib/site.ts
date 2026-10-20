/**
 * The canonical site: every canonical link, sitemap entry and Open Graph URL
 * points here, so octonote-ai.vercel.app and previews never compete with it.
 */
export const SITE_URL = "https://octonote.ai";
export const SITE_NAME = "Octonote AI";
/** The host every other production host redirects to (see middleware). */
export const SITE_HOST = "octonote.ai";

export const SITE_TITLE =
  "Octonote AI — Notes and canvas side by side, for you and your AI agents";
export const SITE_DESCRIPTION =
  "Write notes with math and diagrams next to an infinite canvas. Let Claude Code or Codex write into it, and publish any page in one click. Free to start.";

/**
 * Booking page for demos (Cal.com). Every "Book a demo" link hides itself
 * while this is null, so the site never shows a dead link.
 */
export const DEMO_URL: string | null = null;
