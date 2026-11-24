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
});
export type DeckCreate = z.infer<typeof DeckCreateSchema>;

/** PATCH /decks/:id */
export const DeckUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    document: z.unknown().optional(),
  })
  .refine((v) => v.title !== undefined || v.document !== undefined, "Nothing to update.");
export type DeckUpdate = z.infer<typeof DeckUpdateSchema>;
