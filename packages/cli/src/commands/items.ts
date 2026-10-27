/**
 * Commands that work on any kind — the id says what it is (pag_ / cnv_ /
 * prj_ / ntb_): list, search, open, move, delete, publish, share.
 */
import type { Command } from "commander";
import { resolveNotebook, type Ctx } from "../core/context.js";
import { usage } from "../core/errors.js";
import { openBrowser } from "../core/login.js";
import { emit, table } from "../core/output.js";
import { appUrl, KIND_NAME, parseRef, type Kind } from "../core/refs.js";
import {
  describeItem,
  item,
  setPublished,
  type Item,
} from "../core/resources.js";
import { action } from "../core/run.js";

interface Row {
  id: string;
  title?: string;
  name?: string;
  notebookId?: string | null;
  updatedAt: string;
  publishedAt?: string | null;
}

const LIST_PATH: Record<Kind, string> = {
  page: "pages",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};
const KIND_ALIASES: Record<string, Kind> = {
  note: "page",
  notes: "page",
  page: "page",
  canvas: "canvas",
  canvases: "canvas",
  project: "project",
  projects: "project",
  notebook: "notebook",
  notebooks: "notebook",
};

async function listAll(
  ctx: Ctx,
  kinds: Kind[],
): Promise<(Item & { published: boolean })[]> {
  const ws = await ctx.workspaceId();
  const lists = await Promise.all(
    kinds.map(async (kind) =>
      (await ctx.api.get<Row[]>(`/workspaces/${ws}/${LIST_PATH[kind]}`)).map(
        (r) => ({
          ...item(ctx, kind, r),
          published: Boolean(r.publishedAt),
        }),
      ),
    ),
  );
  return lists
    .flat()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

const listTable = (items: (Item & { published: boolean })[]) =>
  table(
    items.map((i) => ({
      kind: i.kind,
      id: i.id,
      title: i.title.length > 48 ? `${i.title.slice(0, 47)}…` : i.title,
      updated: (i.updatedAt ?? "").slice(0, 10),
      public: i.published ? "yes" : "",
    })),
    ["kind", "id", "title", "updated", "public"],
  );

const ROUTE: Record<Kind, string> = {
  page: "pages",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};

export function registerItems(program: Command) {
  program
    .command("list")
    .alias("ls")
    .description("List notes, canvases, projects and notebooks (newest first)")
    .option(
      "-k, --kind <kind>",
      "only this kind: note | canvas | project | notebook",
    )
    .option(
      "-n, --notebook <notebook>",
      "only what's inside this notebook (id or exact name)",
    )
    .action(
      action(async (ctx, opts: { kind?: string; notebook?: string }) => {
        const only = opts.kind
          ? KIND_ALIASES[opts.kind.toLowerCase()]
          : undefined;
        if (opts.kind && !only)
          throw usage(
            `Unknown kind "${opts.kind}".`,
            "Use note, canvas, project or notebook.",
          );
        if (opts.notebook) {
          const nb = await resolveNotebook(ctx, opts.notebook);
          const c = await ctx.api.get<{
            notes: Row[];
            canvases: Row[];
            projects: Row[];
          }>(`/notebooks/${nb.id}`);
          const items = [
            ...c.notes.map((r) => ({
              ...item(ctx, "page", r),
              published: Boolean(r.publishedAt),
            })),
            ...c.canvases.map((r) => ({
              ...item(ctx, "canvas", r),
              published: Boolean(r.publishedAt),
            })),
            ...c.projects.map((r) => ({
              ...item(ctx, "project", r),
              published: Boolean(r.publishedAt),
            })),
          ].filter((i) => !only || i.kind === KIND_NAME[only]);
          return emit(items, listTable);
        }
        emit(
          await listAll(
            ctx,
            only ? [only] : ["page", "canvas", "project", "notebook"],
          ),
          listTable,
        );
      }),
    );

  program
    .command("search")
    .description("Find notes, canvases, projects and notebooks by title")
    .argument("<query...>", "words to look for in titles")
    .action(
      action(async (ctx, words: string[]) => {
        const terms = words
          .join(" ")
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        const all = await listAll(ctx, [
          "page",
          "canvas",
          "project",
          "notebook",
        ]);
        emit(
          all.filter((i) =>
            terms.every((t) => i.title.toLowerCase().includes(t)),
          ),
          listTable,
        );
      }),
    );

  program
    .command("open")
    .description(
      "Print the app link for an item (and open it when run in a terminal)",
    )
    .argument("<id>", "any Octonote id or URL")
    .action(
      action(async (ctx, ref: string) => {
        const { kind, id } = parseRef(ref);
        const url = appUrl(ctx.config.webUrl, kind, id);
        if (process.stdout.isTTY) openBrowser(url);
        emit({ kind: KIND_NAME[kind], id, url }, (d) => d.url);
      }),
    );

  program
    .command("move")
    .description(
      "Move a note, canvas or project into a notebook (or out with --out)",
    )
    .argument("<id>", "note, canvas or project id")
    .option("-n, --notebook <notebook>", "target notebook (id or exact name)")
    .option("--out", "take it out of its notebook")
    .action(
      action(
        async (
          ctx,
          ref: string,
          opts: { notebook?: string; out?: boolean },
        ) => {
          const { kind, id } = parseRef(ref);
          if (kind === "notebook")
            throw usage("Notebooks can't go inside notebooks.");
          if (!opts.notebook && !opts.out)
            throw usage("Where to?", "Pass --notebook <name|id> or --out.");
          const notebookId = opts.out
            ? null
            : (await resolveNotebook(ctx, opts.notebook!)).id;
          const row = await ctx.api.post<Row>(`/${ROUTE[kind]}/${id}/move`, {
            notebookId,
          });
          emit(item(ctx, kind, row), (i) => `Moved ${describeItem(i)}`);
        },
      ),
    );

  program
    .command("rename")
    .description("Rename a note, canvas, project or notebook")
    .argument("<id>", "any Octonote id")
    .argument("<name>", "new name")
    .action(
      action(async (ctx, ref: string, name: string) => {
        const { kind, id } = parseRef(ref);
        // Notes and canvases have a title; projects and notebooks a name.
        const field = kind === "page" || kind === "canvas" ? "title" : "name";
        const row = await ctx.api.patch<Row>(`/${ROUTE[kind]}/${id}`, {
          [field]: name.slice(0, 120),
        });
        emit(item(ctx, kind, row), (i) => `Renamed ${describeItem(i)}`);
      }),
    );

  program
    .command("delete")
    .alias("rm")
    .description(
      "Delete a note, canvas, project or notebook (a notebook's contents move to the top level)",
    )
    .argument("<id>", "any Octonote id")
    .option(
      "-y, --yes",
      "required: confirms the delete (agents: only when the user asked)",
    )
    .action(
      action(async (ctx, ref: string, opts: { yes?: boolean }) => {
        const { kind, id } = parseRef(ref);
        if (!opts.yes)
          throw usage(
            `Deleting ${KIND_NAME[kind]} ${id} needs --yes.`,
            "Deleted items can't be restored from the CLI.",
          );
        await ctx.api.delete(`/${ROUTE[kind]}/${id}`);
        emit(
          { kind: KIND_NAME[kind], id, deleted: true },
          () => `Deleted ${KIND_NAME[kind]} ${id}`,
        );
      }),
    );

  for (const [name, published] of [
    ["publish", true],
    ["unpublish", false],
  ] as const) {
    program
      .command(name)
      .description(
        published
          ? "Publish to the web; prints the public URL"
          : "Stop publishing to the web",
      )
      .argument("<id>", "any Octonote id")
      .action(
        action(async (ctx, ref: string) => {
          const { kind, id } = parseRef(ref);
          const state = await setPublished(ctx, kind, id, published);
          emit(
            {
              kind: KIND_NAME[kind],
              id,
              published: state.published,
              publicUrl: state.publicUrl,
            },
            (d) =>
              d.published
                ? `Published: ${d.publicUrl}`
                : `Unpublished ${d.kind} ${d.id}`,
          );
        }),
      );
  }

  program
    .command("share")
    .description("Share with a person by email, or set who can open the link")
    .argument("<id>", "any Octonote id")
    .option(
      "-e, --email <email>",
      "invite this person (they get an email; non-users join on sign-up)",
    )
    .option("-r, --role <role>", "viewer | editor", "viewer")
    .option("--link <access>", "anyone with the link: off | view | edit")
    .action(
      action(
        async (
          ctx,
          ref: string,
          opts: { email?: string; role: string; link?: string },
        ) => {
          const { kind, id } = parseRef(ref);
          const role =
            opts.role === "editor"
              ? "editor"
              : opts.role === "viewer"
                ? "viewer"
                : null;
          if (!role)
            throw usage(
              `Unknown role "${opts.role}".`,
              "Use viewer or editor.",
            );
          if (!opts.email && !opts.link)
            throw usage(
              "Share with whom?",
              "Pass --email <address> and/or --link off|view|edit.",
            );
          const result: Record<string, unknown> = {
            kind: KIND_NAME[kind],
            id,
            url: appUrl(ctx.config.webUrl, kind, id),
          };
          if (opts.link) {
            const map: Record<
              string,
              { linkAccess: string; linkRole: string }
            > = {
              off: { linkAccess: "restricted", linkRole: "viewer" },
              view: { linkAccess: "anyone_with_link", linkRole: "viewer" },
              edit: { linkAccess: "anyone_with_link", linkRole: "editor" },
            };
            const body = map[opts.link];
            if (!body)
              throw usage(
                `Unknown --link "${opts.link}".`,
                "Use off, view or edit.",
              );
            await ctx.api.put(`/${kind}/${id}/general-access`, body);
            result.link = opts.link;
          }
          if (opts.email) {
            const share = await ctx.api.post<{ emailSent?: boolean }>(
              "/shares",
              {
                resourceKind: kind,
                resourceId: id,
                email: opts.email,
                role,
              },
            );
            result.invited = {
              email: opts.email.toLowerCase(),
              role,
              emailSent: share.emailSent ?? false,
            };
          }
          emit(result, (d) =>
            [
              d.link ? `Link access: ${d.link}` : "",
              d.invited
                ? `Invited ${(d.invited as { email: string }).email} as ${role}`
                : "",
              `${d.url}`,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        },
      ),
    );
}
