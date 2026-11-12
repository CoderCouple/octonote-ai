/**
 * Hard limits on generated content. Specs come from language models and other
 * untrusted sources, so every string and list has a ceiling.
 */
export const LIMITS = {
  /** Longest raw JSON text `parseSpec` will read, in characters. */
  jsonLength: 1_000_000,
  idLength: 64,
  titleLength: 200,
  textLength: 2000,
  cards: 500,
  questions: 200,
  options: 10,
  blanks: 10,
  /** Items to order or sort into groups. */
  items: 12,
  groups: 6,
  pairs: 50,
  mindmapNodes: 2000,
  mindmapDepth: 12,
  sessionActivities: 20,
} as const;
