/**
 * Making things with Octonote's AI: a whole note from a request
 * (`generate`), one interactive block from a source (`studio`: mind maps,
 * flashcards, quizzes…), and explainer videos (`video`). Uses the
 * workspace's AI allowance, or the user's own key if they added one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import { resolveNotebook, type Ctx } from "../core/context.js";
import { usage } from "../core/errors.js";
import { readContent } from "../core/input.js";
import { emit, info, table } from "../core/output.js";
import { parseRef } from "../core/refs.js";
import { describeItem, item, type Item } from "../core/resources.js";
import { action } from "../core/run.js";
import { waitFor } from "../core/wait.js";

const AI_TIMEOUT = 5 * 60_000;

// --- generate ---------------------------------------------------------------------------------

interface Composed {
  markdown: string;
  strategy: string;
  kinds: string[];
}

// --- studio -----------------------------------------------------------------------------------

const STUDIO_KINDS = ["mindmap", "flashcards", "quiz", "mcq", "matching", "infographic", "text"] as const;
const PDF_LIMIT = 7 * 1024 * 1024;

interface StudioItem {
  id: string;
  title: string;
  kind: string;
  status: "running" | "succeeded" | "failed";
  sourceType: string;
  sourceLabel: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  spec?: Record<string, unknown> | null;
  error?: string | null;
}

const studioId = (ref: string) => {
  const id = ref.match(/stu_[0-9a-f-]{36}/)?.[0];
  if (!id)
    throw usage(`"${ref}" isn't a Studio item id.`, "Studio ids look like stu_…; `octonote studio list` shows them.");
  return id;
};

const studioOut = (ctx: Ctx, s: StudioItem) => ({
  kind: "studio",
  id: s.id,
  title: s.title,
  type: s.kind,
  status: s.status,
  source: s.sourceLabel,
  url: `${ctx.config.webUrl}/workspace/studio/${s.id}`,
  publicUrl: s.published ? `${ctx.config.webUrl}/s/${s.id}` : null,
  ...(s.error ? { error: s.error } : {}),
  ...(s.spec !== undefined ? { spec: s.spec } : {}),
  updatedAt: s.updatedAt,
});
type StudioOut = ReturnType<typeof studioOut>;

const describeStudio = (s: StudioOut) =>
  [
    `studio ${s.type} “${s.title}” ${s.id} (${s.status})`,
    `  ${s.url}`,
    s.publicUrl ? `  public: ${s.publicUrl}` : "",
    s.error ? `  ✗ ${s.error}` : "",
  ]
    .filter(Boolean)
    .join("\n");

const waitForStudio = (ctx: Ctx, id: string) =>
  waitFor(() => ctx.api.get<StudioItem>(`/studio/${id}`), {
    done: (s) => s.status !== "running",
    progress: () => "Making it…",
    checkWith: `octonote studio show ${id}`,
  });

// --- video ------------------------------------------------------------------------------------

interface Video {
  id: string;
  status: "queued" | "storyboard" | "code" | "render" | "join" | "done" | "failed";
  orientation: string;
  title: string | null;
  progress: { done?: number; total?: number } | null;
  url: string | null;
  posterUrl: string | null;
  duration: number | null;
  error: string | null;
}

const STAGE: Record<Video["status"], string> = {
  queued: "Waiting to start",
  storyboard: "Writing the storyboard",
  code: "Animating the scenes",
  render: "Rendering",
  join: "Putting it together",
  done: "Done",
  failed: "Failed",
};

const videoId = (ref: string) => {
  const id = ref.match(/vid_[0-9a-f-]{36}/)?.[0];
  if (!id) throw usage(`"${ref}" isn't a video id.`, "Video ids look like vid_….");
  return id;
};

const videoProgress = (v: Video) =>
  `${STAGE[v.status]}${v.progress?.total ? ` (${v.progress.done ?? 0}/${v.progress.total})` : ""}…`;

const describeVideo = (v: Video & { note?: Item }) =>
  [
    `video ${v.title ? `“${v.title}” ` : ""}${v.id} (${STAGE[v.status].toLowerCase()})`,
    v.url ? `  ${v.url}` : "",
    v.duration ? `  ${Math.round(v.duration)}s` : "",
    v.error ? `  ✗ ${v.error}` : "",
    v.note ? `Added to ${describeItem(v.note)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export function registerAi(program: Command) {
  program
    .command("generate")
    .description(
      "Write a whole note with AI from a request (text, diagrams and interactive blocks); saves it as a note",
    )
    .argument("<request...>", 'what the note should be, e.g. "explain backpropagation with a quiz"')
    .option("-t, --title <title>", "the note's title (default: its first heading)")
    .option("-n, --notebook <notebook>", "put it in a notebook (id or exact name)")
    .option("-o, --out <path>", "write the markdown to a file instead of making a note")
    .action(
      action(
        async (ctx, words: string[], opts: { title?: string; notebook?: string; out?: string }) => {
          const request = words.join(" ").trim();
          if (!request) throw usage("What should the note be about?");
          if (request.length > 2000) throw usage("Keep the request under 2,000 characters.");
          info("Writing the note… (this can take a minute)");
          const made = await ctx.api.post<Composed>("/ai/compose", { request }, { timeoutMs: AI_TIMEOUT });
          if (opts.out) {
            await writeFile(opts.out, made.markdown);
            emit({ file: opts.out, blocks: made.kinds }, (d) => `Wrote ${d.file}`);
            return;
          }
          const heading = made.markdown.match(/^#\s+(.+)$/m)?.[1];
          const title = (opts.title ?? heading ?? request).trim().slice(0, 120);
          // The title is the note's own; don't repeat it as the first line.
          const markdown = heading && !opts.title ? made.markdown.replace(/^#\s+.+\n+/m, "") : made.markdown;
          const notebookId = opts.notebook ? (await resolveNotebook(ctx, opts.notebook)).id : undefined;
          const ws = await ctx.workspaceId();
          const page = await ctx.api.post<{ id: string; title: string; notebookId: string | null; updatedAt: string }>(
            `/workspaces/${ws}/pages`,
            { title, markdown, ...(notebookId ? { notebookId } : {}) },
          );
          emit({ ...item(ctx, "page", page), blocks: made.kinds }, describeItem);
        },
      ),
    );

  // --- studio ---

  const studio = program
    .command("studio")
    .description("Studio: turn text, a web page, a note or a PDF into a mind map, flashcards, a quiz…");

  studio
    .command("create")
    .description("Make a Studio item from one source (it's made in the background; --wait waits for it)")
    .requiredOption("-k, --kind <kind>", STUDIO_KINDS.join(" | "))
    .option("--text <text>", "the source text, inline")
    .option("-f, --file <path>", 'source text from a file ("-" for stdin)')
    .option("--stdin", "source text from stdin")
    .option("--url <url>", "a web page")
    .option("--from <id>", "a note, canvas or project (pag_… / cnv_… / prj_…)")
    .option("--pdf <path>", "a PDF, up to 7 MB")
    .option("-t, --title <title>", "its title (default: chosen by the AI)")
    .option("--wait", "wait until it's made, then print it")
    .action(
      action(
        async (
          ctx,
          opts: {
            kind: string;
            text?: string;
            file?: string;
            stdin?: boolean;
            url?: string;
            from?: string;
            pdf?: string;
            title?: string;
            wait?: boolean;
          },
        ) => {
          const kind = opts.kind.toLowerCase();
          if (!(STUDIO_KINDS as readonly string[]).includes(kind))
            throw usage(`Unknown kind "${opts.kind}".`, `Use one of: ${STUDIO_KINDS.join(", ")}.`);
          const given = [opts.text !== undefined, Boolean(opts.file || opts.stdin), Boolean(opts.url), Boolean(opts.from), Boolean(opts.pdf)].filter(Boolean).length;
          if (given !== 1)
            throw usage("Give exactly one source.", "Use --text, --file/--stdin, --url, --from or --pdf.");
          let source: Record<string, string>;
          if (opts.url) source = { type: "url", url: opts.url };
          else if (opts.from) source = { type: "item", id: parseRef(opts.from).id };
          else if (opts.pdf) {
            let data: Buffer;
            try {
              data = await readFile(opts.pdf);
            } catch {
              throw usage(`Can't read ${opts.pdf}.`);
            }
            if (data.length > PDF_LIMIT) throw usage("The PDF is over 7 MB.");
            source = { type: "pdf", name: basename(opts.pdf).slice(0, 200), data: data.toString("base64") };
          } else {
            const text = opts.text ?? (await readContent(opts));
            if (!text?.trim()) throw usage("The source text is empty.");
            source = { type: "text", text };
          }
          const ws = await ctx.workspaceId();
          let made = await ctx.api.post<StudioItem>(
            "/studio",
            { workspaceId: ws, kind, source, ...(opts.title ? { title: opts.title.slice(0, 120) } : {}) },
            { timeoutMs: AI_TIMEOUT },
          );
          if (opts.wait && made.status === "running") made = await waitForStudio(ctx, made.id);
          emit(studioOut(ctx, made), describeStudio);
        },
      ),
    );

  studio
    .command("list")
    .alias("ls")
    .description("List your Studio items (newest first)")
    .action(
      action(async (ctx) => {
        const ws = await ctx.workspaceId();
        const { items } = await ctx.api.get<{ items: StudioItem[] }>(`/studio?workspaceId=${encodeURIComponent(ws)}`);
        emit(
          items.map((r) => studioOut(ctx, r)),
          (list) =>
            table(
              list.map((s) => ({
                id: s.id,
                type: s.type,
                title: s.title.length > 40 ? `${s.title.slice(0, 39)}…` : s.title,
                status: s.status,
                public: s.publicUrl ? "yes" : "",
              })),
              ["id", "type", "title", "status", "public"],
            ),
        );
      }),
    );

  studio
    .command("show")
    .description("Print a Studio item, with its block JSON once it's made")
    .argument("<item>", "Studio id (stu_…) or URL")
    .option("--wait", "wait until it's made")
    .action(
      action(async (ctx, ref: string, opts: { wait?: boolean }) => {
        const id = studioId(ref);
        const s = opts.wait ? await waitForStudio(ctx, id) : await ctx.api.get<StudioItem>(`/studio/${id}`);
        emit(studioOut(ctx, s), (d) =>
          [describeStudio(d), d.spec ? `\n${JSON.stringify(d.spec, null, 2)}` : ""].join(""),
        );
      }),
    );

  studio
    .command("rename")
    .description("Rename a Studio item")
    .argument("<item>", "Studio id (stu_…)")
    .argument("<title>", "new title")
    .action(
      action(async (ctx, ref: string, title: string) => {
        const s = await ctx.api.patch<StudioItem>(`/studio/${studioId(ref)}`, { title: title.trim().slice(0, 120) });
        emit(studioOut(ctx, s), (d) => `Renamed ${describeStudio(d)}`);
      }),
    );

  studio
    .command("retry")
    .description("Try again to make a Studio item that failed")
    .argument("<item>", "Studio id (stu_…)")
    .option("--wait", "wait until it's made")
    .action(
      action(async (ctx, ref: string, opts: { wait?: boolean }) => {
        const id = studioId(ref);
        let s = await ctx.api.post<StudioItem>(`/studio/${id}/retry`, {}, { timeoutMs: AI_TIMEOUT });
        if (opts.wait && s.status === "running") s = await waitForStudio(ctx, id);
        emit(studioOut(ctx, s), describeStudio);
      }),
    );

  studio
    .command("add-to-note")
    .description("Put a Studio item into a note: appended to --note, or as a new note")
    .argument("<item>", "Studio id (stu_…)")
    .option("--note <note>", "the note to add it to (pag_…); default: a new note")
    .action(
      action(async (ctx, ref: string, opts: { note?: string }) => {
        const noteId = opts.note ? parseRef(opts.note, "page").id : undefined;
        const note = await ctx.api.post<Item>(
          `/studio/${studioId(ref)}/note`,
          noteId ? { noteId } : { workspaceId: await ctx.workspaceId() },
        );
        emit(note, (i) => `Added to ${describeItem(i)}`);
      }),
    );

  for (const [name, published] of [
    ["publish", true],
    ["unpublish", false],
  ] as const) {
    studio
      .command(name)
      .description(published ? "Let anyone with the link open a Studio item; prints the link" : "Make a Studio item private again")
      .argument("<item>", "Studio id (stu_…)")
      .action(
        action(async (ctx, ref: string) => {
          const path = `/studio/${studioId(ref)}/publish`;
          const s = await (published ? ctx.api.put<StudioItem>(path, {}) : ctx.api.delete<StudioItem>(path));
          emit(studioOut(ctx, s), (d) => (d.publicUrl ? `Published: ${d.publicUrl}` : `Unpublished ${d.id}`));
        }),
      );
  }

  studio
    .command("delete")
    .alias("rm")
    .description("Delete a Studio item")
    .argument("<item>", "Studio id (stu_…)")
    .option("-y, --yes", "required: confirms the delete (agents: only when the user asked)")
    .action(
      action(async (ctx, ref: string, opts: { yes?: boolean }) => {
        const id = studioId(ref);
        if (!opts.yes) throw usage(`Deleting Studio item ${id} needs --yes.`);
        await ctx.api.delete(`/studio/${id}`);
        emit({ kind: "studio", id, deleted: true }, () => `Deleted Studio item ${id}`);
      }),
    );

  // --- video ---

  const video = program.command("video").description("Explainer videos: animated with Manim, made in the background");

  video
    .command("create")
    .description("Make an explainer video of a concept (takes a few minutes; --wait waits for it)")
    .argument("<concept...>", 'what to explain, e.g. "how attention works in transformers"')
    .option("--portrait", "9:16 for phones (default: 16:9)")
    .option("--note <note>", "also add the video to this note (pag_…); it shows progress until it's ready")
    .option("--wait", "wait until it's made, then print its link")
    .action(
      action(async (ctx, words: string[], opts: { portrait?: boolean; note?: string; wait?: boolean }) => {
        const concept = words.join(" ").trim();
        if (concept.length < 3 || concept.length > 1000) throw usage("Describe the concept in 3 to 1,000 characters.");
        const noteId = opts.note ? parseRef(opts.note, "page").id : undefined;
        let v = await ctx.api.post<Video>("/ai/videos", {
          workspaceId: await ctx.workspaceId(),
          concept,
          orientation: opts.portrait ? "portrait" : "landscape",
        });
        let note: Item | undefined;
        if (noteId) {
          const page = await ctx.api.post<{ id: string; title: string; notebookId: string | null; updatedAt: string }>(
            `/pages/${noteId}/markdown/append`,
            { markdown: `\`\`\`video\n${JSON.stringify({ videoId: v.id })}\n\`\`\`\n` },
          );
          note = item(ctx, "page", page);
        }
        if (opts.wait)
          v = await waitFor(() => ctx.api.get<Video>(`/videos/${v.id}`), {
            done: (x) => x.status === "done" || x.status === "failed",
            progress: videoProgress,
            checkWith: `octonote video show ${v.id}`,
            intervalMs: 5000,
            timeoutMs: 20 * 60_000,
          });
        emit({ ...v, ...(note ? { note } : {}) }, describeVideo);
      }),
    );

  video
    .command("show")
    .description("A video's progress and, once made, its link and chapters")
    .argument("<video>", "video id (vid_…)")
    .option("--wait", "wait until it's made")
    .action(
      action(async (ctx, ref: string, opts: { wait?: boolean }) => {
        const id = videoId(ref);
        const v = opts.wait
          ? await waitFor(() => ctx.api.get<Video>(`/videos/${id}`), {
              done: (x) => x.status === "done" || x.status === "failed",
              progress: videoProgress,
              checkWith: `octonote video show ${id}`,
              intervalMs: 5000,
              timeoutMs: 20 * 60_000,
            })
          : await ctx.api.get<Video>(`/videos/${id}`);
        emit(v, describeVideo);
      }),
    );
}
