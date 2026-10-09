import { describe, expect, it } from "vitest";
import { randomSuffix, slugifyTitle, withSuffix } from "../../../src/common/slug";

/** Must match the public route's slug pattern, or published links 404. */
const PUBLIC_SLUG = /^[a-z0-9-]{1,80}$/;

describe("slugs", () => {
  it("random suffixes only use a–z and 0–9", () => {
    for (let i = 0; i < 2000; i++) expect(randomSuffix()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("generated slugs always fit the public URL pattern", () => {
    for (const title of ["Hosted e2e", "Ünïcödé — notes!", "", "a".repeat(200)]) {
      for (let i = 0; i < 200; i++) expect(withSuffix(slugifyTitle(title))).toMatch(PUBLIC_SLUG);
    }
  });
});
