import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { resolveNotebook } from "../core/context.js";
import { usage } from "../core/errors.js";
import { readContent } from "../core/input.js";
import { emit } from "../core/output.js";
import { parseRef } from "../core/refs.js";
import { describeItem, item, setPublished } from "../core/resources.js";
import { action } from "../core/run.js";
import { dimUrl } from "../core/terminal-markdown.js";

interface Deck {
  id: string;
  title: string;
  notebookId: string | null;
  updatedAt: string;
  document?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = Record<string, any>;
interface Slide {
  layout: string;
  main: Block[];
  side: Block[];
  notes: string;
  hidden?: boolean;
  builds?: unknown[];
  transition?: string;
  canvas?: { canvasId: string; itemId: string | null };
}

const text = (b: Block): string =>
  Array.isArray(b.content) ? b.content.map((c: Block) => c?.text ?? (Array.isArray(c?.content) ? c.content.map((x: Block) => x?.text ?? "").join("") : "")).join("") : "";

/** What a block is, in a word: its interactive kind, or its type. */
const kindOf = (b: Block): string => (b.type === "interactive" ? String(b.props?.kind ?? "block") : b.type === "manimVideo" ? "video" : String(b.type));

/** A deck as an outline agents can read: each slide's layout, title, blocks and notes. */
export function deckOutline(document: unknown) {
  const slides: Slide[] = Array.isArray((document as { slides?: unknown } | null)?.slides) ? (document as { slides: Slide[] }).slides : [];
  const d = (document ?? {}) as { theme?: string; aspect?: string; transition?: string };
  return {
    theme: d.theme ?? "paper",
    aspect: d.aspect ?? "16:9",
    transition: d.transition ?? "fade",
    slides: slides.map((s, i) => {
      const blocks = [...(s.main ?? []), ...(s.side ?? [])];
      const head = blocks.find((b) => b.type === "heading");
      return {
        n: i + 1,
        layout: s.layout,
        title: head ? text(head) : "",
        blocks: blocks.filter((b) => b !== head).map(kindOf),
        ...(s.canvas ? { canvas: s.canvas.canvasId } : {}),
        ...(s.builds?.length ? { clicks: s.builds.length } : {}),
        ...(s.transition ? { transition: s.transition } : {}),
        ...(s.hidden ? { hidden: true } : {}),
        notes: s.notes ?? "",
      };
    }),
  };
}

function renderOutline(title: string, outline: ReturnType<typeof deckOutline>): string {
  const lines = [`${title || "Untitled presentation"} — ${outline.slides.length} slides`];
  for (const s of outline.slides) {
    const extra = [s.layout, ...(s.blocks.length ? [s.blocks.join(", ")] : []), ...(s.clicks ? [`${s.clicks} clicks`] : []), ...(s.hidden ? ["hidden"] : [])];
    lines.push(`${String(s.n).padStart(3)}. ${s.title || "(no title)"}  · ${extra.join(" · ")}`);
    if (s.notes) lines.push(`     notes: ${s.notes.split("\n")[0]!.slice(0, 90)}`);
  }
  return lines.join("\n");
}

/** Deck JSON from `deck pull`: `{ version: 1, slides: [...] }`. The API checks the rest. */
function parseDeckJson(raw: string): unknown {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw usage("That file isn't JSON.", "`deck push` takes presentation JSON from `deck pull`; to write slides as markdown use `deck create --file`.");
  }
  if (!doc || typeof doc !== "object" || (doc as { version?: unknown }).version !== 1 || !Array.isArray((doc as { slides?: unknown }).slides)) {
    throw usage("That JSON isn't an Octonote presentation (it needs `version: 1` and a `slides` list).", "Start from `deck pull <id>`.");
  }
  return doc;
}

const SPLIT = new Set(["heading", "divider"]);

export function registerDeck(program: Command) {
  const deck = program
    .command("deck")
    .alias("presentation")
    .description("Presentations: write slides in markdown, or make them from a note, project or notebook");

  deck
    .command("create")
    .description("Create a presentation from slide markdown (--- between slides, ??? before a slide's notes), or empty")
    .argument("[title]", "title", "Untitled presentation")
    .option("-f, --file <path>", 'slide markdown file ("-" for stdin)')
    .option("--stdin", "read slide markdown from stdin")
    .option("-n, --notebook <notebook>", "put it in a notebook (id or exact name)")
    .option("--publish", "publish it to the web and print the public URL")
    .action(
      action(async (ctx, title: string, opts: { file?: string; stdin?: boolean; notebook?: string; publish?: boolean }) => {
        const markdown = await readContent({ file: opts.file, stdin: opts.stdin });
        if (markdown !== null && !markdown.trim()) throw usage("The slide markdown is empty.");
        const notebookId = opts.notebook ? (await resolveNotebook(ctx, opts.notebook)).id : undefined;
        const ws = await ctx.workspaceId();
        const row = await ctx.api.post<Deck>(`/workspaces/${ws}/decks`, {
          title: title.slice(0, 120),
          ...(notebookId ? { notebookId } : {}),
          ...(markdown ? { markdown } : {}),
        });
        const out = { ...item(ctx, "deck", row), slides: deckOutline(row.document).slides.length };
        if (opts.publish) out.publicUrl = (await setPublished(ctx, "deck", row.id, true)).publicUrl;
        emit(out, describeItem);
      }),
    );

  deck
    .command("from")
    .description("Make a presentation from a note, project or notebook (the original stays as it is)")
    .argument("<source>", "note (pag_…), project (prj_…) or notebook (ntb_…) id or URL")
    .option("--split <at>", "a new slide at each heading (H1/H2) or each divider (---)", "heading")
    .option("--keep-text", "keep paragraphs on the slides (default: they go to the presenter notes)")
    .option("--group-blocks", "keep a section's blocks on one slide (default: each block gets its own)")
    .option("--ai", "let AI design it: short points, the presenter notes, the blocks kept (uses the AI allowance; takes about half a minute)")
    .option("-t, --title <title>", "title (default: the source's)")
    .option("-n, --notebook <notebook>", "put it in a notebook (default: the source's)")
    .option("--publish", "publish it to the web and print the public URL")
    .action(
      action(
        async (
          ctx,
          ref: string,
          opts: { split: string; keepText?: boolean; groupBlocks?: boolean; ai?: boolean; title?: string; notebook?: string; publish?: boolean },
        ) => {
          const { kind, id } = parseRef(ref);
          if (kind !== "page" && kind !== "project" && kind !== "notebook") throw usage(`A presentation is made from a note, project or notebook, not a ${kind === "deck" ? "presentation" : kind}.`);
          if (!SPLIT.has(opts.split)) throw usage(`Unknown --split "${opts.split}".`, "Use heading or divider.");
          const notebookId = opts.notebook ? (await resolveNotebook(ctx, opts.notebook)).id : undefined;
          const ws = await ctx.workspaceId();
          // An AI design takes a while: allow it the time a model needs.
          const row = await ctx.api.post<Deck>(`/workspaces/${ws}/decks/from`, {
            source: { kind, id, split: opts.split },
            textToNotes: !opts.keepText,
            onePerSlide: !opts.groupBlocks,
            ...(opts.ai ? { design: "ai" } : {}),
            ...(opts.title ? { title: opts.title } : {}),
            ...(notebookId ? { notebookId } : {}),
          }, opts.ai ? { timeoutMs: 180_000 } : undefined);
          const out = { ...item(ctx, "deck", row), slides: deckOutline(row.document).slides.length };
          if (opts.publish) out.publicUrl = (await setPublished(ctx, "deck", row.id, true)).publicUrl;
          emit(out, (d) => `${describeItem(d)}\n  ${d.slides} slides`);
        },
      ),
    );

  deck
    .command("show")
    .alias("read")
    .description("Print a presentation as an outline: each slide's layout, title, blocks and notes")
    .argument("<deck>", "presentation id (dck_…) or URL")
    .action(
      action(async (ctx, ref: string) => {
        const { id } = parseRef(ref, "deck");
        const row = await ctx.api.get<Deck>(`/decks/${id}`);
        const outline = deckOutline(row.document);
        emit({ ...item(ctx, "deck", row), ...outline }, (d) => `${renderOutline(d.title, outline)}\n\n${dimUrl(d.url)}`);
      }),
    );

  deck
    .command("pull")
    .description("Save a presentation as JSON ({ version: 1, slides }) to edit and push back")
    .argument("<deck>", "presentation id (dck_…) or URL")
    .option("-o, --out <path>", "file to write (default: <id>.json)")
    .action(
      action(async (ctx, ref: string, opts: { out?: string }) => {
        const { id } = parseRef(ref, "deck");
        const row = await ctx.api.get<Deck>(`/decks/${id}`);
        const path = opts.out ?? `${id}.json`;
        await writeFile(path, `${JSON.stringify(row.document ?? {}, null, 2)}\n`);
        emit({ ...item(ctx, "deck", row), file: path }, (d) => `Saved “${d.title}” to ${d.file}`);
      }),
    );

  deck
    .command("push")
    .description("Replace a presentation with JSON from `deck pull` (checked before it's saved)")
    .argument("<file>", 'presentation JSON ("-" for stdin)')
    .requiredOption("--id <deck>", "presentation to update")
    .action(
      action(async (ctx, file: string, opts: { id: string }) => {
        const { id } = parseRef(opts.id, "deck");
        const document = parseDeckJson((await readContent({ file })) ?? "");
        const row = await ctx.api.patch<Deck>(`/decks/${id}`, { document });
        emit(item(ctx, "deck", row), (i) => `Updated ${describeItem(i)}`);
      }),
    );
}
