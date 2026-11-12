import { describe, expect, it } from "vitest";
import { defaultCatalog } from "../src/index.js";

describe("catalog examples", () => {
  // The examples teach the model and seed the editor's starters, so each must be valid.
  it.each(defaultCatalog.entries.map((e) => [e.kind, e] as const))("%s example validates", (_kind, entry) => {
    const result = entry.validate(entry.example, "example");
    expect(result.ok ? [] : result.issues).toEqual([]);
  });
});
