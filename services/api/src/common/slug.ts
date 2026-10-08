/**
 * Slug generation for public URLs.
 *
 * Project/page/canvas all share one workspace-scoped namespace under
 * /p/<workspace-slug>/<slug>, so slugs must be unique across all three tables
 * within a workspace. We generate from the title, then append a short random
 * suffix to collisions instead of incrementing — keeps URLs stable when a
 * sibling resource is renamed and avoids guessable enumeration.
 */
import { randomBytes } from "crypto";

const MAX_SLUG_LEN = 60;
const SUFFIX_LEN = 6;

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LEN) || "untitled"
  );
}

export function randomSuffix(): string {
  return randomBytes(SUFFIX_LEN).toString("base64url").slice(0, SUFFIX_LEN).toLowerCase();
}

export function withSuffix(base: string): string {
  const trimmed = base.length > MAX_SLUG_LEN - SUFFIX_LEN - 1
    ? base.slice(0, MAX_SLUG_LEN - SUFFIX_LEN - 1)
    : base;
  return `${trimmed}-${randomSuffix()}`;
}
