/**
 * Single source of truth for how project-child resources (the
 * 1:1 page + canvas attached to every project) derive their titles
 * from the parent project name.
 *
 * Lifecycle contract:
 *   - On project create, child titles default to `<projectName> | <Role>`.
 *   - On project rename, child titles are re-derived only when the
 *     child's current title still matches the OLD expected pattern.
 *     A child the user has hand-edited stays put (sticky opt-out).
 *
 * Separator is `" | "` (space + pipe + space). Pipes essentially
 * never appear in human-typed project names, so the round-trip is
 * unambiguous; the space-padding lifts the divider visually in
 * sidebars and breadcrumbs.
 */

export type ProjectChildRole = "Note" | "Canvas";

const SEPARATOR = " | ";

export function expectedChildTitle(
  projectName: string,
  role: ProjectChildRole,
): string {
  return `${projectName}${SEPARATOR}${role}`;
}

/**
 * Returns true when the child's current title is exactly what we'd
 * have generated for `projectName + role` — i.e. the user has not
 * hand-edited it and the cascade-rename should overwrite.
 */
export function isAutoTitle(
  currentTitle: string | null | undefined,
  projectName: string,
  role: ProjectChildRole,
): boolean {
  if (!currentTitle) return false;
  return currentTitle === expectedChildTitle(projectName, role);
}
