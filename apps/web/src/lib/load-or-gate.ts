/**
 * Loads a resource for an item route. The API decides access (incl.
 * "anyone with the link"); when it says no, signed-out visitors go to
 * sign-in and come back, signed-in visitors get the no-access page.
 */
import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Loaded<T> = { ok: true; data: T; signedIn: boolean } | { ok: false; signedIn: true };

export async function loadOrGate<T>(load: () => Promise<T>, returnTo: string): Promise<Loaded<T>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  try {
    return { ok: true, data: await load(), signedIn: Boolean(user) };
  } catch {
    if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    return { ok: false, signedIn: true };
  }
}
