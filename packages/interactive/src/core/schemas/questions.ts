import { z } from "zod/v4";
import { LIMITS } from "../limits.js";
import { activityFields, checkUniqueIds, idSchema, type IssueSink, textSchema } from "./common.js";

export const choiceSchema = z.object({
  id: idSchema,
  text: textSchema,
  rationale: textSchema.optional().describe("Why this option is right or wrong. Shown after answering."),
});

const itemSchema = z.object({ id: idSchema, text: textSchema });

export const QUESTION_KINDS = ["single", "multiple", "true_false", "fill_blank", "numeric", "order", "categorize", "short_answer"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Kinds answered by choosing options. */
export const CHOICE_KINDS = new Set<QuestionKind>(["single", "multiple", "true_false"]);

export const questionSchema = z.object({
  id: idSchema,
  prompt: textSchema.describe("The question. For fill_blank, mark each blank with ___ (three underscores)."),
  kind: z
    .enum(QUESTION_KINDS)
    .optional()
    .describe(
      'How it is answered. "single" (default): one correct option. "multiple": one or more. "true_false": options "true" and "false". "fill_blank": type into each ___ in the prompt. "numeric": type a number (tolerance and unit allowed). "order": put items in order. "categorize": sort items into groups. "short_answer": a sentence or two, marked against a rubric.',
    ),
  options: z.array(choiceSchema).min(2).max(LIMITS.options).optional().describe("For single, multiple and true_false."),
  correct: z
    .array(idSchema)
    .min(1)
    .max(LIMITS.options)
    .optional()
    .describe("Ids of the correct options. Leave out when the quiz is graded on a server."),
  blanks: z
    .array(z.object({ accept: z.array(z.string().trim().min(1).max(200)).min(1).max(10).describe("Every answer to accept, e.g. [\"Paris\"] or [\"H2O\", \"water\"]."), caseSensitive: z.boolean().optional() }))
    .min(1)
    .max(LIMITS.blanks)
    .optional()
    .describe("For fill_blank: one entry per ___ in the prompt, in order. Matching ignores case, extra spaces and a trailing full stop."),
  answer: z
    .object({
      value: z.number().finite(),
      tolerance: z.number().min(0).optional().describe("How far off still counts, in the same units, e.g. 0.05."),
      unit: z.string().trim().max(20).optional().describe('Shown beside the input, e.g. "m/s".'),
    })
    .optional()
    .describe("For numeric."),
  items: z
    .array(itemSchema.extend({ group: idSchema.optional().describe("For categorize: the id of the group it belongs in.") }))
    .min(2)
    .max(LIMITS.items)
    .optional()
    .describe("For order: in the correct order (they're shuffled for the learner). For categorize: each with its group."),
  groups: z.array(itemSchema).min(2).max(LIMITS.groups).optional().describe("For categorize: the groups to sort into."),
  rubric: textSchema.optional().describe("For short_answer: what a good answer must contain, as a short list of points."),
  sample: textSchema.optional().describe("For short_answer: a model answer, shown after answering."),
  hint: textSchema.optional(),
  explanation: textSchema.optional().describe("Shown after answering, whatever the learner chose."),
  points: z.number().int().min(0).max(100).optional().describe("Defaults to 1."),
});

export type Choice = z.infer<typeof choiceSchema>;
export type Question = z.infer<typeof questionSchema>;

/** Blanks marked in a prompt: ___ (three or more underscores). */
export const BLANK = /_{3,}/g;
export const countBlanks = (prompt: string) => prompt.match(BLANK)?.length ?? 0;

function checkQuestions(questions: readonly Question[], ctx: IssueSink, answers: "required" | "forbidden") {
  checkUniqueIds(questions, ctx, ["questions"]);
  questions.forEach((q, i) => {
    const path = ["questions", i];
    const kind = q.kind ?? "single";
    const issue = (message: string, at: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path: [...path, ...at] });
    const needs = (field: keyof Question, what: string) => {
      if (q[field] === undefined) issue(`A "${kind}" question needs ${what}`, [field]);
    };
    const forbid = (fields: (keyof Question)[]) => {
      for (const field of fields) if (q[field] !== undefined) issue(`"${field}" doesn't apply to a "${kind}" question`, [field]);
    };

    // The parts each kind is made of.
    if (CHOICE_KINDS.has(kind)) {
      needs("options", "options");
      forbid(["blanks", "answer", "items", "groups", "rubric", "sample"]);
      if (q.options) checkUniqueIds(q.options, ctx, [...path, "options"]);
      if (kind === "true_false" && q.options && (q.options.length !== 2 || !q.options.some((o) => o.id === "true") || !q.options.some((o) => o.id === "false"))) {
        issue('A "true_false" question needs exactly the options "true" and "false"', ["options"]);
      }
    } else {
      forbid(["options", "correct"]);
      if (kind === "fill_blank") {
        forbid(["answer", "items", "groups", "rubric", "sample"]);
        const marks = countBlanks(q.prompt);
        if (!marks) issue("Mark each blank in the prompt with ___ (three underscores)", ["prompt"]);
        if (answers === "required") {
          needs("blanks", "blanks (what to accept for each ___)");
          if (q.blanks && marks && q.blanks.length !== marks) issue(`The prompt has ${marks} blank${marks === 1 ? "" : "s"} (___) but there are ${q.blanks.length} entries in blanks`, ["blanks"]);
        }
      }
      if (kind === "numeric") {
        forbid(["blanks", "items", "groups", "rubric", "sample"]);
        if (answers === "required") needs("answer", "an answer (value, optional tolerance and unit)");
      }
      if (kind === "order" || kind === "categorize") {
        forbid(["blanks", "answer", "rubric", "sample"]);
        needs("items", "items");
        if (q.items) checkUniqueIds(q.items, ctx, [...path, "items"]);
        if (kind === "order") forbid(["groups"]);
        if (kind === "order" && q.items?.some((item) => item.group)) issue('Items in an "order" question don\'t have groups', ["items"]);
        if (kind === "categorize") {
          needs("groups", "groups");
          if (q.groups) checkUniqueIds(q.groups, ctx, [...path, "groups"]);
          const groupIds = new Set(q.groups?.map((g) => g.id));
          if (answers === "required") {
            q.items?.forEach((item, j) => {
              if (!item.group) issue("Say which group this item belongs in", ["items", j, "group"]);
              else if (!groupIds.has(item.group)) issue(`No group has id "${item.group}"`, ["items", j, "group"]);
            });
          }
        }
      }
      if (kind === "short_answer") {
        forbid(["blanks", "answer", "items", "groups"]);
        if (answers === "required") needs("rubric", "a rubric (the points a good answer covers)");
      }
    }

    if (answers === "forbidden") {
      // A server-graded spec is sent to the learner's browser, so it must not carry answers.
      const leaks: [keyof Question, string][] = [
        ["correct", "correct answers"],
        ["explanation", "explanations"],
        ["blanks", "accepted blank answers"],
        ["answer", "the numeric answer"],
        ["rubric", "the rubric"],
        ["sample", "a model answer"],
      ];
      for (const [field, what] of leaks) if (q[field] !== undefined) issue(`Server-graded questions must not include ${what}`, [field]);
      q.options?.forEach((o, j) => {
        if (o.rationale) issue("Server-graded options must not include rationales", ["options", j, "rationale"]);
      });
      if (kind === "categorize" && q.items?.some((item) => item.group)) issue("Server-graded items must not say their group", ["items"]);
      return;
    }
    if (!CHOICE_KINDS.has(kind)) return;
    if (!q.correct) {
      issue("List the correct option ids", ["correct"]);
      return;
    }
    const optionIds = new Set(q.options?.map((o) => o.id));
    q.correct.forEach((id, j) => {
      if (!optionIds.has(id)) issue(`No option has id "${id}"`, ["correct", j]);
    });
    if (new Set(q.correct).size !== q.correct.length) issue("Correct option ids repeat", ["correct"]);
    if (kind !== "multiple" && q.correct.length !== 1) issue(`A "${kind}" question needs exactly one correct option`, ["correct"]);
  });
}

/** Practice questions: each one is checked as soon as the learner answers it. */
export const mcqSchema = z
  .object({
    ...activityFields("mcq"),
    questions: z.array(questionSchema).min(1).max(LIMITS.questions),
    allowRetry: z.boolean().optional().describe("Let the learner try again after a wrong answer. Defaults to true."),
  })
  .superRefine((spec, ctx) => checkQuestions(spec.questions, ctx, "required"));

/** An assessment: answers are checked together on submit, then reviewed. */
export const quizSchema = z
  .object({
    ...activityFields("quiz"),
    questions: z.array(questionSchema).min(1).max(LIMITS.questions),
    grading: z
      .enum(["client", "server"])
      .optional()
      .describe('"client" (default) grades in the browser from `correct`; "server" sends answers to a grader and must not include them.'),
    timeLimitSeconds: z.number().int().min(10).max(14_400).optional(),
    passingPercent: z.number().min(0).max(100).optional(),
    shuffleQuestions: z.boolean().optional(),
  })
  .superRefine((spec, ctx) => checkQuestions(spec.questions, ctx, spec.grading === "server" ? "forbidden" : "required"));

export type McqSpec = z.infer<typeof mcqSchema>;
export type QuizSpec = z.infer<typeof quizSchema>;
