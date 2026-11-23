/**
 * Collections: clips of text (from AI chats, the web, anywhere) kept in
 * order, and composed by AI into one cited note. Ids: clc_ collection,
 * clp_ clip.
 */
import type { Command } from "commander";
import type { Ctx } from "../core/context.js";
import { usage } from "../core/errors.js";
import { readContent } from "../core/input.js";
import { emit, info, table } from "../core/output.js";
import { describeItem, type Item } from "../core/resources.js";
import { action } from "../core/run.js";

interface Summary {
  id: string;
  name: string;
  clips: number;
  updatedAt?: string;
}
interface Clip {
  id: string;
  content: string;
  source: { app: string; url?: string; title?: string } | null;
  position: number;
  createdAt: string;
}
interface Detail {
  id: string;
  name: string;
  clips: Clip[];
}
interface Draft {
  title: string;
  mode: string;
  body: string;
  sources: string;
  units: { status: "ok" | "flagged"; text: string; reasons: string[] }[];
  checked: boolean;
}

export const MODES = [
  "summary",
  "report",
  "comparison",
  "study_notes",
  "outline",
  "faq",
  "article",
  "brief",
  "flashcards",
  "custom",
] as const;
const APPS = ["chatgpt", "claude", "gemini", "octonote", "web", "other"];

/** Composing reads every clip and checks every sentence: allow it time. */
const AI_TIMEOUT = 5 * 60_000;

const collectionId = (ref: string) => {
  const id = ref.match(/clc_[0-9a-f-]{36}/)?.[0];
  if (!id)
    throw usage(
      `"${ref}" isn't a collection id.`,
      "Collection ids look like clc_…; `octonote collection list` shows them.",
    );
  return id;
};
const clipId = (ref: string) => {
  const id = ref.match(/clp_[0-9a-f-]{36}/)?.[0];
  if (!id)
    throw usage(
      `"${ref}" isn't a clip id.`,
      "Clip ids look like clp_…; `octonote collection show <id>` lists them.",
    );
  return id;
};

const collectionUrl = (ctx: Ctx, id: string) =>
  `${ctx.config.webUrl}/workspace/collections/${id}`;

const out = <E extends object = object>(ctx: Ctx, c: { id: string; name: string }, extra = {} as E) => ({
  kind: "collection",
  id: c.id,
  title: c.name,
  url: collectionUrl(ctx, c.id),
  ...extra,
});

const oneLine = (text: string, max = 70) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const clipOut = (c: Clip) => ({
  id: c.id,
  content: c.content,
  source: c.source,
  createdAt: c.createdAt,
});

export function registerCollection(program: Command) {
  const collection = program
    .command("collection")
    .description(
      "Collections: clips kept in order, composed by AI into one cited note",
    );

  collection
    .command("list")
    .alias("ls")
    .description("List your collections and how many clips each holds")
    .action(
      action(async (ctx) => {
        const ws = await ctx.workspaceId();
        const rows = await ctx.api.get<Summary[]>(
          `/collections?workspaceId=${encodeURIComponent(ws)}`,
        );
        emit(
          rows.map((r) => out(ctx, r, { clips: r.clips, updatedAt: r.updatedAt })),
          (list) =>
            table(
              list.map((c) => ({
                id: c.id,
                name: c.title,
                clips: String(c.clips),
                updated: (c.updatedAt ?? "").slice(0, 10),
              })),
              ["id", "name", "clips", "updated"],
            ),
        );
      }),
    );

  collection
    .command("show")
    .description("Print a collection's clips, in order")
    .argument("<collection>", "collection id (clc_…) or URL")
    .action(
      action(async (ctx, ref: string) => {
        const c = await ctx.api.get<Detail>(`/collections/${collectionId(ref)}`);
        emit(out(ctx, c, { clips: c.clips.map(clipOut) }), (d) =>
          [
            `collection “${d.title}” ${d.id}`,
            `  ${d.url}`,
            "",
            d.clips.length
              ? table(
                  d.clips.map((clip, i) => ({
                    "#": String(i + 1),
                    id: clip.id,
                    from: clip.source?.title
                      ? oneLine(clip.source.title, 24)
                      : (clip.source?.app ?? ""),
                    text: oneLine(clip.content),
                  })),
                  ["#", "id", "from", "text"],
                )
              : "No clips yet. Add one with `octonote clip add`.",
          ].join("\n"),
        );
      }),
    );

  collection
    .command("create")
    .description("Create a collection")
    .argument("<name>", "its name")
    .action(
      action(async (ctx, name: string) => {
        const ws = await ctx.workspaceId();
        const c = await ctx.api.post<{ id: string; name: string }>("/collections", {
          workspaceId: ws,
          name: name.trim().slice(0, 120),
        });
        emit(out(ctx, c), (d) => `Created collection “${d.title}” ${d.id}\n  ${d.url}`);
      }),
    );

  collection
    .command("rename")
    .description("Rename a collection")
    .argument("<collection>", "collection id (clc_…)")
    .argument("<name>", "new name")
    .action(
      action(async (ctx, ref: string, name: string) => {
        const c = await ctx.api.patch<{ id: string; name: string }>(
          `/collections/${collectionId(ref)}`,
          { name: name.trim().slice(0, 120) },
        );
        emit(out(ctx, c), (d) => `Renamed collection “${d.title}” ${d.id}`);
      }),
    );

  collection
    .command("delete")
    .alias("rm")
    .description("Delete a collection and its clips")
    .argument("<collection>", "collection id (clc_…)")
    .option("-y, --yes", "required: confirms the delete (agents: only when the user asked)")
    .action(
      action(async (ctx, ref: string, opts: { yes?: boolean }) => {
        const id = collectionId(ref);
        if (!opts.yes)
          throw usage(`Deleting collection ${id} needs --yes.`, "Its clips are deleted too.");
        await ctx.api.delete(`/collections/${id}`);
        emit({ kind: "collection", id, deleted: true }, () => `Deleted collection ${id}`);
      }),
    );

  collection
    .command("order")
    .description("Put clips in this order (clips you leave out keep their place after these)")
    .argument("<collection>", "collection id (clc_…)")
    .argument("<clips...>", "clip ids (clp_…), first to last")
    .action(
      action(async (ctx, ref: string, clips: string[]) => {
        const id = collectionId(ref);
        const current = await ctx.api.get<Detail>(`/collections/${id}`);
        const wanted = clips.map(clipId);
        const unknown = wanted.filter((w) => !current.clips.some((c) => c.id === w));
        if (unknown.length)
          throw usage(`Not in this collection: ${unknown.join(", ")}`);
        const ids = [...new Set(wanted), ...current.clips.map((c) => c.id).filter((c) => !wanted.includes(c))];
        const c = await ctx.api.post<Detail>(`/collections/${id}/order`, { ids });
        emit(out(ctx, c, { clips: c.clips.map((clip) => clip.id) }), (d) => `Reordered ${d.clips.length} clips in “${d.title}”`);
      }),
    );

  collection
    .command("compose")
    .description(
      "Write a note from a collection's clips with AI, every sentence cited to its clip (prints the draft; --save keeps it)",
    )
    .argument("<collection>", "collection id (clc_…)")
    .option("-m, --mode <mode>", MODES.join(" | "), "summary")
    .option("-i, --instructions <text>", "what to focus on (required for --mode custom)")
    .option("-t, --title <title>", "the note's title (default: chosen by the AI)")
    .option("--save", "save the draft as a note and print its link")
    .option("-n, --notebook <notebook>", "with --save: put the note in this notebook (id or exact name)")
    .action(
      action(
        async (
          ctx,
          ref: string,
          opts: { mode: string; instructions?: string; title?: string; save?: boolean; notebook?: string },
        ) => {
          const id = collectionId(ref);
          const mode = opts.mode.toLowerCase().replace(/-/g, "_");
          if (!(MODES as readonly string[]).includes(mode))
            throw usage(`Unknown mode "${opts.mode}".`, `Use one of: ${MODES.join(", ")}.`);
          if (mode === "custom" && !opts.instructions?.trim())
            throw usage("--mode custom needs --instructions.");
          info("Composing from the clips… (this can take a minute)");
          const draft = await ctx.api.post<Draft>(
            `/collections/${id}/compose`,
            {
              mode,
              ...(opts.instructions ? { instructions: opts.instructions.slice(0, 2000) } : {}),
              ...(opts.title ? { title: opts.title.slice(0, 120) } : {}),
            },
            { timeoutMs: AI_TIMEOUT },
          );
          const flagged = draft.units.filter((u) => u.status === "flagged");
          const result: Record<string, unknown> = {
            title: draft.title,
            mode: draft.mode,
            markdown: `${draft.body.trim()}\n\n${draft.sources.trim()}\n`,
            checked: draft.checked,
            flagged: flagged.map((u) => ({ text: u.text, reasons: u.reasons })),
          };
          if (opts.save) {
            const note = await ctx.api.post<Item>(`/collections/${id}/save`, {
              title: (opts.title ?? draft.title).slice(0, 120) || "Untitled",
              body: draft.body,
              sources: draft.sources,
              mode: draft.mode,
              ...(opts.notebook ? { notebook: opts.notebook } : {}),
            });
            result.note = note;
          }
          emit(result, (d) =>
            [
              d.note ? "" : String(d.markdown),
              flagged.length
                ? `⚠ ${flagged.length} sentence${flagged.length === 1 ? "" : "s"} not fully supported by the clips:\n${flagged.map((u) => `  - ${oneLine(u.text, 90)}`).join("\n")}`
                : draft.checked
                  ? "✓ Every sentence is supported by the clips."
                  : "",
              d.note ? `Saved ${describeItem(d.note as Item)}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
        },
      ),
    );

  const clip = program
    .command("clip")
    .description("Clips: add, edit or remove the text in a collection");

  const content = (cmd: Command) =>
    cmd
      .option("-t, --text <text>", "the clip's text, inline")
      .option("-f, --file <path>", 'read it from a file ("-" for stdin)')
      .option("--stdin", "read it from stdin")
      .option("--source-url <url>", "where it came from")
      .option("--source-title <title>", "the page or chat it came from")
      .option("--app <app>", `which app: ${APPS.join(" | ")}`);

  type ContentOpts = {
    text?: string;
    file?: string;
    stdin?: boolean;
    sourceUrl?: string;
    sourceTitle?: string;
    app?: string;
  };

  const source = (opts: ContentOpts) => {
    if (!opts.sourceUrl && !opts.sourceTitle && !opts.app) return undefined;
    const app = (opts.app ?? (opts.sourceUrl ? "web" : "other")).toLowerCase();
    if (!APPS.includes(app)) throw usage(`Unknown app "${opts.app}".`, `Use one of: ${APPS.join(", ")}.`);
    return {
      app,
      ...(opts.sourceUrl ? { url: opts.sourceUrl.slice(0, 2000) } : {}),
      ...(opts.sourceTitle ? { title: opts.sourceTitle.slice(0, 200) } : {}),
    };
  };

  content(
    clip
      .command("add")
      .description("Add a clip to the end of a collection")
      .argument("<collection>", "collection id (clc_…)"),
  ).action(
    action(async (ctx, ref: string, opts: ContentOpts) => {
      const text = opts.text ?? (await readContent(opts));
      if (!text?.trim()) throw usage("Nothing to clip.", "Pass --text, --file or --stdin.");
      if (text.length > 20_000) throw usage("A clip can hold up to 20,000 characters.", "Split it into several clips.");
      const id = collectionId(ref);
      const row = await ctx.api.post<Clip>(`/collections/${id}/clips`, {
        content: text,
        ...(source(opts) ? { source: source(opts) } : {}),
      });
      emit({ ...clipOut(row), collectionId: id, url: collectionUrl(ctx, id) }, (d) => `Clipped ${d.id}: ${oneLine(d.content)}`);
    }),
  );

  content(
    clip
      .command("edit")
      .description("Change a clip's text or source")
      .argument("<clip>", "clip id (clp_…)"),
  ).action(
    action(async (ctx, ref: string, opts: ContentOpts) => {
      const text = opts.text ?? (await readContent(opts));
      const src = source(opts);
      if (!text?.trim() && !src)
        throw usage("Nothing to change.", "Pass --text/--file/--stdin or a --source-… option.");
      const row = await ctx.api.patch<Clip>(`/collections/clips/${clipId(ref)}`, {
        ...(text?.trim() ? { content: text } : {}),
        ...(src ? { source: src } : {}),
      });
      emit(clipOut(row), (d) => `Updated ${d.id}: ${oneLine(d.content)}`);
    }),
  );

  clip
    .command("remove")
    .alias("rm")
    .description("Remove a clip from its collection")
    .argument("<clip>", "clip id (clp_…)")
    .action(
      action(async (ctx, ref: string) => {
        const id = clipId(ref);
        await ctx.api.delete(`/collections/clips/${id}`);
        emit({ kind: "clip", id, deleted: true }, () => `Removed clip ${id}`);
      }),
    );
}
