import "server-only";
import { env } from "@/env/client";

/** Supabase provider ids; Microsoft accounts (personal + work) use "azure". */
export type OAuthProvider = "google" | "apple" | "azure";

const ALL: OAuthProvider[] = ["google", "apple", "azure"];

/**
 * Which social sign-ins are switched on in Supabase (GoTrue's public /settings),
 * so the login page never shows a button that would fail with "provider is not
 * enabled". Cached for 5 minutes; on any error, show none and keep email.
 */
export async function getEnabledProviders(): Promise<OAuthProvider[]> {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return [];
    const { external } = (await res.json()) as {
      external?: Record<string, boolean>;
    };
    return ALL.filter((p) => external?.[p] === true);
  } catch {
    return [];
  }
}
