/** The one shape every command returns for an item, so agents can chain them. */
import type { Ctx } from "./context.js";
import { appUrl, KIND_NAME, type Kind } from "./refs.js";

export interface Item {
  kind: string;
  id: string;
  title: string;
  url: string;
  publicUrl?: string | null;
  notebookId?: string | null;
  updatedAt?: string;
}

export function item(
  ctx: Ctx,
  kind: Kind,
  row: {
    id: string;
    title?: string;
    name?: string;
    notebookId?: string | null;
    updatedAt?: string;
  },
): Item {
  return {
    kind: KIND_NAME[kind],
    id: row.id,
    title: row.title ?? row.name ?? "",
    url: appUrl(ctx.config.webUrl, kind, row.id),
    ...(row.notebookId !== undefined ? { notebookId: row.notebookId } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

export interface PublishState {
  published: boolean;
  publicUrl: string | null;
}

export async function setPublished(
  ctx: Ctx,
  kind: Kind,
  id: string,
  published: boolean,
) {
  return ctx.api.put<PublishState>(`/${kind}/${id}/publish`, { published });
}

export function describeItem(i: Item): string {
  return [
    `${i.kind} ${i.title ? `“${i.title}” ` : ""}${i.id}`,
    `  ${i.url}`,
    i.publicUrl ? `  public: ${i.publicUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
