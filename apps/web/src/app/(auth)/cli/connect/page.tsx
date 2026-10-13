/**
 * `octonote login` lands here. Signed in, you see which account and which
 * computer the CLI token is for, and nothing happens until you click
 * Authorize. Signed out, you sign in first and come straight back.
 */
import { Terminal } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { checkCliCallback } from "@/features/cli/callback";
import { CliScreen } from "@/features/cli/cli-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeCliAction } from "./actions";

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
    <CliScreen
      icon={<Terminal className="size-5" />}
      title="Connect the Octonote CLI?"
      body="The CLI — and agents like Claude Code or Codex that use it — will be able to create, edit, publish and share your notes, canvases, projects and notebooks."
    >
      <dl className="bg-muted/40 w-full rounded-xl border px-4 py-3 text-left text-sm">
        <dt className="text-muted-foreground text-xs">Account</dt>
        <dd className="text-foreground-strong font-medium">{user.email}</dd>
        <dt className="text-muted-foreground mt-3 text-xs">Computer</dt>
        <dd className="text-foreground-strong font-medium">{check.device}</dd>
      </dl>
      <form action={authorizeCliAction} className="flex w-full flex-col gap-2">
        <input type="hidden" name="cb" value={check.cb} />
        <input type="hidden" name="state" value={check.state} />
        <input type="hidden" name="name" value={check.device} />
        <Button type="submit" size="lg" className="w-full">
          Authorize
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">
        Didn&apos;t run <code>octonote login</code>? Close this tab — nothing is
        created. You can revoke CLI access any time in Settings → CLI &amp;
        agents.
      </p>
    </CliScreen>
  );
}
