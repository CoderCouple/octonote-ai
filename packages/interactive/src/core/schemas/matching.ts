import { z } from "zod/v4";
import { LIMITS } from "../limits.js";
import { activityFields, checkUniqueIds, idSchema, textSchema } from "./common.js";

export const matchPairSchema = z.object({
  id: idSchema,
  left: textSchema.describe("Shown in the first column, e.g. a term."),
  right: textSchema.describe("Its match, shown shuffled in the second column."),
});

export const matchingSchema = z
  .object({
    ...activityFields("matching"),
    prompt: textSchema.optional().describe("The instruction, e.g. Match each organ to its job."),
    pairs: z.array(matchPairSchema).min(2).max(LIMITS.pairs),
    maxMistakes: z.number().int().min(1).max(50).optional().describe("Wrong matches allowed before the learner must start again."),
  })
  .superRefine((spec, ctx) => {
    checkUniqueIds(spec.pairs, ctx, ["pairs"]);
    const rights = new Set<string>();
    spec.pairs.forEach((pair, i) => {
      // Two identical answers would make the exercise ambiguous.
      const key = pair.right.toLowerCase();
      if (rights.has(key)) ctx.addIssue({ code: "custom", message: "Two pairs have the same right side", path: ["pairs", i, "right"] });
      rights.add(key);
    });
  });

export type MatchPair = z.infer<typeof matchPairSchema>;
export type MatchingSpec = z.infer<typeof matchingSchema>;
