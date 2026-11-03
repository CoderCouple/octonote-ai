/**
 * Stripe-style prefixed IDs of the form `<prefix>_<uuid>`, stored as TEXT.
 * User IDs are built from the Supabase Auth subject so they stay in sync.
 */

export const ID_PREFIXES = {
  user: "usr",
  workspace: "wsp",
  workspaceMember: "mem",
  notebook: "ntb",
  project: "prj",
  page: "pag",
  canvas: "cnv",
  canvasSnapshot: "snp",
  resourceShare: "shr",
  changeEvent: "evt",
  userPreference: "prf",
  studentEmailSuffix: "sfx",
  canvasFigure: "fig",
  resourceVote: "vot",
  cliToken: "tok",
  promoCode: "pmc",
  promoRedemption: "pmr",
  billingEvent: "bev",
  proGrant: "pgr",
  adminAudit: "adm",
  partner: "prt",
  partnerCommission: "pcm",
  crmEntry: "crm",
  crmFollowup: "fup",
  oauthClient: "occ",
  oauthRequest: "oar",
  oauthGrant: "ocg",
  oauthToken: "oat",
  supportGrant: "sag",
  supportSession: "sup",
  noteComment: "cmt",
  feedback: "fbk",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

const PREFIX_REGEX = new RegExp(
  `^(${Object.values(ID_PREFIXES).join("|")})_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
);

// globalThis.crypto instead of node:crypto so this module also bundles for web and React Native.
export function generateId<P extends IdPrefix>(prefix: P): `${P}_${string}` {
  return `${prefix}_${globalThis.crypto.randomUUID()}` as `${P}_${string}`;
}

export function buildIdFromUuid<P extends IdPrefix>(prefix: P, uuid: string): `${P}_${string}` {
  return `${prefix}_${uuid}` as `${P}_${string}`;
}

export function isPrefixedId(value: unknown): value is string {
  return typeof value === "string" && PREFIX_REGEX.test(value);
}

export function hasPrefix(value: string, prefix: IdPrefix): boolean {
  return value.startsWith(`${prefix}_`);
}

/** FNV-1a. */
function fnv(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The figure's id in the API and in note embeds. Items already carrying a
 * `fig_` id (converted from older canvases) keep it; others get a stable id
 * derived from canvas + item id, so the same item always maps to the same
 * figure and copies on another canvas never collide.
 */
export function figureApiId(canvasId: string, itemId: string): string {
  if (/^fig_[0-9a-f-]{36}$/.test(itemId)) return itemId;
  const key = `${canvasId}:${itemId}`;
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => fnv(key, seed).toString(16).padStart(8, "0"))
    .join("");
  return `fig_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
