import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { canvases } from "./canvases";
import { pages } from "./pages";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * A "figure" on a canvas: a titled group of shapes that can be embedded in
 * notes as an image. The id is minted on the client when the figure is made
 * (it lives on the canvas item), so the canvas and this row agree
 * without a round trip. The PNG sits at a fixed Storage path per figure and
 * is overwritten on every change, so every embed always shows the latest.
 */
export const canvasFigures = pgTable(
  "canvas_figures",
  {
    id: text("id").primaryKey(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Object path in the `canvas-figures` bucket; null until the first image upload. */
    imagePath: text("image_path"),
    width: integer("width").default(0).notNull(),
    height: integer("height").default(0).notNull(),
    /** Client hash of the figure's shapes, so unchanged figures aren't re-exported. */
    contentHash: text("content_hash"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Published by itself: public at /f/<id> even while its canvas stays private. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    canvasIdx: index("canvas_figures_canvas_id_idx").on(table.canvasId),
    workspaceIdx: index("canvas_figures_workspace_id_idx").on(table.workspaceId),
  }),
);

/**
 * Which notes show which figures. Whoever can read the note can see the
 * figure, so a row is only added when the person saving the note could already
 * see the figure (figure ids aren't secret). No foreign key to the figure:
 * deleting one on the canvas and undoing brings the same id back.
 */
export const figureEmbeds = pgTable(
  "figure_embeds",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    figureId: text("figure_id").notNull(),
    addedByUserId: text("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pageId, table.figureId] }),
    figureIdx: index("figure_embeds_figure_id_idx").on(table.figureId),
  }),
);
