import { countBlanks, CHOICE_KINDS, type Question } from "./schemas/questions.js";
import type { ActivitySpecBase } from "./registry.js";

/**
 * Item-writing problems that let a learner answer without knowing, or that
 * just read badly. Valid specs can still have them; each message says what to
 * change, so a model can fix it.
 */
export interface ActivityIssue {
  path: string;
  message: string;
}

const tidy = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) => tidy(s).split(" ").filter(Boolean);
/** Words that carry meaning (not "the", "of"...), at least four letters. */
const meaningful = (s: string) => words(s).filter((w) => w.length >= 4 && !STOP.has(w));
const STOP = new Set(["that", "this", "with", "from", "they", "their", "there", "which", "what", "when", "where", "will", "would", "about", "into", "than", "then", "have", "does", "each", "some", "more", "most", "these", "those"]);

export function lintQuestions(questions: readonly Question[], base = ""): ActivityIssue[] {
  const issues: ActivityIssue[] = [];
  const at = (i: number, rest = "") => `${base}questions.${i}${rest}`;
  questions.forEach((q, i) => {
    const kind = q.kind ?? "single";
    if (CHOICE_KINDS.has(kind) && q.options) {
      const texts = q.options.map((o) => tidy(o.text));
      texts.forEach((t, j) => {
        if (texts.indexOf(t) !== j) issues.push({ path: at(i, `.options.${j}`), message: `Option "${q.options![j]!.text}" repeats another option. Make every option different.` });
        if (/^(all|none|both|neither) of (the )?(above|these)$/.test(t)) issues.push({ path: at(i, `.options.${j}`), message: `Avoid "${q.options![j]!.text}": it can be answered by spotting two right (or wrong) options. Write a real option instead.` });
      });
      const correct = new Set(q.correct ?? []);
      if (kind === "multiple" && correct.size && correct.size === q.options.length) issues.push({ path: at(i, ".correct"), message: "Every option is correct, so there's nothing to choose. Add options that are wrong." });
      if (kind !== "true_false") {
        // The answer given away by the prompt.
        const prompt = tidy(q.prompt);
        for (const option of q.options) {
          if (!correct.has(option.id)) continue;
          const text = tidy(option.text);
          if (text.split(" ").length >= 2 && prompt.includes(text)) issues.push({ path: at(i), message: `The right answer "${option.text}" appears in the question itself. Reword the question so it doesn't give the answer away.` });
        }
        // The right answer noticeably longer than the rest: a well-known tell.
        const wrong = q.options.filter((o) => !correct.has(o.id));
        const right = q.options.filter((o) => correct.has(o.id));
        if (kind === "single" && wrong.length >= 2 && right.length === 1) {
          const avg = wrong.reduce((n, o) => n + o.text.length, 0) / wrong.length;
          if (right[0]!.text.length > 28 && right[0]!.text.length > avg * 1.8)
            issues.push({ path: at(i, ".options"), message: `The right answer is much longer than the others (${right[0]!.text.length} characters against about ${Math.round(avg)}), which gives it away. Make the options similar in length and detail.` });
        }
      }
    }
    if (kind === "fill_blank" && q.blanks) {
      const prompt = tidy(q.prompt.replace(/_{3,}/g, " "));
      q.blanks.forEach((blank, j) => {
        const answer = tidy(blank.accept[0] ?? "");
        if (answer.length >= 4 && new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(prompt))
          issues.push({ path: at(i, `.blanks.${j}`), message: `"${blank.accept[0]}" already appears in the sentence, so the blank gives itself away. Reword the sentence.` });
      });
      if (countBlanks(q.prompt) > 3) issues.push({ path: at(i, ".prompt"), message: "More than three blanks in one sentence is hard to read. Split it into separate questions." });
    }
    if (kind === "numeric" && q.answer && !Number.isInteger(q.answer.value) && !q.answer.tolerance)
      issues.push({ path: at(i, ".answer"), message: `The answer ${q.answer.value} has decimals but no tolerance, so a learner who rounds is marked wrong. Add a tolerance (e.g. ${toleranceFor(q.answer.value)}).` });
    if (kind === "order" && q.items && q.items.length < 3) issues.push({ path: at(i, ".items"), message: "With two items an order question is a coin flip. Use at least three, or ask a true/false question." });
    if (kind === "categorize" && q.items && q.groups) {
      for (const group of q.groups) if (!q.items.some((item) => item.group === group.id)) issues.push({ path: at(i, ".groups"), message: `Nothing belongs in "${group.text}". Give each group at least one item, or remove it.` });
    }
    if (kind === "short_answer" && !q.sample) issues.push({ path: at(i), message: "Add a sample answer: learners mark themselves against it." });
  });
  // The same question twice.
  const prompts = questions.map((q) => tidy(q.prompt));
  prompts.forEach((p, i) => {
    if (prompts.indexOf(p) !== i) issues.push({ path: at(i, ".prompt"), message: "This question repeats an earlier one." });
  });
  return issues;
}

const toleranceFor = (value: number) => {
  const decimals = (String(value).split(".")[1] ?? "").length;
  return 10 ** -Math.max(1, decimals - 1) / 2;
};

/** Item-writing problems in an activity or a session. */
export function lintActivity(spec: ActivitySpecBase, base = ""): ActivityIssue[] {
  const s = spec as ActivitySpecBase & Record<string, unknown>;
  switch (spec.type) {
    case "mcq":
    case "quiz":
      return lintQuestions((s.questions as Question[]) ?? [], base);
    case "flashcards": {
      const issues: ActivityIssue[] = [];
      const cards = (s.cards as { front: string; back: string }[]) ?? [];
      const fronts = cards.map((c) => tidy(c.front));
      cards.forEach((card, i) => {
        if (fronts.indexOf(fronts[i]!) !== i) issues.push({ path: `${base}cards.${i}.front`, message: "This card's front repeats an earlier card." });
        const front = new Set(meaningful(card.front));
        const back = meaningful(card.back);
        if (back.length && back.every((w) => front.has(w))) issues.push({ path: `${base}cards.${i}.back`, message: "The back only repeats words from the front, so it can be read off without recalling anything. Put the answer on the back." });
      });
      return issues;
    }
    case "mindmap": {
      const issues: ActivityIssue[] = [];
      const nodes = (s.nodes as { id: string; label: string; parent?: string }[]) ?? [];
      nodes.forEach((node, i) => {
        if (node.label.length > 48) issues.push({ path: `${base}nodes.${i}.label`, message: `"${node.label.slice(0, 30)}…" is long for a mind map topic. Keep labels to a few words and put detail in the note.` });
        const children = nodes.filter((n) => n.parent === node.id).length;
        if (children > 9) issues.push({ path: `${base}nodes.${i}`, message: `"${node.label}" has ${children} branches; more than about seven is hard to take in. Group some under new subtopics.` });
      });
      return issues;
    }
    case "session":
      return ((s.activities as ActivitySpecBase[]) ?? []).flatMap((a, i) => lintActivity(a, `${base}activities.${i}.`));
    default:
      return [];
  }
}
