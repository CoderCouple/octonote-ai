import Link from "next/link";
import { Logo } from "./logo";

const FOOTER_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#sharing", label: "Sharing" },
  { href: "/login", label: "Log in" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
        <Logo />
        <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
              {link.label}
            </Link>
          ))}
          <span>© 2026 Octonote AI</span>
        </div>
      </div>
    </footer>
  );
}
