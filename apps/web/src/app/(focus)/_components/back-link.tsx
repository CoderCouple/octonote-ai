"use client";

import { ArrowLeft, Focus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Signed-in: back to the right workspace list. Signed-out link viewers: home.
 * Hidden inside the mobile app's WebView, where the native header owns back.
 */
export function BackLink({ href, signedIn }: { href: string; signedIn: boolean }) {
  const [inApp, setInApp] = useState(false);
  // The mobile app's WebView appends "OctonoteApp" to its user agent.
  useEffect(() => setInApp(navigator.userAgent.includes("OctonoteApp")), []);
  if (inApp) return null;

  return (
    <div className="-ml-1 flex shrink-0 items-center gap-1">
      <Link
        href={signedIn ? "/workspace" : "/"}
        aria-label="Octonote AI home"
        className="bg-foreground text-background grid size-7 place-items-center rounded-md"
      >
        <Focus className="size-3.5" />
      </Link>
      {signedIn ? (
        <Link
          href={href}
          aria-label="Back"
          className="hover:bg-accent text-muted-foreground grid size-7 place-items-center rounded"
        >
          <ArrowLeft className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
