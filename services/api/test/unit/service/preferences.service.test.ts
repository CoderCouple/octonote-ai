import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesService } from "../../../src/service/preferences.service";

function prefRow(over: Partial<Record<string, unknown>> = {}) {
  const now = new Date();
  return {
    userId: "usr_a",
    notesFontFamily: "inter",
    notesFontSize: "md",
    notesLineHeight: "normal",
    theme: "system",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function buildSut(opts?: { findByUserId?: ReturnType<typeof prefRow> | null }) {
  const prefsRepo = {
    findByUserId: vi
      .fn(async () =>
        opts?.findByUserId !== undefined ? opts.findByUserId : prefRow(),
      ),
    createDefault: vi.fn(async () => prefRow()),
    updateByUserId: vi.fn(async (_u: string, patch: Record<string, unknown>) =>
      prefRow(patch),
    ),
  };
  const service = new PreferencesService(prefsRepo as never);
  return { service, prefsRepo };
}

describe("PreferencesService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getOrCreate returns existing row without creating", async () => {
    const { service, prefsRepo } = buildSut();
    const out = await service.getOrCreate("usr_a");
    expect(out.userId).toBe("usr_a");
    expect(prefsRepo.createDefault).not.toHaveBeenCalled();
  });

  it("getOrCreate seeds when missing", async () => {
    const { service, prefsRepo } = buildSut({ findByUserId: null });
    prefsRepo.findByUserId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(prefRow());
    await service.getOrCreate("usr_a");
    expect(prefsRepo.createDefault).toHaveBeenCalledWith("usr_a");
  });

  it("update propagates only set fields", async () => {
    const { service, prefsRepo } = buildSut();
    await service.update("usr_a", { notesFontFamily: "georgia" });
    const patch = prefsRepo.updateByUserId.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.notesFontFamily).toBe("georgia");
    expect("theme" in patch).toBe(false);
  });
});
