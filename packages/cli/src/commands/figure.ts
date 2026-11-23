/**
 * Pictures out of Octonote: a canvas's figures (frames saved as images,
 * fig_…) and a whole canvas or project canvas as a PNG.
 */
import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { CliError, usage } from "../core/errors.js";
import { emit, table } from "../core/output.js";
import { parseRef } from "../core/refs.js";
import { action } from "../core/run.js";

interface Figure {
  id: string;
  canvasId: string;
  canvasTitle?: string;
  title: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  width: number;
  height: number;
  updatedAt: string;
}

const figureId = (ref: string) => {
  const id = ref.match(/fig_[A-Za-z0-9_-]+/)?.[0];
  if (!id) throw usage(`"${ref}" isn't a figure id.`, "Figure ids look like fig_…; `octonote figure list` shows them.");
  return id;
};

const figureOut = (f: Figure) => ({
  kind: "figure",
  id: f.id,
  title: f.title,
  canvasId: f.canvasId,
  ...(f.canvasTitle ? { canvasTitle: f.canvasTitle } : {}),
  url: f.url,
  published: Boolean(f.publishedAt),
  width: Math.round(f.width),
  height: Math.round(f.height),
  updatedAt: f.updatedAt,
});

async function save(path: string, bytes: Buffer) {
  try {
    await writeFile(path, bytes);
  } catch {
    throw usage(`Can't write ${path}.`);
  }
}

export function registerFigure(program: Command) {
  const figure = program
    .command("figure")
    .description("Figures: frames on a canvas, kept as pictures you can download or publish on their own");

  figure
    .command("list")
    .alias("ls")
    .description("List figures, in the workspace or on one canvas")
    .option("-c, --canvas <canvas>", "only this canvas's figures (cnv_…)")
    .action(
      action(async (ctx, opts: { canvas?: string }) => {
        const rows = opts.canvas
          ? await ctx.api.get<Figure[]>(`/canvases/${parseRef(opts.canvas, "canvas").id}/figures`)
          : await ctx.api.get<Figure[]>(`/workspaces/${await ctx.workspaceId()}/figures`);
        emit(rows.map(figureOut), (list) =>
          table(
            list.map((f) => ({
              id: f.id,
              title: f.title.length > 36 ? `${f.title.slice(0, 35)}…` : f.title,
              canvas: f.canvasTitle ?? f.canvasId,
              public: f.published ? "yes" : "",
            })),
            ["id", "title", "canvas", "public"],
          ),
        );
      }),
    );

  figure
    .command("show")
    .description("A figure's details and link")
    .argument("<figure>", "figure id (fig_…)")
    .action(
      action(async (ctx, ref: string) => {
        const f = await ctx.api.get<Figure>(`/figures/${figureId(ref)}`);
        emit(figureOut(f), (d) => `figure “${d.title}” ${d.id} (${d.width}×${d.height})\n  ${d.url}`);
      }),
    );

  figure
    .command("download")
    .description("Save a figure as a PNG")
    .argument("<figure>", "figure id (fig_…)")
    .option("-o, --out <path>", "file to write (default: <id>.png)")
    .action(
      action(async (ctx, ref: string, opts: { out?: string }) => {
        const id = figureId(ref);
        const path = opts.out ?? `${id}.png`;
        await save(path, await ctx.api.bytes(`/figures/${id}/image`));
        emit({ kind: "figure", id, file: path }, (d) => `Saved ${d.file}`);
      }),
    );
}

/** `canvas image`: added to the canvas command. */
export function registerCanvasImage(canvas: Command) {
  canvas
    .command("image")
    .description("Save a canvas (or a project's canvas) as a PNG")
    .argument("<canvas>", "canvas or project id (cnv_… / prj_…)")
    .option("-o, --out <path>", "file to write (default: <id>.png)")
    .action(
      action(async (ctx, ref: string, opts: { out?: string }) => {
        const { kind, id } = parseRef(ref);
        if (kind !== "canvas" && kind !== "project") throw usage(`${id} isn't a canvas or project.`);
        let bytes: Buffer;
        try {
          bytes = await ctx.api.bytes(`/extension/items/${id}/image`);
        } catch (err) {
          if (err instanceof CliError && err.code === "NOT_FOUND")
            throw new CliError("This canvas has no picture yet.", "NO_IMAGE", {
              hint: "Octonote saves it when the canvas is opened in the app: open it once (`octonote open <id>`), then try again.",
            });
          throw err;
        }
        const path = opts.out ?? `${id}.png`;
        await save(path, bytes);
        emit({ kind: kind === "canvas" ? "canvas" : "project", id, file: path }, (d) => `Saved ${d.file}`);
      }),
    );
}
