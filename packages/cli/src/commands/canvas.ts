import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { usage } from "../core/errors.js";
import { readContent } from "../core/input.js";
import { emit } from "../core/output.js";
import { parseRef } from "../core/refs.js";
import { describeItem, item, setPublished } from "../core/resources.js";
import { action } from "../core/run.js";

interface Canvas {
  id: string;
  title: string;
  notebookId: string | null;
  updatedAt: string;
  document?: unknown;
}

function parseSnapshot(text: string): unknown {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw usage(
      "That file isn't JSON.",
      "`canvas push` takes a tldraw snapshot from `canvas pull`; to draw from a diagram use --from-mermaid.",
    );
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    !("store" in doc) ||
    !("schema" in doc)
  ) {
    throw usage(
      "That JSON isn't a tldraw snapshot (it needs `store` and `schema`).",
    );
  }
  return doc;
}

export function registerCanvas(program: Command) {
  const canvas = program
    .command("canvas")
    .description(
      "Canvases: draw them from mermaid flowcharts or class diagrams, or push tldraw JSON",
    );

  canvas
    .command("create")
    .description(
      "Create a canvas — drawn from a mermaid flowchart or class diagram, from tldraw JSON, or empty",
    )
    .argument("[title]", "title", "Untitled canvas")
    .option(
      "-m, --from-mermaid <path>",
      'mermaid flowchart or class diagram file ("-" for stdin) to draw as real shapes',
    )
    .option("-f, --file <path>", "tldraw snapshot JSON (from `canvas pull`)")
    .option(
      "-n, --notebook <notebook>",
      "put it in a notebook (id or exact name)",
    )
    .option("--publish", "publish it to the web and print the public URL")
    .action(
      action(
        async (
          ctx,
          title: string,
          opts: {
            fromMermaid?: string;
            file?: string;
            notebook?: string;
            publish?: boolean;
          },
        ) => {
          if (opts.fromMermaid && opts.file)
            throw usage("Use either --from-mermaid or --file, not both.");
          const mermaid = opts.fromMermaid
            ? await readContent({ file: opts.fromMermaid })
            : null;
          const document = opts.file
            ? parseSnapshot((await readContent({ file: opts.file })) ?? "")
            : null;
          const notebookId = opts.notebook
            ? (await resolveNotebook(ctx, opts.notebook)).id
            : undefined;
          const ws = await ctx.workspaceId();
          let row = await ctx.api.post<Canvas>(`/workspaces/${ws}/canvases`, {
            title: title.slice(0, 120),
            ...(notebookId ? { notebookId } : {}),
            ...(mermaid?.trim() ? { mermaid } : {}),
          });
          if (document)
            row = await ctx.api.patch<Canvas>(`/canvases/${row.id}`, {
              document,
            });
          const out = item(ctx, "canvas", row);
          if (opts.publish)
            out.publicUrl = (
              await setPublished(ctx, "canvas", row.id, true)
            ).publicUrl;
          emit(out, describeItem);
        },
      ),
    );

  canvas
    .command("redraw")
    .description("Replace a canvas with a drawing of a mermaid flowchart or class diagram")
    .argument("<canvas>", "canvas id (cnv_…) or URL")
    .requiredOption(
      "-m, --from-mermaid <path>",
      'mermaid flowchart or class diagram file ("-" for stdin)',
    )
    .action(
      action(async (ctx, ref: string, opts: { fromMermaid: string }) => {
        const { id } = parseRef(ref, "canvas");
        const mermaid = (await readContent({ file: opts.fromMermaid })) ?? "";
        const row = await ctx.api.put<Canvas>(`/canvases/${id}/mermaid`, {
          mermaid,
        });
        emit(item(ctx, "canvas", row), (i) => `Redrew ${describeItem(i)}`);
      }),
    );

  canvas
    .command("pull")
    .description("Save a canvas as tldraw JSON")
    .argument("<canvas>", "canvas id (cnv_…) or URL")
    .option("-o, --out <path>", "file to write (default: <id>.json)")
    .action(
      action(async (ctx, ref: string, opts: { out?: string }) => {
        const { id } = parseRef(ref, "canvas");
        const row = await ctx.api.get<Canvas>(`/canvases/${id}`);
        const path = opts.out ?? `${id}.json`;
        await writeFile(
          path,
          `${JSON.stringify(row.document ?? {}, null, 2)}\n`,
        );
        emit(
          { ...item(ctx, "canvas", row), file: path },
          (d) => `Saved “${d.title}” to ${d.file}`,
        );
      }),
    );

  canvas
    .command("push")
    .description("Replace a canvas with tldraw JSON (from `canvas pull`)")
    .argument("<file>", 'tldraw snapshot JSON ("-" for stdin)')
    .requiredOption("--id <canvas>", "canvas to update")
    .action(
      action(async (ctx, file: string, opts: { id: string }) => {
        const { id } = parseRef(opts.id, "canvas");
        const document = parseSnapshot((await readContent({ file })) ?? "");
        const row = await ctx.api.patch<Canvas>(`/canvases/${id}`, {
          document,
        });
        emit(item(ctx, "canvas", row), (i) => `Updated ${describeItem(i)}`);
      }),
    );
}
