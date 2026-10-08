import type { MembershipSummary } from "../types";

/**
 * Resolve which workspace membership should be considered "active" for the
 * current request. Priority:
 *
 *   1. The membership whose workspace.id matches the cookie value, if any.
 *   2. The first membership in the list (the api orders by joined-at).
 *
 * Returns null when the user has no memberships at all — call sites should
 * treat that as "bootstrap a workspace" / "redirect to onboarding".
 */
export function resolveActiveMembership(
  memberships: MembershipSummary[],
  cookieValue: string | null,
): MembershipSummary | null {
  if (memberships.length === 0) return null;
  if (cookieValue) {
    const matched = memberships.find((m) => m.workspace.id === cookieValue);
    if (matched) return matched;
  }
  return memberships[0] ?? null;
}
