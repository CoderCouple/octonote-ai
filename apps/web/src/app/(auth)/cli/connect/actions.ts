"use server";

import { redirect } from "next/navigation";
import { checkCliCallback } from "@/features/cli/callback";
import { serverFetch } from "@/lib/api/server-fetch";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Mint a token for the CLI and hand it to the relay page (in the URL fragment, never sent to a server). */
export async function authorizeCliAction(formData: FormData): Promise<void> {
  // Never trust the form: check the callback again here.
  const check = checkCliCallback(
    String(formData.get("cb") ?? ""),
    String(formData.get("state") ?? ""),
    String(formData.get("name") ?? ""),
  );
  if (!check.ok) redirect("/cli/connect");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const created = await serverFetch<{ plaintext: string }>("/me/cli-tokens", {
    method: "POST",
    body: JSON.stringify({ name: `CLI · ${check.device}` }),
  });

  const fragment = new URLSearchParams({
    cb: check.cb,
    state: check.state,
    token: created.plaintext,
    email: user.email ?? "",
  }).toString();
  redirect(`/cli/connect/relay#${fragment}`);
}
