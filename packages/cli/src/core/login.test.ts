import { afterEach, describe, expect, it, vi } from "vitest";
import * as login from "./login.js";

afterEach(() => vi.restoreAllMocks());

/** Start a login, capture the URL it would open, and talk to its listener. */
async function startLogin() {
  vi.spyOn(login, "openBrowser").mockReturnValue(true);
  let url = "";
  const pending = login.browserLogin({
    webUrl: "https://octonote.ai",
    onUrl: (u) => (url = u),
    timeoutMs: 5000,
  });
  await vi.waitFor(() => expect(url).not.toBe(""));
  const params = new URL(url).searchParams;
  return { pending, cb: params.get("cb")!, state: params.get("state")!, url };
}

const TOKEN = `ont_${"a".repeat(43)}`;
const post = (cb: string, body: unknown, origin = "https://octonote.ai") =>
  fetch(cb, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

describe("browser login listener", () => {
  it("opens /cli/connect with a loopback callback and accepts the right state", async () => {
    const { pending, cb, state, url } = await startLogin();
    expect(url).toMatch(/^https:\/\/octonote\.ai\/cli\/connect\?/);
    expect(cb).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cb$/);
    expect(state.length).toBeGreaterThanOrEqual(16);

    expect((await post(cb, { state: "wrong", token: TOKEN })).status).toBe(400);
    expect((await post(cb, { state, token: "not-a-token" })).status).toBe(400);
    expect(
      (await post(cb, { state, token: TOKEN }, "https://evil.example")).status,
    ).toBe(403);
    const ok = await post(cb, { state, token: TOKEN, email: "a@b.co" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(
      "https://octonote.ai",
    );
    await expect(pending).resolves.toEqual({ token: TOKEN, email: "a@b.co" });
  });
});
