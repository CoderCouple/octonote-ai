/**
 * How the list screens (web + mobile) describe an item's reach and summarise
 * a list. One source so both apps show the same numbers and copy.
 */

/** Who can open an item, most open first. */
export type Access = "public" | "link" | "shared" | "private";

export const ACCESS_LABEL: Record<Access, string> = {
  public: "Published",
  link: "Anyone with link",
  shared: "Shared",
  private: "Private",
};

export interface SharingSummary {
  linkAccess: "restricted" | "anyone_with_link";
  publishedAt: string | null;
  sharedCount?: number;
}

/**
 * Most-open access wins, and publishing is inherited from the notebook at read
 * time (same rule as the API) — so an item in a published notebook is public.
 */
export function accessOf(item: SharingSummary, notebook?: { publishedAt: string | null } | null): Access {
  if (item.publishedAt || notebook?.publishedAt) return "public";
  if (item.linkAccess === "anyone_with_link") return "link";
  if ((item.sharedCount ?? 0) > 0) return "shared";
  return "private";
}

export interface StatTile {
  key: "total" | "shared" | "published" | "updated";
  label: string;
  value: number;
  /** Small corner badge: "+3" or "50%". */
  badge: string;
  up: boolean;
  bold: string;
  hint: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** The four stat cards above a list. `noun` is plural lower-case, e.g. "notes". */
export function libraryStats(
  rows: { access: Access; createdAt: string; updatedAt: string }[],
  noun: string,
  now = Date.now(),
): StatTile[] {
  const total = rows.length;
  const created = rows.filter((r) => now - new Date(r.createdAt).getTime() < WEEK_MS).length;
  const shared = rows.filter((r) => r.access === "shared" || r.access === "link").length;
  const published = rows.filter((r) => r.access === "public").length;
  const updated = rows.filter((r) => now - new Date(r.updatedAt).getTime() < WEEK_MS).length;
  const active = pct(updated, total) >= 30;
  return [
    {
      key: "total",
      label: noun.charAt(0).toUpperCase() + noun.slice(1),
      value: total,
      badge: created > 0 ? `+${created}` : "0",
      up: created > 0,
      bold: created > 0 ? `${created} new this week` : `No new ${noun} this week`,
      hint: "In this workspace",
    },
    {
      key: "shared",
      label: "Shared",
      value: shared,
      badge: `${pct(shared, total)}%`,
      up: shared > 0,
      bold: shared > 0 ? "Working together" : "All private for now",
      hint: "People or anyone with the link",
    },
    {
      key: "published",
      label: "Published",
      value: published,
      badge: `${pct(published, total)}%`,
      up: published > 0,
      bold: published > 0 ? "Live on the web" : "Nothing public yet",
      hint: "Readable by anyone",
    },
    {
      key: "updated",
      label: "Updated 7d",
      value: updated,
      badge: `${pct(updated, total)}%`,
      up: active,
      bold: active ? "Active week" : "Quiet week",
      hint: "Touched in the last 7 days",
    },
  ];
}
