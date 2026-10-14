import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { mainHostFor } from "@/features/admin/portal-url";
import { getMeApi } from "@/features/workspaces/api/workspaces-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Octonote Admin",
  robots: { index: false, follow: false },
};

/**
 * The admin portal (admin.octonote.ai): Octonote staff only. It has its own
 * session, opened from the main site's Admin link; anyone else sees a short
 * note instead of the tools. The API checks admin on every call as well.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  const mainOrigin = `${proto}://${mainHostFor(host)}`;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user ? await getMeApi().catch(() => null) : null;

  if (!me?.user.isAdmin) {
    return (
      <main className="bg-background grid min-h-svh place-items-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <ShieldCheck className="text-muted-foreground size-7" />
          <h1 className="text-foreground-strong text-lg font-semibold">Octonote Admin</h1>
          <p className="text-muted-foreground text-sm">
            {me
              ? "This account isn't an Octonote admin."
              : "Open the portal from Octonote: sign in there, then choose Admin in the sidebar."}
          </p>
          <a
            href={`${mainOrigin}/workspace/admin-open`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
          >
            {me ? "Back to Octonote" : "Sign in through Octonote"}
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="bg-background flex min-h-svh flex-col md:flex-row">
      <AdminNav email={me.user.email} mainOrigin={mainOrigin} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
