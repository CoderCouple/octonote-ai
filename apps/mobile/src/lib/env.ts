/**
 * EXPO_PUBLIC_* values are inlined into the JS bundle at build time — never
 * put secrets here (the Supabase anon key is public by design). Values come
 * from apps/mobile/.env in development and EAS env in builds.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set — copy apps/mobile/.env.example to .env.`);
  return value;
}

export const env = {
  API_URL: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
  SUPABASE_URL: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  /** Web app origin; the note/canvas editors load from here in a WebView. */
  WEB_URL: required("EXPO_PUBLIC_WEB_URL", process.env.EXPO_PUBLIC_WEB_URL).replace(/\/+$/, ""),
} as const;
