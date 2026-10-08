import type { ResourceKind } from "../../model/sharing.model";

const PATH_PREFIX: Record<ResourceKind, string> = {
  page: "n",
  canvas: "c",
  project: "p",
  notebook: "nb",
};

function appUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** In-app URL. Also the "anyone with the link" URL — there is no separate token. */
export function resourceUrl(kind: ResourceKind, id: string): string {
  return `${appUrl()}/${PATH_PREFIX[kind]}/${id}`;
}

export function publicUrl(slug: string): string {
  return `${appUrl()}/pub/${slug}`;
}
