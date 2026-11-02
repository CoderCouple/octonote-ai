"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OctopusMark } from "@/components/octopus-mark";

/**
 * Signed-in: back to the right workspace list. Signed-out link viewers: home.
 * Hidden inside the mobile app's WebView, where the native header owns back.
 */
export function BackLink({
  href,
  signedIn,
}: {
  href: string;
  signedIn: boolean;
}) {
  const [inApp, setInApp] = useState(false);
  // The mobile app's WebView appends "OctonoteApp" to its user agent.
  useEffect(() => setInApp(navigator.userAgent.includes("OctonoteApp")), []);
  if (inApp) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={signedIn ? "/workspace" : "/"}
        aria-label="Octonote AI home"
        className="text-foreground-strong hover:bg-accent grid size-7 place-items-center rounded-md transition-colors"
      >
        <OctopusMark className="size-5" />
      </Link>
      {signedIn ? (
        <Link
          href={href}
          aria-label="Back"
          className="hover:bg-accent hover:text-foreground-strong text-muted-foreground grid size-8 place-items-center rounded-md transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
      ) : null}
      <span aria-hidden className="bg-border ml-1 h-5 w-px" />
    </div>
  );
}
