import { describe, expect, it } from "vitest";
import { cleanSignupRef, shouldReplaceRef } from "./signup-ref";

describe("sign-up source", () => {
  it("keeps a creator's code (and the page) in a safe shape", () => {
    expect(cleanSignupRef("Priya")).toBe("priya");
    expect(cleanSignupRef("priya", "debouncing-and-throttling-s49bby")).toBe("priya:debouncing-and-throttling-s49bby");
    expect(cleanSignupRef("<script>")).toBe("script");
    expect(cleanSignupRef("")).toBeNull();
  });

  it("never lets a later click replace the creator who sent the visitor", () => {
    expect(shouldReplaceRef(null)).toBe(true);
    expect(shouldReplaceRef("pub-header")).toBe(true);
    expect(shouldReplaceRef("pub:some-page")).toBe(true);
    expect(shouldReplaceRef("priya")).toBe(false);
    expect(shouldReplaceRef("priya:some-page")).toBe(false);
  });
});
