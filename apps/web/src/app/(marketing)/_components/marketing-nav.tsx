import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#sharing", label: "Sharing" },
  { href: "#mobile", label: "Mobile" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  return (
    <nav className="bg-background/80 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 md:px-8">
        <Logo />
        <div className="text-muted-foreground hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:bg-accent hover:text-foreground rounded-md px-3 py-1.5 text-base transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden text-base sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="text-base">
            <Link href="/signup">Get Octonote free</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
