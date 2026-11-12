export { LIMITS } from "./limits.js";
export { SCHEMA_VERSION, activityFields, checkUniqueIds, idSchema, schemaVersionSchema, textSchema, titleSchema } from "./schemas/common.js";
export type { IssueSink } from "./schemas/common.js";
export { flashcardSchema, flashcardsSchema } from "./schemas/flashcards.js";
export type { Flashcard, FlashcardsSpec } from "./schemas/flashcards.js";
export { BLANK, CHOICE_KINDS, choiceSchema, countBlanks, mcqSchema, QUESTION_KINDS, questionSchema, quizSchema } from "./schemas/questions.js";
export type { Choice, McqSpec, Question, QuestionKind, QuizSpec } from "./schemas/questions.js";
export { matchPairSchema, matchingSchema } from "./schemas/matching.js";
export type { MatchPair, MatchingSpec } from "./schemas/matching.js";
export { mindmapNodeSchema, mindmapSchema } from "./schemas/mindmap.js";
export type { MindmapNode, MindmapSpec } from "./schemas/mindmap.js";
export { builtInActivities, createRegistry, defaultRegistry, isSession } from "./registry.js";
export type {
  ActivityCapability,
  ActivityDefinition,
  ActivityRegistry,
  ActivitySpec,
  ActivitySpecBase,
  SessionSpec,
  SpecIssue,
  ValidationResult,
} from "./registry.js";
export { gradeQuestions, gradeQuiz, isAnswerCorrect, makeScore, redactQuiz, scrambled } from "./grading.js";
export { checkResponse, expectedResponse, isAnswered, isChoice, kindOf, parseNumber, placements } from "./answers.js";
export type { Check, Response } from "./answers.js";
export type { GradeResult, QuestionResult, Responses, Score } from "./grading.js";
export { REVIEW_INTERVALS_DAYS, orderByDue, scheduleReview } from "./review.js";
export type { ReviewState } from "./review.js";
export type { ActivityEvent, ActivityEventHandler, ActivityEventInput, ActivityEventType } from "./events.js";
export { memoryStore, webStorageStore } from "./progress.js";
export type { ActivityProgress, ActivityStatus, ProgressStore } from "./progress.js";
export { parseModelOutput, parseSpec, sessionToolDefinition } from "./ai.js";
export type { ParseOptions, ToolDefinition } from "./ai.js";
export { seededRandom, shuffle } from "./shuffle.js";
export { normalizeSpec } from "./normalize.js";
export { outlineToMindmap, outlineToMindmapNodes } from "./outline.js";
