import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { canvases } from "./canvases";
import { pages } from "./pages";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * A "figure" on a canvas: a titled group of shapes that can be embedded in
 * notes as an image. The row is made when the canvas is saved, whoever saved it
 * (browser, CLI or assistant); its id comes from the canvas item. The picture
 * comes later, from a browser, since only the browser can draw it. The PNG sits at a fixed Storage path per figure and
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
 * figure, so a row only counts once the person who saved the note is known to be
 * able to see the figure (figure ids aren't secret). `verified` is false when the
 * figure didn't exist yet at that save; it's checked when someone asks for it. No
 * foreign key to the figure: deleting one on the canvas and undoing brings the
 * same id back.
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
    verified: boolean("verified").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pageId, table.figureId] }),
    figureIdx: index("figure_embeds_figure_id_idx").on(table.figureId),
  }),
);
