import { z } from "zod/v4";
import { LIMITS } from "../limits.js";
import { activityFields, checkUniqueIds, idSchema, type IssueSink, textSchema } from "./common.js";

export const choiceSchema = z.object({
  id: idSchema,
  text: textSchema,
  rationale: textSchema.optional().describe("Why this option is right or wrong. Shown after answering."),
});

export const questionSchema = z.object({
  id: idSchema,
  prompt: textSchema,
  kind: z
    .enum(["single", "multiple", "true_false"])
    .optional()
    .describe('"single" (default) has exactly one correct option; "multiple" has one or more; "true_false" has options with ids "true" and "false".'),
  options: z.array(choiceSchema).min(2).max(LIMITS.options),
  correct: z
    .array(idSchema)
    .min(1)
    .max(LIMITS.options)
    .optional()
    .describe("Ids of the correct options. Leave out when the quiz is graded on a server."),
  hint: textSchema.optional(),
  explanation: textSchema.optional().describe("Shown after answering, whatever the learner chose."),
  points: z.number().int().min(0).max(100).optional().describe("Defaults to 1."),
});

export type Choice = z.infer<typeof choiceSchema>;
export type Question = z.infer<typeof questionSchema>;

function checkQuestions(
  questions: readonly Question[],
  ctx: IssueSink,
  answers: "required" | "forbidden",
) {
  checkUniqueIds(questions, ctx, ["questions"]);
  questions.forEach((q, i) => {
    const path = ["questions", i];
    checkUniqueIds(q.options, ctx, [...path, "options"]);
    if (q.kind === "true_false" && (q.options.length !== 2 || !q.options.some((o) => o.id === "true") || !q.options.some((o) => o.id === "false"))) {
      ctx.addIssue({ code: "custom", message: 'A "true_false" question needs exactly the options "true" and "false"', path: [...path, "options"] });
    }
    if (answers === "forbidden") {
      // A server-graded spec is sent to the learner's browser, so it must not carry answers.
      if (q.correct) ctx.addIssue({ code: "custom", message: "Server-graded questions must not include correct answers", path: [...path, "correct"] });
      if (q.explanation) ctx.addIssue({ code: "custom", message: "Server-graded questions must not include explanations", path: [...path, "explanation"] });
      q.options.forEach((o, j) => {
        if (o.rationale) ctx.addIssue({ code: "custom", message: "Server-graded options must not include rationales", path: [...path, "options", j, "rationale"] });
      });
      return;
    }
    if (!q.correct) {
      ctx.addIssue({ code: "custom", message: "List the correct option ids", path: [...path, "correct"] });
      return;
    }
    const optionIds = new Set(q.options.map((o) => o.id));
    q.correct.forEach((id, j) => {
      if (!optionIds.has(id)) ctx.addIssue({ code: "custom", message: `No option has id "${id}"`, path: [...path, "correct", j] });
    });
    if (new Set(q.correct).size !== q.correct.length) {
      ctx.addIssue({ code: "custom", message: "Correct option ids repeat", path: [...path, "correct"] });
    }
    if (q.kind !== "multiple" && q.correct.length !== 1) {
      ctx.addIssue({ code: "custom", message: `A "${q.kind ?? "single"}" question needs exactly one correct option`, path: [...path, "correct"] });
    }
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
