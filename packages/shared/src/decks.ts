/**
 * Presentations (decks). The deck document itself (slides, layouts, builds)
 * is defined and checked by @octonote/slides; these are the API's request
 * shapes around it.
 */
import { z } from "zod";
import { ID_PREFIXES } from "./ids";

const id = (prefix: string) =>
  z.string().regex(/^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).refine((v) => v.startsWith(`${prefix}_`), `Expected ${prefix}_<uuid> id`);

/** What a deck can be made from. */
export const DECK_SOURCE_KINDS = ["page", "project", "notebook"] as const;
export type DeckSourceKind = (typeof DECK_SOURCE_KINDS)[number];

export const DeckSourceSchema = z.object({
  kind: z.enum(DECK_SOURCE_KINDS),
  id: z.string().min(1).max(64),
  split: z.enum(["heading", "divider"]).default("heading"),
});
export type DeckSource = z.infer<typeof DeckSourceSchema>;

/** POST /workspaces/:workspaceId/decks */
export const DeckCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Untitled presentation"),
  notebookId: id(ID_PREFIXES.notebook).optional(),
  /** The slides to start with (made in the app from a note); an empty deck when left out. */
  document: z.unknown().optional(),
  /** What it was made from, for "Update from source". The caller must be able to view it. */
  source: DeckSourceSchema.optional(),
  /** Slide markdown instead of a document: --- between slides, ??? before a slide's presenter notes. */
  markdown: z.string().min(1).max(2_000_000).optional(),
});
export type DeckCreate = z.infer<typeof DeckCreateSchema>;

/** POST /workspaces/:workspaceId/decks/from — made on the server from a note, project or notebook. */
export const DeckFromSourceSchema = z.object({
  source: DeckSourceSchema,
  /** Defaults to the source's title. */
  title: z.string().trim().min(1).max(120).optional(),
  /** Defaults to the source's notebook (a notebook's own deck goes inside it). */
  notebookId: id(ID_PREFIXES.notebook).optional(),
  /** Paragraphs go to the presenter notes; slides keep the points. */
  textToNotes: z.boolean().default(true),
  /** Each block (quiz, video, app…) on its own slide. */
  onePerSlide: z.boolean().default(true),
  /**
   * rules: split at headings or dividers (instant, free). ai: a model plans
   * the slides, shortens text to points and writes the presenter notes (uses
   * the AI allowance; split and the two options above don't apply).
   */
  design: z.enum(["rules", "ai"]).default("rules"),
});
export type DeckFromSource = z.infer<typeof DeckFromSourceSchema>;

/** PATCH /decks/:id */
export const DeckUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    document: z.unknown().optional(),
  })
  .refine((v) => v.title !== undefined || v.document !== undefined, "Nothing to update.");
export type DeckUpdate = z.infer<typeof DeckUpdateSchema>;
