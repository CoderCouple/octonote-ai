import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeEventsReaderService } from "../../../src/service/change-events-reader.service";

function eventRow() {
  return {
    id: "evt_1",
    workspaceId: "wsp_1",
    actorType: "USER" as const,
    userId: "usr_a",
    agentId: null,
    entityType: "page",
    entityId: "pag_1",
    action: "page.update",
    before: null,
    after: null,
    patch: null,
    createdAt: new Date(),
  };
}

function buildSut(opts?: { findById?: ReturnType<typeof eventRow> | null }) {
  const eventsRepo = {
    findById: vi.fn(async () =>
      opts?.findById !== undefined ? opts.findById : eventRow(),
    ),
    listByWorkspace: vi.fn(async () => [eventRow()]),
  };
  const workspacesService = { requireRole: vi.fn(async () => "MEMBER") };
  const service = new ChangeEventsReaderService(
    eventsRepo as never,
    workspacesService as never,
  );
  return { service, eventsRepo, workspacesService };
}

describe("ChangeEventsReaderService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list gates on membership + forwards filters", async () => {
    const { service, eventsRepo, workspacesService } = buildSut();
    await service.list("wsp_1", { limit: 25, entityType: "page" }, "usr_a");
    expect(workspacesService.requireRole).toHaveBeenCalled();
    expect(eventsRepo.listByWorkspace).toHaveBeenCalledWith("wsp_1", {
      limit: 25,
      entityType: "page",
    });
  });

  it("getOne 404s when missing", async () => {
    const { service } = buildSut({ findById: null });
    await expect(service.getOne("evt_404", "usr_a")).rejects.toThrow(/not found/i);
  });

  it("getOne returns row when found + member", async () => {
    const { service } = buildSut();
    const out = await service.getOne("evt_1", "usr_a");
    expect(out.action).toBe("page.update");
  });
});
