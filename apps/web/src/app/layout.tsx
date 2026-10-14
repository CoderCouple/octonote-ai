import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { UpgradeDialog } from "@/features/billing";
import { READER_FONT_VARIABLES } from "@/features/notes/typography/fonts";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";
// Hoist tldraw's CSS to the root so dynamic-imported canvas chunks don't have
// to ship their own (and risk loading the chunk before the CSS arrives).
import "tldraw/tldraw.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={READER_FONT_VARIABLES}>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster position="top-center" richColors closeButton />
            <UpgradeDialog />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
