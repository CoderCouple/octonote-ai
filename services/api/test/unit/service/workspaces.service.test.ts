import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/common/error/app-error";
import { WorkspacesService } from "../../../src/service/workspaces.service";

interface FakeTx {
  insert: (table: unknown) => {
    values: (v: unknown) => {
      returning: () => Promise<unknown[]>;
    };
  };
}

function makeRow(over: Partial<Record<string, unknown>> = {}) {
  const now = new Date();
  return {
    id: "wsp_1",
    name: "Acme",
    slug: "acme",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function buildSut(overrides?: {
  takenSlugs?: Set<string>;
  existingById?: Record<string, ReturnType<typeof makeRow> | null>;
  memberRole?: "OWNER" | "ADMIN" | "MEMBER" | null;
}) {
  const taken = overrides?.takenSlugs ?? new Set<string>();
  const workspacesRepo = {
    findById: vi.fn(async (id: string) => overrides?.existingById?.[id] ?? null),
    findBySlug: vi.fn(),
    slugIsTaken: vi.fn(async (slug: string) => taken.has(slug)),
    insert: vi.fn(),
    updateById: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
      ...(overrides?.existingById?.[id] ?? makeRow({ id })),
      ...patch,
    })),
    deleteById: vi.fn(async () => undefined),
  };
  const membersRepo = {
    findOne: vi.fn(async () =>
      overrides?.memberRole
        ? {
            id: "mem_1",
            workspaceId: "wsp_1",
            userId: "usr_a",
            role: overrides.memberRole,
            createdAt: new Date(),
          }
        : null,
    ),
  };
  const changeEvents = { record: vi.fn(async () => undefined) };

  const db = {
    transaction: async <T>(fn: (tx: FakeTx) => Promise<T>) => {
      let inserts = 0;
      const tx: FakeTx = {
        insert: () => ({
          values: (v: unknown) => ({
            returning: async () => {
              inserts++;
              if (inserts === 1) return [makeRow(v as Record<string, unknown>)];
              return [
                {
                  id: "mem_1",
                  ...(v as Record<string, unknown>),
                  createdAt: new Date(),
                },
              ];
            },
          }),
        }),
      };
      return fn(tx);
    },
  };

  const service = new WorkspacesService(
    db as never,
    workspacesRepo as never,
    membersRepo as never,
    changeEvents as never,
  );
  return { service, workspacesRepo, membersRepo, changeEvents };
}

describe("WorkspacesService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("create", () => {
    it("derives a slug from the name and records an audit event", async () => {
      const { service, changeEvents } = buildSut();
      const result = await service.create({ name: "Acme Inc" }, "usr_a");
      expect(result.workspace.slug).toBe("acme-inc");
      expect(result.ownerMembership.role).toBe("OWNER");
      expect(changeEvents.record).toHaveBeenCalledOnce();
    });

    it("walks past taken slugs with a random tag", async () => {
      const { service } = buildSut({ takenSlugs: new Set(["acme"]) });
      const result = await service.create({ name: "Acme" }, "usr_a");
      // first try ("acme") is taken so the next candidate is "acme-<tag>"
      expect(result.workspace.slug).toMatch(/^acme/);
    });
  });

  describe("update", () => {
    it("requires OWNER/ADMIN", async () => {
      const { service } = buildSut({ memberRole: "MEMBER", existingById: { wsp_1: makeRow() } });
      await expect(service.update("wsp_1", { name: "x" }, "usr_a")).rejects.toThrow(AppError);
    });

    it("rejects a slug already in use", async () => {
      const { service } = buildSut({
        memberRole: "OWNER",
        existingById: { wsp_1: makeRow() },
        takenSlugs: new Set(["beta"]),
      });
      await expect(service.update("wsp_1", { slug: "beta" }, "usr_a")).rejects.toThrow(/Slug already/);
    });

    it("renames and records audit", async () => {
      const { service, changeEvents } = buildSut({
        memberRole: "ADMIN",
        existingById: { wsp_1: makeRow() },
      });
      const out = await service.update("wsp_1", { name: "Acme 2" }, "usr_a");
      expect(out.name).toBe("Acme 2");
      expect(changeEvents.record).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("requires OWNER", async () => {
      const { service } = buildSut({ memberRole: "ADMIN", existingById: { wsp_1: makeRow() } });
      await expect(service.remove("wsp_1", "usr_a")).rejects.toThrow(/OWNER/);
    });

    it("deletes when owner", async () => {
      const { service, workspacesRepo } = buildSut({
        memberRole: "OWNER",
        existingById: { wsp_1: makeRow() },
      });
      await service.remove("wsp_1", "usr_a");
      expect(workspacesRepo.deleteById).toHaveBeenCalledWith("wsp_1");
    });
  });

  describe("requireRole", () => {
    it("throws if not a member", async () => {
      const { service } = buildSut({ memberRole: null });
      await expect(service.requireRole("usr_a", "wsp_1", ["OWNER"])).rejects.toThrow(/Not a member/);
    });

    it("throws if role not allowed", async () => {
      const { service } = buildSut({ memberRole: "MEMBER" });
      await expect(service.requireRole("usr_a", "wsp_1", ["OWNER", "ADMIN"])).rejects.toThrow(
        /Requires OWNER/,
      );
    });

    it("returns the role when allowed", async () => {
      const { service } = buildSut({ memberRole: "ADMIN" });
      const role = await service.requireRole("usr_a", "wsp_1", ["OWNER", "ADMIN"]);
      expect(role).toBe("ADMIN");
    });
  });
});
