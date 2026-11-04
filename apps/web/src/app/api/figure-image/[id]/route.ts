/**
 * A figure's picture, at /f/<id>.png (see next.config). Lives on our own domain
 * so a signed-in person's cookies come with it: the API checks who may see it on
 * every request, and a private figure embedded elsewhere simply doesn't load.
 */
import { env } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverSupportToken } from "@/lib/support-session-server";

export const dynamic = "force-dynamic";

async function bearerToken(): Promise<string | null> {
  const support = await serverSupportToken();
  if (support) return support;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = new Headers();
  const token = await bearerToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const seen = request.headers.get("if-none-match");
  if (seen) headers.set("if-none-match", seen);

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/figures/${encodeURIComponent(id)}/image`, {
    headers,
    cache: "no-store",
  });
  if (res.status !== 200 && res.status !== 304) return new Response("Not found", { status: 404 });

  const out = new Headers({ "cache-control": "private, no-cache", "x-content-type-options": "nosniff" });
  const etag = res.headers.get("etag");
  if (etag) out.set("etag", etag);
  if (res.status === 304) return new Response(null, { status: 304, headers: out });
  out.set("content-type", "image/png");
  return new Response(res.body, { status: 200, headers: out });
}
