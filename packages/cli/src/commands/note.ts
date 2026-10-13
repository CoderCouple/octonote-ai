import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { usage } from "../core/errors.js";
import { parseFrontMatter, withFrontMatter } from "../core/frontmatter.js";
import { readContent } from "../core/input.js";
import { emit } from "../core/output.js";
import { parseRef } from "../core/refs.js";
import { describeItem, item, setPublished } from "../core/resources.js";
import { action } from "../core/run.js";

interface Page {
  id: string;
  title: string;
  notebookId: string | null;
  updatedAt: string;
}

const contentOptions = (cmd: Command) =>
  cmd
    .option("-f, --file <path>", "markdown file (\"-\" for stdin)")
    .option("--stdin", "read markdown from stdin");

export function registerNote(program: Command) {
  const note = program.command("note").description("Notes: create, read and edit them as markdown");

  contentOptions(
    note
      .command("create")
      .description("Create a note, optionally filled from markdown")
      .argument("[title]", "title (defaults to the file's front matter / first heading)"),
  )
    .option("-n, --notebook <notebook>", "put it in a notebook (id or exact name)")
    .option("--publish", "publish it to the web and print the public URL")
    .action(
      action(async (ctx, titleArg: string | undefined, opts: { file?: string; stdin?: boolean; notebook?: string; publish?: boolean }) => {
        const raw = await readContent(opts);
        const { data, body } = parseFrontMatter(raw ?? "");
        const title = (titleArg ?? data.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? "Untitled").trim().slice(0, 120);
        const notebookId = opts.notebook ? (await resolveNotebook(ctx, opts.notebook)).id : undefined;
        const ws = await ctx.workspaceId();
        const page = await ctx.api.post<Page>(`/workspaces/${ws}/pages`, {
          title,
          ...(notebookId ? { notebookId } : {}),
          ...(body.trim() ? { markdown: body } : {}),
        });
        const out = item(ctx, "page", page);
        if (opts.publish) out.publicUrl = (await setPublished(ctx, "page", page.id, true)).publicUrl;
        emit(out, describeItem);
      }),
    );

  note
    .command("show")
    .alias("read")
    .description("Print a note as markdown")
    .argument("<note>", "note id (pag_…) or URL")
    .action(
      action(async (ctx, ref: string) => {
        const { id } = parseRef(ref, "page");
        const md = await ctx.api.get<{ id: string; title: string; markdown: string; updatedAt: string }>(`/pages/${id}/markdown`);
        emit({ ...item(ctx, "page", md), markdown: md.markdown }, (d) => d.markdown);
      }),
    );

  note
    .command("pull")
    .description("Save a note to a markdown file (with front matter, so `note push` knows which note it is)")
    .argument("<note>", "note id (pag_…) or URL")
    .option("-o, --out <path>", "file to write (default: <id>.md)")
    .action(
      action(async (ctx, ref: string, opts: { out?: string }) => {
        const { id } = parseRef(ref, "page");
        const md = await ctx.api.get<{ id: string; title: string; markdown: string; updatedAt: string }>(`/pages/${id}/markdown`);
        const path = opts.out ?? `${id}.md`;
        await writeFile(path, withFrontMatter({ octonote: md.id, title: md.title, updatedAt: md.updatedAt }, md.markdown));
        emit({ ...item(ctx, "page", md), file: path }, (d) => `Saved ${d.title ? `“${d.title}” ` : ""}to ${d.file}`);
      }),
    );

  note
    .command("push")
    .description("Replace a note's content with a markdown file (uses the file's front matter id, or --id)")
    .argument("<file>", "markdown file (\"-\" for stdin)")
    .option("--id <note>", "note to update (overrides the front matter)")
    .action(
      action(async (ctx, file: string, opts: { id?: string }) => {
        const raw = (await readContent({ file })) ?? "";
        const { data, body } = parseFrontMatter(raw);
        const ref = opts.id ?? data.octonote;
        if (!ref) throw usage("Which note? The file has no `octonote:` front matter.", "Pass --id pag_… or `note pull` the note first.");
        const { id } = parseRef(ref, "page");
        const page = await ctx.api.put<Page>(`/pages/${id}/markdown`, {
          markdown: body,
          ...(data.title ? { title: data.title.slice(0, 120) } : {}),
        });
        emit(item(ctx, "page", page), (i) => `Updated ${describeItem(i)}`);
      }),
    );

  contentOptions(
    note
      .command("append")
      .description("Add markdown to the end of a note")
      .argument("<note>", "note id (pag_…) or URL"),
  )
    .option("-t, --text <markdown>", "markdown given inline")
    .action(
      action(async (ctx, ref: string, opts: { file?: string; stdin?: boolean; text?: string }) => {
        const { id } = parseRef(ref, "page");
        const markdown = opts.text ?? (await readContent(opts));
        if (!markdown?.trim()) throw usage("Nothing to append.", "Pass --text, --file or --stdin.");
        const page = await ctx.api.post<Page>(`/pages/${id}/markdown/append`, { markdown });
        emit(item(ctx, "page", page), (i) => `Appended to ${describeItem(i)}`);
      }),
    );

  note
    .command("rename")
    .description("Rename a note")
    .argument("<note>", "note id (pag_…)")
    .argument("<title>", "new title")
    .action(
      action(async (ctx, ref: string, title: string) => {
        const { id } = parseRef(ref, "page");
        const page = await ctx.api.patch<Page>(`/pages/${id}`, { title: title.slice(0, 120) });
        emit(item(ctx, "page", page), (i) => `Renamed ${describeItem(i)}`);
      }),
    );
}
