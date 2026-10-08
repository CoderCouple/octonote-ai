import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import type { BaseResponse } from "./base-response";

function envelope<T>(result: T, overrides: Partial<BaseResponse<T>> = {}): BaseResponse<T> {
  return {
    result,
    statusCode: 200,
    message: "ok",
    success: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("createApiClient", () => {
  it("prefixes paths with the configured baseUrl and unwraps envelopes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope({ id: "usr_1" })));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await client.get<{ id: string }>("/me");
    expect(out).toEqual({ id: "usr_1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/me",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("attaches a bearer token when the source returns one", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope("ok")));
    const client = createApiClient({
      baseUrl: "https://api.test",
      getBearerToken: () => "sup_token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("/me");
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer sup_token");
  });

  it("omits authorization when the source returns null", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope("ok")));
    const client = createApiClient({
      baseUrl: "https://api.test",
      getBearerToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("/health");
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBeNull();
  });

  it("supports async token sources", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope("ok")));
    const client = createApiClient({
      baseUrl: "https://api.test",
      getBearerToken: async () => "async_token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("/me");
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer async_token");
  });

  it("serializes JSON bodies on POST + PATCH", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope({ id: "prj_1" })));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.post("/projects", { name: "Foo" });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(JSON.stringify({ name: "Foo" }));
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("throws a readable error on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { message: "Nope" } as unknown,
        { status: 404 },
      ),
    );
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get("/missing")).rejects.toThrow(/404.*Nope/);
  });

  it("joins baseUrl and path correctly regardless of trailing/leading slashes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope("ok")));
    const client = createApiClient({
      baseUrl: "https://api.test/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("me");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/me",
      expect.any(Object),
    );
  });
});
