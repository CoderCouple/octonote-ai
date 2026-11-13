/**
 * The AI chat sites the clipper knows. Selecting text works everywhere on
 * them; "Clip answer" needs to recognise an answer, so each site lists the
 * selectors its answers have had (newest first). If a redesign breaks them,
 * only that button stops appearing.
 */
export interface Site {
  app: "chatgpt" | "claude" | "gemini";
  name: string;
  hosts: string[];
  answers: string[];
  /** The chat's message box, newest selectors first. */
  composers: string[];
  /** The chat's title from the page title, without the site name. */
  title: (documentTitle: string) => string | undefined;
}

const strip = (suffixes: RegExp) => (t: string) =>
  t.replace(suffixes, "").trim() || undefined;

export const SITES: Site[] = [
  {
    app: "chatgpt",
    name: "ChatGPT",
    hosts: ["chatgpt.com", "chat.openai.com"],
    answers: ['[data-message-author-role="assistant"]'],
    composers: ["#prompt-textarea", 'div.ProseMirror[contenteditable="true"]', "form textarea"],
    title: strip(/\s*[-|]\s*ChatGPT\s*$|^ChatGPT$/i),
  },
  {
    app: "claude",
    name: "Claude",
    hosts: ["claude.ai"],
    answers: [
      ".font-claude-response",
      ".font-claude-message",
      '[data-testid="assistant-message"]',
    ],
    composers: [
      'div.ProseMirror[contenteditable="true"]',
      'fieldset [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
    ],
    title: strip(/\s*[-|]\s*Claude\s*$|^Claude$/i),
  },
  {
    app: "gemini",
    name: "Gemini",
    hosts: ["gemini.google.com"],
    answers: [
      "message-content",
      ".model-response-text",
      '[data-test-id="model-response"]',
    ],
    composers: [
      "rich-textarea .ql-editor",
      '.ql-editor[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
    ],
    title: strip(/\s*[-|]\s*Gemini.*$|^Gemini$|^Google Gemini$/i),
  },
];

export function siteFor(hostname: string): Site | undefined {
  return SITES.find((s) =>
    s.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`)),
  );
}

/** The answer element containing a node, if any. */
export function answerOf(node: Node | null, site: Site): HTMLElement | null {
  const el =
    node &&
    (node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement);
  if (!el) return null;
  for (const selector of site.answers) {
    const found = el.closest(selector);
    if (found) return found as HTMLElement;
  }
  return null;
}
