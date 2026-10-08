import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { env } from "./env";

// Sessions live in the Keychain (iOS) / encrypted SharedPreferences (Android).
// SecureStore keys must be short ASCII; Supabase's default keys are not.
function key(k: string) {
  return `sb.${k.replace(/[^A-Za-z0-9._-]/g, "_")}`.slice(0, 80);
}

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (k) => SecureStore.getItemAsync(key(k)),
      setItem: (k, v) => SecureStore.setItemAsync(key(k), v),
      removeItem: (k) => SecureStore.deleteItemAsync(key(k)),
    },
    autoRefreshToken: true,
    persistSession: true,
    // Mobile signs in with the emailed 6-digit code (verifyOtp), so there's no
    // redirect to sniff and no PKCE exchange.
    detectSessionInUrl: false,
    flowType: "implicit",
  },
});
