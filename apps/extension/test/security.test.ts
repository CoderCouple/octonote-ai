import { describe, expect, it } from "vitest";
import { appFor, cleanContent, cleanSource, MAX_CLIP_CHARS } from "../src/clean";
import { challengeFor, newVerifier } from "../src/pkce";

describe("connect handshake", () => {
  it("sends only the SHA-256 of a random verifier, as the API checks it", async () => {
    const verifier = newVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newVerifier()).not.toBe(verifier);
    const challenge = await challengeFor(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // base64url(sha256(verifier)), as computed independently (Python hashlib), and as the API checks it.
    expect(await challengeFor("dBjftJeZ4CVP-mJ92K1aiN6oZ9Y8oFqfvHyIxZjVPpw")).toBe(
      "FTLgac_8N971llEPK9aJrTzBHJE5mDnw6xLlURFt5iA",
    );
  });
});

describe("what the clipper sends", () => {
  it("keeps only http(s) links, known apps and short titles", () => {
    expect(cleanSource({ app: "claude", url: "https://claude.ai/chat/1#x", title: "  Batteries  " })).toEqual({
      app: "claude",
      url: "https://claude.ai/chat/1",
      title: "Batteries",
    });
    expect(cleanSource({ app: "evil", url: "javascript:alert(1)", title: 5 })).toEqual({ app: "other" });
    expect(cleanSource({ app: "web", title: "x".repeat(500) }).title).toHaveLength(200);
    expect(cleanSource(null)).toEqual({ app: "other" });
  });

  it("refuses empty or oversized clips with a reason", () => {
    expect(cleanContent("  hi  ")).toEqual({ content: "hi" });
    expect(cleanContent("   ")).toHaveProperty("error");
    expect(cleanContent(42)).toHaveProperty("error");
    expect(cleanContent("x".repeat(MAX_CLIP_CHARS + 1))).toHaveProperty("error");
  });

  it("knows which assistant a page is", () => {
    expect(appFor("https://chatgpt.com/c/1")).toBe("chatgpt");
    expect(appFor("https://gemini.google.com/app")).toBe("gemini");
    expect(appFor("https://example.com")).toBe("web");
    expect(appFor(undefined)).toBe("other");
  });
});
