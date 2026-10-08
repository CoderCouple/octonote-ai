import type { Metadata } from "next";
import { MarketingFooter } from "./_components/marketing-footer";
import { MarketingNav } from "./_components/marketing-nav";

const title = "Octonote — the AI workspace for humans and agents";
const description =
  "Notes, canvas, and agents in one workspace. Every AI change is a typed patch — nothing moves without your OK.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s · Octonote",
  },
  description,
  applicationName: "Octonote",
  keywords: ["notes", "canvas", "whiteboard", "sharing", "publishing", "notebooks"],
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "Octonote",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <MarketingNav />
      <main className="relative">{children}</main>
      <MarketingFooter />
    </div>
  );
}
