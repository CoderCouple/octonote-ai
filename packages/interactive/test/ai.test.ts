import { describe, expect, it } from "vitest";
import { defaultRegistry, memoryStore, sessionToolDefinition, webStorageStore } from "../src/index.js";

describe("capability discovery", () => {
  it("lists every built-in activity with a JSON Schema", () => {
    const caps = defaultRegistry.capabilities();
    expect(caps.map((c) => c.type)).toEqual(["flashcards", "mcq", "quiz", "mindmap", "matching"]);
    const flashcards = caps[0]!.jsonSchema as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(flashcards.type).toBe("object");
    expect(flashcards.required).toEqual(expect.arrayContaining(["schemaVersion", "type", "id", "cards"]));
  });
});

describe("the session tool", () => {
  const tool = sessionToolDefinition();

  it("describes every activity type for the model", () => {
    expect(tool.name).toBe("create_study_session");
    for (const type of defaultRegistry.types()) expect(tool.description).toContain(`- ${type}:`);
  });

  it("has a JSON Schema that serialises and names each activity", () => {
    const text = JSON.stringify(tool.inputSchema);
    expect(JSON.parse(text)).toMatchObject({ type: "object", properties: { type: { const: "session" } } });
    for (const type of defaultRegistry.types()) expect(text).toContain(`"const":"${type}"`);
  });
});

describe("progress stores", () => {
  const progress = { activityId: "a", activityType: "quiz", status: "completed" as const, attempts: 1, updatedAt: 1 };

  it("memory store saves, loads and removes", () => {
    const store = memoryStore();
    store.save("k", progress);
    expect(store.load("k")).toEqual(progress);
    store.remove("k");
    expect(store.load("k")).toBeUndefined();
  });

  it("web storage store survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const store = webStorageStore(broken);
    expect(() => store.save("k", progress)).not.toThrow();
    expect(store.load("k")).toBeUndefined();
  });

  it("web storage store prefixes keys", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } as unknown as Storage;
    webStorageStore(storage, "lk:").save("k", progress);
    expect([...data.keys()]).toEqual(["lk:k"]);
    expect(webStorageStore(storage, "lk:").load("k")).toEqual(progress);
  });
});
