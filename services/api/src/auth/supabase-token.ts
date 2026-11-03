import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Who a Supabase access token belongs to, or null. The signature, expiry and
 * issuer are checked here against Supabase's public keys (fetched once, then
 * cached), so a request doesn't wait on a call to Supabase. A session ended
 * elsewhere keeps working until its token expires, at most an hour.
 */
export async function supabaseUserFromToken(supabase: SupabaseClient, token: string): Promise<User | null> {
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims;
  // Only signed-in people have a subject; the anon key is a valid token too.
  if (error || !claims?.sub || claims.role !== "authenticated") return null;
  return {
    id: claims.sub,
    aud: String(claims.aud ?? "authenticated"),
    email: claims.email,
    phone: claims.phone,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: "",
  } as User;
}
