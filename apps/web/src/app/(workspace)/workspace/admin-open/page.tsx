"use client";

/**
 * Opens the admin portal (admin.octonote.ai) for a signed-in admin. The API
 * checks you're staff and returns a one-time sign-in token; the portal
 * exchanges it for its own session, so you never sign in twice and the two
 * sites never share (and fight over) one session.
 */
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { adminHandoff } from "@/features/admin/api";
import { adminHostFor, safeAdminPath } from "@/features/admin/portal-url";

function OpenAdmin() {
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const to = safeAdminPath(params.get("to"));
    adminHandoff()
      .then(({ tokenHash }) => {
        const { protocol, host } = window.location;
        window.location.replace(
          `${protocol}//${adminHostFor(host)}/admin-enter?to=${encodeURIComponent(to)}#th=${encodeURIComponent(tokenHash)}`,
        );
      })
      .catch(() => setFailed(true));
  }, [params]);

  return (
    <div className="text-muted-foreground flex min-h-[60vh] flex-col items-center justify-center gap-2 text-sm">
      <ShieldCheck className="size-6" />
      {failed ? "Admins only." : "Opening the admin portal…"}
    </div>
  );
}

export default function AdminOpenPage() {
  return (
    <Suspense>
      <OpenAdmin />
    </Suspense>
  );
}
