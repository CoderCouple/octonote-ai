/**
 * `octonote login` lands here. Signed out, you sign in first and come
 * straight back; signed in, you see which account and computer the token is
 * for, and nothing is created until you click Authorize (AuthorizeCli).
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthorizeCli } from "@/features/cli/authorize-cli";
import { checkCliCallback } from "@/features/cli/callback";
import { CliScreen } from "@/features/cli/cli-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connect the CLI · Octonote AI" };

export default async function CliConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ cb?: string; state?: string; name?: string }>;
}) {
  const params = await searchParams;
  const check = checkCliCallback(params.cb, params.state, params.name);
  if (!check.ok)
    return <CliScreen title="Can't connect the CLI" body={check.reason} />;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const here = `/cli/connect?${new URLSearchParams({
      cb: check.cb,
      state: check.state,
      name: check.device,
    }).toString()}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return (
    <AuthorizeCli
      cb={check.cb}
      state={check.state}
      device={check.device}
      email={user.email ?? ""}
    />
  );
}
