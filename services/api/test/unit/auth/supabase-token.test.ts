/** Login tokens are checked locally now, so this check is the only thing guarding them. */
import { createClient } from "@supabase/supabase-js";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { supabaseUserFromToken } from "../../../src/auth/supabase-token";

const URL_ = "https://project.supabase.test";
const ISS = `${URL_}/auth/v1`;
const pair = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
const real = pair();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const KID = "key-1";

function jwt(claims: Record<string, unknown>, key = real.privateKey, header: Record<string, unknown> = {}) {
  const head = b64({ alg: "ES256", typ: "JWT", kid: KID, ...header });
  const body = b64({ iss: ISS, aud: "authenticated", role: "authenticated", sub: "11111111-1111-1111-1111-111111111111", email: "a@example.com", exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: createPrivateKey(key.export({ type: "pkcs8", format: "pem" })), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

function client() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [{ ...real.publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // Anything else (a fallback to /user) must fail: only the local check may pass a token.
    return new Response(JSON.stringify({ message: "invalid" }), { status: 401, headers: { "content-type": "application/json" } });
  });
  const supabase = createClient(URL_, "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchMock as never },
  });
  return { supabase, fetchMock };
}

describe("supabaseUserFromToken", () => {
  it("accepts a valid token without asking Supabase who it is", async () => {
    const { supabase, fetchMock } = client();
    const user = await supabaseUserFromToken(supabase, jwt({}));
    expect(user).toMatchObject({ id: "11111111-1111-1111-1111-111111111111", email: "a@example.com" });
    await supabaseUserFromToken(supabase, jwt({}));
    const calls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(calls.filter((u) => u.includes("/auth/v1/user"))).toEqual([]);
    expect(calls.filter((u) => u.includes("jwks"))).toHaveLength(1); // keys are cached
  });

  it("refuses a token signed with another key", async () => {
    const { supabase } = client();
    expect(await supabaseUserFromToken(supabase, jwt({}, pair().privateKey))).toBeNull();
  });

  it("refuses a token whose contents were changed", async () => {
    const { supabase } = client();
    const [h, , s] = jwt({}).split(".");
    const forged = b64({ iss: ISS, aud: "authenticated", role: "authenticated", sub: "22222222-2222-2222-2222-222222222222", exp: Math.floor(Date.now() / 1000) + 600 });
    expect(await supabaseUserFromToken(supabase, `${h}.${forged}.${s}`)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const { supabase } = client();
    expect(await supabaseUserFromToken(supabase, jwt({ exp: Math.floor(Date.now() / 1000) - 10 }))).toBeNull();
  });

  it("refuses a token with no signature algorithm to trust", async () => {
    const { supabase } = client();
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "x", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}.`;
    expect(await supabaseUserFromToken(supabase, unsigned)).toBeNull();
  });

  it("refuses the anon key, which is signed but isn't a person", async () => {
    const { supabase } = client();
    expect(await supabaseUserFromToken(supabase, jwt({ role: "anon", sub: undefined }))).toBeNull();
  });
});
