/**
 * Bring your own key: a person's Anthropic key is checked, stored encrypted,
 * never shown again, used for their AI calls instead of the server's, and
 * lifts the shared hourly allowance.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { open, seal } from "../../src/common/secret-box";
import { userAiKeys } from "../../src/db/schemas";
import { AiKeysService } from "../../src/service/ai-keys.service";
import { ComposeAiService } from "../../src/service/compose-ai.service";
import { createHarness, statusOf, type Harness } from "./harness";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ";
const env = { ...process.env };

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let keys: AiKeysService;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  process.env.AI_KEYS_SECRET = SECRET;
  keys = new AiKeysService(h.db);
  // No network in tests: Anthropic's check accepts the key.
  (keys as unknown as { verify: () => Promise<void> }).verify = async () => {};
});

afterEach(() => {
  process.env = { ...env };
});

describe("secret box", () => {
  it("round-trips, and refuses tampering or the wrong secret", () => {
    const sealed = seal(KEY, SECRET);
    expect(sealed).not.toContain("sk-ant");
    expect(open(sealed, SECRET)).toBe(KEY);
    expect(() =>
      open(sealed, "another-secret-that-is-at-least-32-chars"),
    ).toThrow();
    const [v, iv, tag, data] = sealed.split(".");
    expect(() =>
      open([v, iv, tag, `${data!.slice(0, -2)}AA`].join("."), SECRET),
    ).toThrow();
  });
});

describe("own AI keys", () => {
  it("are stored encrypted, shown only by their last four characters, and removable", async () => {
    expect(await keys.status(alice.id)).toMatchObject({
      available: true,
      provider: null,
      last4: null,
    });
    expect(await keys.set(alice.id, KEY)).toMatchObject({
      provider: "anthropic",
      last4: "WXYZ",
    });
    const [row] = await h.db.select().from(userAiKeys);
    expect(row!.ciphertext).not.toContain("sk-ant");
    expect(JSON.stringify(await keys.status(alice.id))).not.toContain("sk-ant");
    expect(await keys.keyFor(alice.id)).toBe(KEY);
    await keys.remove(alice.id);
    expect(await keys.keyFor(alice.id)).toBeNull();
  });

  it("refuse things that aren't Anthropic keys, and need the server secret", async () => {
    expect(
      await statusOf(keys.set(alice.id, "sk-openai-123456789012345678901234")),
    ).toBe(422);
    delete process.env.AI_KEYS_SECRET;
    expect(await statusOf(keys.set(alice.id, KEY))).toBe(503);
    expect((await keys.status(alice.id)).available).toBe(false);
  });

  it("can't be read with a different server secret (they fall back to the server's key)", async () => {
    await keys.set(alice.id, KEY);
    process.env.AI_KEYS_SECRET =
      "a-different-secret-that-is-also-32-characters";
    expect(await new AiKeysService(h.db).keyFor(alice.id)).toBeNull();
  });

  it("are used for the person's AI calls, without the hourly allowance", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-server-key";
    const ai = new ComposeAiService(keys);
    expect(
      ((await ai.anthropic(alice.id)).client as unknown as { apiKey: string })
        .apiKey,
    ).toBe("sk-ant-server-key");
    // The server's key counts against 30 calls an hour.
    for (let i = 0; i < 30; i++) await ai.useAiCall(alice.id);
    expect(await statusOf(ai.useAiCall(alice.id))).toBe(429);

    await keys.set(alice.id, KEY);
    expect(
      ((await ai.anthropic(alice.id)).client as unknown as { apiKey: string })
        .apiKey,
    ).toBe(KEY);
    await expect(ai.useAiCall(alice.id)).resolves.toBeUndefined();
  });

  it("let people use AI on a server without its own key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const ai = new ComposeAiService(keys);
    expect(await statusOf(ai.anthropic(alice.id))).toBe(503);
    await keys.set(alice.id, KEY);
    expect(
      ((await ai.anthropic(alice.id)).client as unknown as { apiKey: string })
        .apiKey,
    ).toBe(KEY);
  });
});
