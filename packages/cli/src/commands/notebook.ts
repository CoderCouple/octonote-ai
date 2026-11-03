import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { emit, table } from "../core/output.js";
import { describeItem, item, type Item } from "../core/resources.js";
import { action } from "../core/run.js";
import { renderNotebook } from "../core/terminal-items.js";
import { dimUrl } from "../core/terminal-markdown.js";

interface Notebook {
  id: string;
  name: string;
  updatedAt: string;
  counts?: { notes: number; canvases: number; projects: number };
  publishedAt?: string | null;
}

interface Entry {
  id: string;
  title?: string;
  name?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

interface Contents {
  notebook: Notebook;
  notes: Entry[];
  canvases: Entry[];
  projects: Entry[];
}

export function registerNotebook(program: Command) {
  const notebook = program
    .command("notebook")
    .description("Notebooks: folders for notes, canvases and projects");

  notebook
    .command("list")
    .description("List notebooks with what's inside")
    .action(
      action(async (ctx) => {
        const ws = await ctx.workspaceId();
        const rows = await ctx.api.get<Notebook[]>(
          `/workspaces/${ws}/notebooks`,
        );
        emit(
          rows.map((n) => ({
            ...item(ctx, "notebook", n),
            counts: n.counts ?? null,
          })),
          (list) =>
            table(
              list.map((n) => ({
                id: n.id,
                name: n.title,
                contents: n.counts
                  ? `${n.counts.notes} notes · ${n.counts.canvases} canvases · ${n.counts.projects} projects`
                  : "",
              })),
              ["id", "name", "contents"],
            ),
        );
      }),
    );

  notebook
    .command("create")
    .description("Create a notebook")
    .argument("<name>", "notebook name")
    .action(
      action(async (ctx, name: string) => {
        const ws = await ctx.workspaceId();
        const nb = await ctx.api.post<Notebook>(`/workspaces/${ws}/notebooks`, {
          name: name.slice(0, 120),
        });
        emit(item(ctx, "notebook", nb), describeItem);
      }),
    );

  notebook
    .command("show")
    .description("Show a notebook and what's inside (id or exact name)")
    .argument("<notebook>", "notebook id or exact name")
    .action(
      action(async (ctx, ref: string) => {
        const { id } = await resolveNotebook(ctx, ref);
        const c = await ctx.api.get<Contents>(`/notebooks/${id}`);
        // Everything in a published notebook is public, whatever its own state.
        const inside = (kind: "page" | "canvas" | "project", rows: Entry[]) =>
          rows.map((r): Item & { published: boolean } => ({
            ...item(ctx, kind, r),
            published: Boolean(r.publishedAt ?? c.notebook.publishedAt),
          }));
        emit(
          {
            ...item(ctx, "notebook", c.notebook),
            items: [
              ...inside("page", c.notes),
              ...inside("canvas", c.canvases),
              ...inside("project", c.projects),
            ],
          },
          (d) => `${renderNotebook(d.title, d.items)}\n\n${dimUrl(d.url)}`,
        );
      }),
    );
}
