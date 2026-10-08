import { describe, expect, it } from "vitest";
import { resolveActiveMembership } from "./resolve-active-workspace";
import type { MembershipSummary } from "../types";

function mk(workspaceId: string, name = workspaceId): MembershipSummary {
  return {
    membership: {
      id: `mem_${workspaceId}`,
      role: "MEMBER",
      workspaceId,
    },
    workspace: { id: workspaceId, name, slug: workspaceId.toLowerCase() },
  };
}

describe("resolveActiveMembership", () => {
  it("returns null when there are no memberships", () => {
    expect(resolveActiveMembership([], "wsp_1")).toBeNull();
    expect(resolveActiveMembership([], null)).toBeNull();
  });

  it("returns the cookie-matched membership when present", () => {
    const list = [mk("wsp_1"), mk("wsp_2"), mk("wsp_3")];
    const r = resolveActiveMembership(list, "wsp_2");
    expect(r?.workspace.id).toBe("wsp_2");
  });

  it("falls back to the first membership when no cookie is set", () => {
    const list = [mk("wsp_1"), mk("wsp_2")];
    const r = resolveActiveMembership(list, null);
    expect(r?.workspace.id).toBe("wsp_1");
  });

  it("falls back to the first membership when the cookie points to an id not in the list", () => {
    const list = [mk("wsp_1"), mk("wsp_2")];
    const r = resolveActiveMembership(list, "wsp_999");
    expect(r?.workspace.id).toBe("wsp_1");
  });

  it("treats an empty-string cookie value as no cookie", () => {
    const list = [mk("wsp_1"), mk("wsp_2")];
    expect(resolveActiveMembership(list, "")?.workspace.id).toBe("wsp_1");
  });
});
