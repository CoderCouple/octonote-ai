import "server-only";
import { buildIdFromUuid } from "@octonote/shared";
import { env } from "@/env/client";
import { serverFetch } from "@/lib/api/server-fetch";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppAnalytics } from "./analytics-components";

/**
 * Turns on product analytics for the signed-in app, as the same person id the
 * API uses (usr_…), unless they've turned off "Help improve Octonote".
 * Renders nothing when PostHog isn't set up or nobody is signed in (people
 * opening a shared link signed-out are readers, not tracked). Staff are
 * never tracked, and their browser stops being tracked on the site too.
 */
export async function AppAnalyticsGate() {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [allowed, staff] = await Promise.all([
    serverFetch<{ analytics?: boolean }>("/me/preferences")
      .then((p) => p.analytics !== false)
      .catch(() => false),
    serverFetch<{ user: { isAdmin?: boolean } }>("/me")
      .then((me) => Boolean(me.user.isAdmin))
      .catch(() => false),
  ]);
  return <AppAnalytics userId={buildIdFromUuid("usr", user.id)} allowed={allowed} staff={staff} />;
}
