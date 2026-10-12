"use client";

import { Home, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";
import { Button } from "@/components/ui/button";

/** Body of every `error.tsx`: log, then offer a retry and a way out. */
export function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
  fullScreen,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
  fullScreen?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      code="Oops"
      title="Something went wrong"
      message="An unexpected error stopped this page from loading. Give it another try — most hiccups clear up on their own."
      reference={error.digest}
      fullScreen={fullScreen}
      actions={
        <>
          <Button onClick={reset}>
            <RotateCw className="size-4" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href={homeHref}>
              <Home className="size-4" />
              {homeLabel}
            </Link>
          </Button>
        </>
      }
    />
  );
}
