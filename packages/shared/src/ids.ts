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
