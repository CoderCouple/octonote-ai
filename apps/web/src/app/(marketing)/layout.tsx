import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";
import { MarketingFooter } from "./_components/marketing-footer";
import { MarketingNav } from "./_components/marketing-nav";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s · Octonote AI",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "notes app",
    "canvas",
    "whiteboard",
    "diagrams",
    "mermaid",
    "LaTeX math notes",
    "markdown notes",
    "publish notes",
    "Claude Code",
    "Codex",
    "AI agents",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <MarketingNav />
      <main className="relative">{children}</main>
      <MarketingFooter />
    </div>
  );
}
