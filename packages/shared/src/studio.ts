/**
 * Studio: turn a source (pasted text, a web page, a note or project, or a
 * PDF) into one interactive block, made by AI and kept as a studio item the
 * person can open, share, and add to any note.
 */
import { z } from "zod";

/** What Studio can make; each is a note block kind ("text" is the summary). */
export const STUDIO_KINDS = ["infographic", "mindmap", "flashcards", "quiz", "mcq", "matching", "text"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const STUDIO_KIND_LABEL: Record<StudioKind, string> = {
  infographic: "Infographic",
  mindmap: "Mind map",
  flashcards: "Flashcards",
  quiz: "Quiz",
  mcq: "Practice",
  matching: "Matching",
  text: "Summary",
};

export const STUDIO_KIND_HINT: Record<StudioKind, string> = {
  infographic: "Key facts as a picture: cards, steps, stats, a timeline or bars",
  mindmap: "Every idea as a tree you can explore and test yourself on",
  flashcards: "Two-sided cards with spaced repetition",
  quiz: "A scored test with a review at the end",
  mcq: "Questions checked one at a time, with hints",
  matching: "Pair terms with their meanings",
  text: "A short summary with the main points",
};

export const STUDIO_SOURCES = ["text", "url", "item", "pdf"] as const;
export type StudioSourceType = (typeof STUDIO_SOURCES)[number];

export const STUDIO_SOURCE_LABEL: Record<StudioSourceType, string> = {
  text: "Text",
  url: "Web page",
  item: "Note",
  pdf: "PDF",
};

export const STUDIO_STATUSES = ["running", "succeeded", "failed"] as const;
export type StudioStatus = (typeof STUDIO_STATUSES)[number];

export const STUDIO_LIMITS = {
  /** Characters of source the AI reads; longer sources are cut. */
  sourceChars: 30_000,
  /** Shortest source worth turning into something. */
  minSourceChars: 80,
  pdfBytes: 7 * 1024 * 1024,
  /** Items per workspace a person can keep. */
  items: 500,
  title: 120,
} as const;

/** The source, as the web app sends it. A PDF travels as base64. */
export const StudioSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(200_000) }),
  z.object({ type: z.literal("url"), url: z.string().trim().url().max(2048) }),
  z.object({ type: z.literal("item"), id: z.string().trim().min(1).max(80) }),
  z.object({
    type: z.literal("pdf"),
    name: z.string().trim().min(1).max(200),
    data: z.string().min(1).max(Math.ceil((STUDIO_LIMITS.pdfBytes * 4) / 3) + 8),
  }),
]);
export type StudioSource = z.infer<typeof StudioSourceSchema>;

export const CreateStudioItemSchema = z.object({
  workspaceId: z.string().trim().min(1),
  kind: z.enum(STUDIO_KINDS),
  title: z.string().trim().max(STUDIO_LIMITS.title).optional(),
  source: StudioSourceSchema,
});
export type CreateStudioItemInput = z.infer<typeof CreateStudioItemSchema>;

/** A row in the Studio list. */
export interface StudioItemSummary {
  id: string;
  title: string;
  kind: StudioKind;
  status: StudioStatus;
  sourceType: StudioSourceType;
  sourceLabel: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One item, with what was made and the text it was made from. */
export interface StudioItem extends StudioItemSummary {
  workspaceId: string;
  /** The block's JSON (without `kind`); `{ markdown }` for a summary. Null until it succeeds. */
  spec: Record<string, unknown> | null;
  error: string | null;
  sourceRef: string | null;
  sourceText: string;
  sourceChars: number;
  durationMs: number | null;
  /** True for the person who made it; false when someone opens a shared item. */
  mine: boolean;
}

export interface StudioStats {
  total: number;
  succeeded: number;
  running: number;
  failed: number;
  thisWeek: number;
}
