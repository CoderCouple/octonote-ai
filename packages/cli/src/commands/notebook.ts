import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { emit, table } from "../core/output.js";
import { describeItem, item } from "../core/resources.js";
import { action } from "../core/run.js";

interface Notebook {
  id: string;
  name: string;
  updatedAt: string;
  counts?: { notes: number; canvases: number; projects: number };
}

export function registerNotebook(program: Command) {
  const notebook = program.command("notebook").description("Notebooks: folders for notes, canvases and projects");

  notebook
    .command("list")
    .description("List notebooks with what's inside")
    .action(
      action(async (ctx) => {
        const ws = await ctx.workspaceId();
        const rows = await ctx.api.get<Notebook[]>(`/workspaces/${ws}/notebooks`);
        emit(
          rows.map((n) => ({ ...item(ctx, "notebook", n), counts: n.counts ?? null })),
          (list) =>
            table(
              list.map((n) => ({
                id: n.id,
                name: n.title,
                contents: n.counts ? `${n.counts.notes} notes · ${n.counts.canvases} canvases · ${n.counts.projects} projects` : "",
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
        const nb = await ctx.api.post<Notebook>(`/workspaces/${ws}/notebooks`, { name: name.slice(0, 120) });
        emit(item(ctx, "notebook", nb), describeItem);
      }),
    );

  notebook
    .command("show")
    .description("Show a notebook (id or exact name)")
    .argument("<notebook>", "notebook id or exact name")
    .action(
      action(async (ctx, ref: string) => {
        const nb = await resolveNotebook(ctx, ref);
        emit(item(ctx, "notebook", nb), describeItem);
      }),
    );
}
