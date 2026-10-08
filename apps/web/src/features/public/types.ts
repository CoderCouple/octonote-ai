/** Mirrors the API's PublicService response shapes (content only — no user data). */
export type PublicKind = "page" | "canvas" | "project" | "notebook";

export interface PublicNote {
  kind: "page";
  id: string;
  title: string;
  document: unknown;
  contentMd: string;
  updatedAt: string;
}

export interface PublicCanvas {
  kind: "canvas";
  id: string;
  title: string;
  document: unknown;
  thumbnailUrl: string | null;
  updatedAt: string;
}

export interface PublicProject {
  kind: "project";
  id: string;
  name: string;
  description: string | null;
  defaultView: "notes" | "canvas" | "split" | null;
  note: PublicNote | null;
  canvas: PublicCanvas | null;
  updatedAt: string;
}

export interface PublicNotebook {
  kind: "notebook";
  id: string;
  name: string;
  items: { kind: PublicKind; id: string; title: string; updatedAt: string }[];
  updatedAt: string;
}

export type PublicResource = PublicNote | PublicCanvas | PublicProject | PublicNotebook;

export interface PublicView {
  root: { kind: PublicKind; id: string; title: string; slug: string };
  resource: PublicResource;
}

export function publicTitle(r: PublicResource): string {
  return r.kind === "project" || r.kind === "notebook" ? r.name : r.title;
}
