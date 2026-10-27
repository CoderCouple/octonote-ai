import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { usage } from "../core/errors.js";
import { parseFrontMatter } from "../core/frontmatter.js";
import { readContent } from "../core/input.js";
import { emit } from "../core/output.js";
import { appUrl, parseRef } from "../core/refs.js";
import { describeItem, item, setPublished } from "../core/resources.js";
import { action } from "../core/run.js";

interface Project {
  id: string;
  name: string;
  notebookId: string | null;
  updatedAt: string;
  noteId: string | null;
  canvasId: string | null;
}

const VIEWS = {
  notes: "notes",
  note: "notes",
  canvas: "canvas",
  split: "split",
} as const;

export function registerProject(program: Command) {
  const project = program
    .command("project")
    .description("Projects: one note and one canvas, side by side");

  project
    .command("create")
    .description(
      "Create a project; fill its note from markdown and draw its canvas from mermaid in one go",
    )
    .argument("<name>", "project name")
    .option("-d, --description <text>", "one-line description")
    .option(
      "--note <path>",
      'markdown file for the project\'s note ("-" for stdin)',
    )
    .option(
      "--canvas-mermaid <path>",
      "mermaid flowchart or class diagram file to draw on the project's canvas",
    )
    .option(
      "--view <view>",
      "what readers see first: notes | canvas | split",
      "split",
    )
    .option(
      "-n, --notebook <notebook>",
      "put it in a notebook (id or exact name)",
    )
    .option("--publish", "publish it to the web and print the public URL")
    .action(
      action(
        async (
          ctx,
          name: string,
          opts: {
            description?: string;
            note?: string;
            canvasMermaid?: string;
            view: string;
            notebook?: string;
            publish?: boolean;
          },
        ) => {
          const view = VIEWS[opts.view as keyof typeof VIEWS];
          if (!view)
            throw usage(
              `Unknown --view "${opts.view}".`,
              "Use notes, canvas or split.",
            );
          if (opts.note === "-" && opts.canvasMermaid === "-")
            throw usage(
              "Only one of --note / --canvas-mermaid can read stdin.",
            );
          // Read everything first so a bad file doesn't leave a half-made project.
          const noteMd = opts.note
            ? parseFrontMatter((await readContent({ file: opts.note })) ?? "")
                .body
            : null;
          const mermaid = opts.canvasMermaid
            ? await readContent({ file: opts.canvasMermaid })
            : null;
          const notebookId = opts.notebook
            ? (await resolveNotebook(ctx, opts.notebook)).id
            : undefined;
          const ws = await ctx.workspaceId();
          const p = await ctx.api.post<Project>(`/workspaces/${ws}/projects`, {
            name: name.slice(0, 120),
            ...(opts.description ? { description: opts.description } : {}),
            ...(notebookId ? { notebookId } : {}),
          });
          try {
            await ctx.api.patch(`/projects/${p.id}`, {
              settings: { defaultView: view },
            });
            if (noteMd?.trim() && p.noteId)
              await ctx.api.put(`/pages/${p.noteId}/markdown`, {
                markdown: noteMd,
              });
            if (mermaid?.trim() && p.canvasId)
              await ctx.api.put(`/canvases/${p.canvasId}/mermaid`, { mermaid });
          } catch (err) {
            // The server only checks the note and diagram once the project
            // exists: remove it again rather than leave it half made.
            await ctx.api.delete(`/projects/${p.id}`).catch(() => {});
            throw err;
          }
          const out = {
            ...item(ctx, "project", p),
            noteId: p.noteId,
            canvasId: p.canvasId,
            ...(opts.publish
              ? {
                  publicUrl: (await setPublished(ctx, "project", p.id, true))
                    .publicUrl,
                }
              : {}),
          };
          emit(
            out,
            (d) =>
              `${describeItem(d)}\n  note ${d.noteId} · canvas ${d.canvasId}`,
          );
        },
      ),
    );

  project
    .command("show")
    .description("Show a project and the ids of its note and canvas")
    .argument("<project>", "project id (prj_…) or URL")
    .action(
      action(async (ctx, ref: string) => {
        const { id } = parseRef(ref, "project");
        const p = await ctx.api.get<Project>(`/projects/${id}`);
        emit(
          {
            ...item(ctx, "project", p),
            noteId: p.noteId,
            canvasId: p.canvasId,
            noteUrl: p.noteId
              ? appUrl(ctx.config.webUrl, "page", p.noteId)
              : null,
            canvasUrl: p.canvasId
              ? appUrl(ctx.config.webUrl, "canvas", p.canvasId)
              : null,
          },
          (d) =>
            `${describeItem(d)}\n  note ${d.noteId} · canvas ${d.canvasId}`,
        );
      }),
    );
}
