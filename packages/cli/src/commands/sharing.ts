/**
 * Who can open what, and what changed: an item's access (people, link,
 * published), taking someone's access away, what's shared with you, what
 * you edited lately, and the workspace's change history.
 */
import type { Command } from "commander";
import type { Ctx } from "../core/context.js";
import { usage } from "../core/errors.js";
import { emit, table } from "../core/output.js";
import { appUrl, KIND_BY_PREFIX, KIND_NAME, parseRef, type Kind } from "../core/refs.js";
import { action } from "../core/run.js";
import { listAll, ROUTE } from "./items.js";

interface Share {
  id: string;
  role: "viewer" | "editor";
  status: "active" | "pending" | "revoked";
  user: { name: string; email: string } | null;
  pendingEmail: string | null;
}
interface PublishState {
  published: boolean;
  publicUrl: string | null;
  publishedVia: { kind: Kind; id: string; name: string } | null;
}

/** The item's link setting, wherever its response keeps it. */
function linkSetting(row: unknown): string | null {
  const scan = (v: unknown, depth: number): { linkAccess?: string; linkRole?: string } | null => {
    if (!v || typeof v !== "object" || depth > 2) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.linkAccess === "string") return o as { linkAccess: string; linkRole?: string };
    for (const child of Object.values(o)) {
      const found = scan(child, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const s = scan(row, 0);
  if (!s) return null;
  if (s.linkAccess !== "anyone_with_link") return "off";
  return s.linkRole === "editor" ? "edit" : "view";
}

const email = (s: Share) => (s.user?.email ?? s.pendingEmail ?? "").toLowerCase();

/** Titles for ids, from one listing of the workspace. */
async function titles(ctx: Ctx) {
  const all = await listAll(ctx, ["page", "canvas", "project", "notebook"]);
  return new Map(all.map((i) => [i.id, i.title]));
}

const kindOf = (id: string): Kind | undefined => KIND_BY_PREFIX[id.slice(0, 3)];

const ago = (iso: string) => iso.replace("T", " ").slice(0, 16);

export function registerSharing(program: Command) {
  program
    .command("access")
    .description("Who can open an item: the people it's shared with, the link setting, and whether it's published")
    .argument("<id>", "any Octonote id")
    .action(
      action(async (ctx, ref: string) => {
        const { kind, id } = parseRef(ref);
        const [shares, publish, row] = await Promise.all([
          ctx.api.get<Share[]>(`/${kind}/${id}/shares`),
          ctx.api.get<PublishState>(`/${kind}/${id}/publish`),
          ctx.api.get<unknown>(`/${ROUTE[kind]}/${id}`),
        ]);
        const people = shares
          .filter((s) => s.status !== "revoked")
          .map((s) => ({
            shareId: s.id,
            email: email(s),
            name: s.user?.name ?? null,
            role: s.role,
            pending: s.status === "pending",
          }));
        emit(
          {
            kind: KIND_NAME[kind],
            id,
            url: appUrl(ctx.config.webUrl, kind, id),
            link: linkSetting(row),
            published: publish.published,
            publicUrl: publish.publicUrl,
            ...(publish.publishedVia ? { publishedVia: publish.publishedVia } : {}),
            people,
          },
          (d) =>
            [
              `${d.kind} ${d.id}`,
              `  ${d.url}`,
              `Link: ${d.link === "off" ? "only people added below" : d.link ? `anyone with the link can ${d.link}` : "unknown"}`,
              d.published
                ? `Published: ${d.publicUrl}${d.publishedVia ? ` (through ${KIND_NAME[d.publishedVia.kind]} “${d.publishedVia.name}”)` : ""}`
                : "Not published",
              "",
              d.people.length
                ? table(
                    d.people.map((p) => ({
                      email: p.email,
                      name: p.name ?? "",
                      role: p.role,
                      status: p.pending ? "invited" : "",
                    })),
                    ["email", "name", "role", "status"],
                  )
                : "Not shared with anyone.",
            ].join("\n"),
        );
      }),
    );

  program
    .command("unshare")
    .description("Take a person's access to an item away (change a role with `share --email … --role …`)")
    .argument("<id>", "any Octonote id")
    .requiredOption("-e, --email <email>", "the person to remove")
    .action(
      action(async (ctx, ref: string, opts: { email: string }) => {
        const { kind, id } = parseRef(ref);
        const wanted = opts.email.trim().toLowerCase();
        const shares = await ctx.api.get<Share[]>(`/${kind}/${id}/shares`);
        const share = shares.find((s) => s.status !== "revoked" && email(s) === wanted);
        if (!share) throw usage(`${opts.email} doesn't have access to this ${KIND_NAME[kind]}.`, "`octonote access <id>` lists who does.");
        await ctx.api.delete(`/shares/${share.id}`);
        emit({ kind: KIND_NAME[kind], id, removed: wanted }, (d) => `Removed ${d.removed} from ${d.kind} ${d.id}`);
      }),
    );

  program
    .command("shared")
    .description("What other people have shared with you")
    .action(
      action(async (ctx) => {
        const rows = await ctx.api.get<{ kind: Kind; id: string; title: string; role: string; sharedAt: string }[]>("/me/shared");
        emit(
          rows.map((r) => ({
            kind: KIND_NAME[r.kind],
            id: r.id,
            title: r.title,
            role: r.role,
            url: appUrl(ctx.config.webUrl, r.kind, r.id),
            sharedAt: r.sharedAt,
          })),
          (list) =>
            table(
              list.map((r) => ({ kind: r.kind, id: r.id, title: r.title, role: r.role, shared: r.sharedAt.slice(0, 10) })),
              ["kind", "id", "title", "role", "shared"],
            ),
        );
      }),
    );

  program
    .command("recent")
    .description("What you edited lately, most recent first")
    .action(
      action(async (ctx) => {
        const ws = await ctx.workspaceId();
        const [rows, names] = await Promise.all([
          ctx.api.get<{ kind: Kind; id: string; lastEditedAt: string }[]>(`/workspaces/${ws}/recent`),
          titles(ctx),
        ]);
        emit(
          rows
            .filter((r) => names.has(r.id))
            .map((r) => ({
              kind: KIND_NAME[r.kind],
              id: r.id,
              title: names.get(r.id) ?? "",
              url: appUrl(ctx.config.webUrl, r.kind, r.id),
              editedAt: r.lastEditedAt,
            })),
          (list) =>
            table(
              list.map((r) => ({ kind: r.kind, id: r.id, title: r.title, edited: ago(r.editedAt) })),
              ["kind", "id", "title", "edited"],
            ),
        );
      }),
    );

  program
    .command("activity")
    .description("The workspace's change history, newest first (or one item's)")
    .option("-i, --item <id>", "only changes to this item")
    .option("-l, --limit <n>", "how many, up to 200", "50")
    .action(
      action(async (ctx, opts: { item?: string; limit: string }) => {
        const limit = Number(opts.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw usage("--limit must be a whole number from 1 to 200.");
        const ws = await ctx.workspaceId();
        const query = new URLSearchParams({ limit: String(limit) });
        if (opts.item) query.set("entityId", parseRef(opts.item).id);
        const [events, names, me] = await Promise.all([
          ctx.api.get<{ id: string; userId: string | null; entityType: string; entityId: string; action: string; createdAt: string }[]>(
            `/workspaces/${ws}/change-events?${query}`,
          ),
          titles(ctx),
          ctx.me(),
        ]);
        emit(
          events.map((e) => {
            const kind = kindOf(e.entityId);
            return {
              id: e.id,
              action: e.action,
              itemKind: kind ? KIND_NAME[kind] : e.entityType,
              itemId: e.entityId,
              title: names.get(e.entityId) ?? null,
              by: e.userId === me.user.id ? "you" : e.userId,
              at: e.createdAt,
            };
          }),
          (list) =>
            table(
              list.map((e) => ({
                when: ago(e.at),
                action: e.action,
                item: e.title ? `${e.itemKind} “${e.title.length > 30 ? `${e.title.slice(0, 29)}…` : e.title}”` : `${e.itemKind} ${e.itemId}`,
                by: e.by ?? "",
              })),
              ["when", "action", "item", "by"],
            ),
        );
      }),
    );
}
