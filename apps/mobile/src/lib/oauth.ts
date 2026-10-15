/**
 * Google / Apple / Microsoft sign-in through Supabase's hosted OAuth pages, in an
 * in-app browser session (works in Expo Go — no native SDKs yet).
 *
 * The client uses the implicit flow (Expo Go has no WebCrypto for PKCE), so the
 * provider round-trip ends at our redirect URL with the session tokens in the
 * URL fragment, which we hand to `setSession`.
 *
 * Redirect URL: `octonote://auth/callback` in builds, `exp://<host>/--/auth/callback`
 * in Expo Go — both must be in Supabase's allowed redirect URLs (supabase/config.toml).
 */
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { env } from "./env";
import { supabase } from "./supabase";

/** Supabase provider ids; Microsoft accounts (personal + work) use "azure". */
export type OAuthProvider = "google" | "apple" | "azure";

/** Entra only returns the email address when asked for the "email" scope. */
const SCOPES: Partial<Record<OAuthProvider, string>> = { azure: "email" };

export type OAuthResult = "signed-in" | "cancelled";

/**
 * Social sign-ins switched on in Supabase (GoTrue's public /settings), so the
 * sign-in screen never shows a button that fails with "provider is not enabled".
 */
export async function getEnabledProviders(): Promise<OAuthProvider[]> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) return [];
    const { external } = (await res.json()) as {
      external?: Record<string, boolean>;
    };
    return (["google", "apple", "azure"] as const).filter(
      (p) => external?.[p] === true,
    );
  } catch {
    return [];
  }
}

export async function signInWithProvider(
  provider: OAuthProvider,
): Promise<OAuthResult> {
  const redirectTo = ExpoLinking.createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: SCOPES[provider],
    },
  });
  if (error || !data.url) throw error ?? new Error("Couldn't start sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return "cancelled";

  const params = readParams(result.url);
  if (params.get("error")) {
    throw new Error(
      params.get("error_description") ?? "Sign-in didn't finish.",
    );
  }
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token)
    throw new Error("Sign-in didn't finish. Try again.");

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) throw sessionError;
  return "signed-in";
}

/** Tokens arrive in the fragment; provider errors may arrive in the query. */
function readParams(url: string): URLSearchParams {
  const [beforeHash, hash = ""] = url.split("#");
  const query = beforeHash.includes("?")
    ? beforeHash.slice(beforeHash.indexOf("?") + 1)
    : "";
  const params = new URLSearchParams(query);
  new URLSearchParams(hash).forEach((v, k) => params.set(k, v));
  return params;
}
