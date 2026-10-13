/**
 * Octonote ids carry their kind (pag_ note, cnv_ canvas, prj_ project,
 * ntb_ notebook), so most commands accept any id and know what it is.
 */
import { usage } from "./errors.js";

export type Kind = "page" | "canvas" | "project" | "notebook";

export const KIND_BY_PREFIX: Record<string, Kind> = {
  pag: "page",
  cnv: "canvas",
  prj: "project",
  ntb: "notebook",
};

/** What people call each kind. */
export const KIND_NAME: Record<Kind, string> = {
  page: "note",
  canvas: "canvas",
  project: "project",
  notebook: "notebook",
};

const APP_PATH: Record<Kind, string> = { page: "n", canvas: "c", project: "p", notebook: "nb" };

const ID_RE = /^(pag|cnv|prj|ntb)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Accepts a bare id or an app / share URL that contains one. */
export function parseRef(input: string, expect?: Kind): { kind: Kind; id: string } {
  const match = input.match(/(pag|cnv|prj|ntb)_[0-9a-f-]{36}/);
  const id = match?.[0];
  if (!id || !ID_RE.test(id)) {
    throw usage(
      `"${input}" isn't an Octonote id.`,
      "Ids look like pag_… (note), cnv_… (canvas), prj_… (project) or ntb_… (notebook). `octonote list` shows them.",
    );
  }
  const kind = KIND_BY_PREFIX[id.slice(0, 3)]!;
  if (expect && kind !== expect) {
    throw usage(`${id} is a ${KIND_NAME[kind]}, not a ${KIND_NAME[expect]}.`);
  }
  return { kind, id };
}

export function appUrl(webUrl: string, kind: Kind, id: string) {
  return `${webUrl}/${APP_PATH[kind]}/${id}`;
}
