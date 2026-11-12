import { outlineToMindmapNodes } from "./outline.js";
import { SCHEMA_VERSION } from "./schemas/common.js";

/**
 * Fixes the mistakes language models commonly make before strict validation:
 * missing ids and versions, answers given as indexes or text, options given as
 * plain strings, alternative field names, nested mind map trees and Markdown
 * outlines. It never invents content, and anything it can't fix is left for the
 * validator to report.
 */
export function normalizeSpec(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (input.type === "session") {
    const activities = Array.isArray(input.activities) ? input.activities.map((a, i) => normalizeActivity(a, `activity-${i + 1}`)) : input.activities;
    return { ...withBase(input, "session"), activities };
  }
  return normalizeActivity(input, "activity-1");
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : undefined);

function withBase(spec: Rec, fallbackId: string): Rec {
  return {
    ...spec,
    schemaVersion: typeof spec.schemaVersion === "string" ? spec.schemaVersion : SCHEMA_VERSION,
    id: str(spec.id) || fallbackId,
  };
}

/** Gives each item in a list an id when it has none. */
function withIds(items: unknown, prefix: string): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item, i) => (isRecord(item) && !str(item.id) ? { ...item, id: `${prefix}${i + 1}` } : item));
}

function normalizeActivity(raw: unknown, fallbackId: string): unknown {
  if (!isRecord(raw)) return raw;
  const spec = withBase(raw, fallbackId);
  switch (spec.type) {
    case "flashcards":
      return { ...spec, cards: withIds(mapRecords(spec.cards, normalizeCard), "card-") };
    case "mcq":
    case "quiz":
      return { ...spec, questions: withIds(mapRecords(spec.questions, normalizeQuestion), "q") };
    case "matching":
      return { ...spec, pairs: withIds(mapRecords(spec.pairs, normalizePair), "pair-") };
    case "mindmap":
      return { ...spec, nodes: normalizeNodes(spec) };
    default:
      return spec;
  }
}

function mapRecords(items: unknown, fn: (item: Rec) => Rec): unknown {
  return Array.isArray(items) ? items.map((item) => (isRecord(item) ? fn(item) : item)) : items;
}

function normalizeCard(card: Rec): Rec {
  const { question, answer, term, definition, ...rest } = card;
  return { ...rest, front: card.front ?? question ?? term, back: card.back ?? answer ?? definition };
}

function normalizePair(pair: Rec): Rec {
  const { term, definition, a, b, ...rest } = pair;
  return { ...rest, left: pair.left ?? term ?? a, right: pair.right ?? definition ?? b };
}

function normalizeQuestion(question: Rec): Rec {
  const { question: altPrompt, answer, answerIndex, correctIndex, correctIndices, correctAnswer, ...rest } = question;
  const q: Rec = { ...rest, prompt: question.prompt ?? altPrompt };

  // True/false questions may come with just a boolean answer.
  const bool = typeof answer === "boolean" ? answer : typeof correctAnswer === "boolean" ? correctAnswer : undefined;
  if (q.kind === "true_false" || (bool !== undefined && !Array.isArray(q.options))) {
    q.kind = "true_false";
    if (!Array.isArray(q.options)) q.options = [{ id: "true", text: "True" }, { id: "false", text: "False" }];
    if (q.correct === undefined && bool !== undefined) q.correct = [String(bool)];
  }

  // Options as plain strings.
  if (Array.isArray(q.options)) {
    q.options = q.options.map((option, i) => {
      const text = str(option);
      if (text !== undefined) return { id: String.fromCharCode(97 + i), text };
      if (isRecord(option) && !str(option.id)) return { ...option, id: String.fromCharCode(97 + i) };
      return option;
    });
  }
  const options = Array.isArray(q.options) ? q.options.filter(isRecord) : [];

  // Answers as indexes, option text or a single value instead of a list.
  const given = q.correct ?? correctIndices ?? correctIndex ?? answerIndex ?? (typeof answer !== "boolean" ? answer : undefined) ?? correctAnswer;
  if (given !== undefined) {
    const list = Array.isArray(given) ? given : [given];
    q.correct = list.map((value) => toOptionId(value, options));
  }
  return q;
}

function toOptionId(value: unknown, options: Rec[]): unknown {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isInteger(value)) return options[value]?.id ?? value;
  const text = str(value);
  if (text === undefined) return value;
  if (options.some((o) => o.id === text)) return text;
  const byText = options.find((o) => str(o.text)?.toLowerCase() === text.toLowerCase());
  return byText?.id ?? text;
}

/** Mind maps may arrive as an outline, a nested tree, or flat nodes without ids. */
function normalizeNodes(spec: Rec): unknown {
  if (typeof spec.outline === "string" && !Array.isArray(spec.nodes)) {
    return outlineToMindmapNodes(spec.outline, str(spec.title));
  }
  const root = isRecord(spec.root) ? spec.root : isRecord(spec.nodes) ? spec.nodes : undefined;
  if (root) {
    const flat: Rec[] = [];
    let counter = 0;
    const walk = (node: Rec, parent?: string) => {
      const id = str(node.id) || `n${++counter}`;
      const { children, topic, name, ...rest } = node;
      flat.push({ ...rest, id, label: node.label ?? topic ?? name, ...(parent ? { parent } : {}) });
      if (Array.isArray(children)) children.filter(isRecord).forEach((child) => walk(child, id));
    };
    walk(root);
    return flat;
  }
  return withIds(spec.nodes, "n");
}
