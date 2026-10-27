/**
 * An assistant app (Claude.ai, ChatGPT, Gemini CLI…) asked to use Octonote
 * through the MCP server. The API's /oauth/authorize sends people here with
 * a request id. Signed out, you sign in first and come straight back; then
 * you see which app and account, and nothing is granted until you click Allow.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CliScreen } from "@/features/cli/cli-screen";
import { AuthorizeApp } from "@/features/connect/authorize-app";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Connect an app · Octonote AI",
  robots: { index: false, follow: false },
};

export default async function ConnectAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  if (!request || !/^oar_[0-9a-f-]{36}$/.test(request)) {
    return <CliScreen title="Can't connect" body="This link is incomplete. Start again from the app you were connecting." />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/connect/authorize?request=${request}`)}`);
  }

  return <AuthorizeApp requestId={request} email={user.email ?? ""} />;
}
