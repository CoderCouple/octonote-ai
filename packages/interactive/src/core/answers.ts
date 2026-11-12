import { CHOICE_KINDS, countBlanks, type Question, type QuestionKind } from "./schemas/questions.js";

/**
 * Every kind of question answers with a list of strings, so responses travel
 * the same way to a server grader whatever the kind:
 * - choice kinds: the selected option ids
 * - fill_blank: one string per blank, in order
 * - numeric: the typed number (units and commas are fine)
 * - order: item ids in the learner's order
 * - categorize: "itemId=groupId" for each item
 * - short_answer: the text, then "self:correct" or "self:incorrect" once self-marked
 */
export type Response = readonly string[];

export interface Check {
  correct: boolean;
  /** Per blank, item or position: which parts were right (for marking them). */
  parts?: boolean[];
  /** For short answers nobody has marked yet. */
  pending?: boolean;
}

export const kindOf = (q: Question): QuestionKind => q.kind ?? "single";

/** Whether there's enough of an answer to check. */
export function isAnswered(q: Question, response: Response): boolean {
  switch (kindOf(q)) {
    case "fill_blank":
      return response.length >= Math.max(1, countBlanks(q.prompt)) && response.every((r) => r.trim() !== "");
    case "numeric":
      return parseNumber(response[0] ?? "") !== undefined;
    case "order":
      return response.length === (q.items?.length ?? 0);
    case "categorize":
      return response.length === (q.items?.length ?? 0);
    case "short_answer":
      return (response[0] ?? "").trim().length >= 2;
    default:
      return response.length > 0;
  }
}

/** Marks a response against the question's answer key. Ignores anything that isn't part of the question. */
export function checkResponse(q: Question, response: Response): Check {
  switch (kindOf(q)) {
    case "fill_blank": {
      const parts = (q.blanks ?? []).map((blank, i) => accepts(blank.accept, response[i] ?? "", !!blank.caseSensitive));
      return { correct: parts.length > 0 && parts.every(Boolean), parts };
    }
    case "numeric": {
      const value = parseNumber(response[0] ?? "");
      if (!q.answer || value === undefined) return { correct: false };
      // A little slack for floating point even when no tolerance is given.
      const slack = (q.answer.tolerance ?? 0) + Math.abs(q.answer.value) * 1e-9 + 1e-12;
      return { correct: Math.abs(value - q.answer.value) <= slack };
    }
    case "order": {
      const expected = (q.items ?? []).map((item) => item.id);
      const parts = expected.map((id, i) => response[i] === id);
      return { correct: response.length === expected.length && parts.every(Boolean), parts };
    }
    case "categorize": {
      const placed = placements(response);
      const parts = (q.items ?? []).map((item) => !!item.group && placed.get(item.id) === item.group);
      return { correct: parts.length > 0 && parts.every(Boolean), parts };
    }
    case "short_answer": {
      const mark = response.find((r) => r.startsWith("self:"));
      return mark ? { correct: mark === "self:correct" } : { correct: false, pending: true };
    }
    default: {
      const options = new Set(q.options?.map((o) => o.id));
      const chosen = new Set(response.filter((id) => options.has(id)));
      const correct = q.correct ?? [];
      return { correct: chosen.size === correct.length && correct.every((id) => chosen.has(id)) };
    }
  }
}

/** The right answer, in the same shape as a response: what to reveal after answering. */
export function expectedResponse(q: Question): string[] {
  switch (kindOf(q)) {
    case "fill_blank":
      return (q.blanks ?? []).map((b) => b.accept[0]!);
    case "numeric":
      return q.answer ? [`${q.answer.value}${q.answer.unit ? ` ${q.answer.unit}` : ""}`] : [];
    case "order":
      return (q.items ?? []).map((item) => item.id);
    case "categorize":
      return (q.items ?? []).map((item) => `${item.id}=${item.group ?? ""}`);
    case "short_answer":
      return q.sample ? [q.sample] : [];
    default:
      return [...(q.correct ?? [])];
  }
}

export const isChoice = (q: Question) => CHOICE_KINDS.has(kindOf(q));

/** "itemId=groupId" pairs as a map. */
export function placements(response: Response): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of response) {
    const at = entry.indexOf("=");
    if (at > 0) map.set(entry.slice(0, at), entry.slice(at + 1));
  }
  return map;
}

/** Same answer, ignoring case (unless asked), surrounding and repeated spaces, and a trailing full stop. Numbers compare as numbers. */
function accepts(accepted: readonly string[], given: string, caseSensitive: boolean): boolean {
  const tidy = (s: string) => {
    const t = s.trim().replace(/\s+/g, " ").replace(/[.。]$/, "");
    return caseSensitive ? t : t.toLowerCase();
  };
  const answer = tidy(given);
  if (!answer) return false;
  const asNumber = parseNumber(answer);
  return accepted.some((a) => {
    if (tidy(a) === answer) return true;
    const n = parseNumber(a);
    return n !== undefined && asNumber !== undefined && Math.abs(n - asNumber) <= Math.abs(n) * 1e-9 + 1e-12;
  });
}

/** A number as people type it: "1,200", "3.5 m/s", "-0.25", "1e3", "½" is not one. */
export function parseNumber(text: string): number | undefined {
  const match = /^\s*([-+−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?|[-+−]?\.\d+)/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]!.replace(/,/g, "").replace("−", "-"));
  return Number.isFinite(value) ? value : undefined;
}
