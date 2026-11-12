import { z } from "zod/v4";
import { LIMITS } from "../limits.js";
import { activityFields, checkUniqueIds, idSchema, textSchema } from "./common.js";

export const flashcardSchema = z.object({
  id: idSchema,
  front: textSchema.describe("The prompt side: a term or a question."),
  back: textSchema.describe("The answer side."),
  hint: textSchema.optional(),
});

export const flashcardsSchema = z
  .object({
    ...activityFields("flashcards"),
    cards: z.array(flashcardSchema).min(1).max(LIMITS.cards),
    shuffle: z.boolean().optional().describe("Start in a random order."),
    spacedRepetition: z.boolean().optional().describe("Schedule cards for review based on what the learner knows."),
  })
  .superRefine((spec, ctx) => checkUniqueIds(spec.cards, ctx, ["cards"]));

export type Flashcard = z.infer<typeof flashcardSchema>;
export type FlashcardsSpec = z.infer<typeof flashcardsSchema>;
