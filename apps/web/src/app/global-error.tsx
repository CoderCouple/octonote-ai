"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";
import { Button } from "@/components/ui/button";
import "./globals.css";

// Picks the theme before paint, as next-themes would: the root layout (and its
// ThemeProvider) is what failed, so this page renders its own <html>.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** Last resort: the root layout itself threw. Plain links — no router assumed. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Octonote AI</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ErrorScreen
          code="Oops"
          title="Octonote AI hit a problem"
          message="Something broke while loading the app. Try again, or reload the page in a moment."
          reference={error.digest}
          actions={
            <>
              <Button onClick={reset}>Try again</Button>
              <Button variant="outline" asChild>
                <a href="/">Go home</a>
              </Button>
            </>
          }
        />
      </body>
    </html>
  );
}
