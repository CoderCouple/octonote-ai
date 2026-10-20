import { SUPPORT_EMAIL } from "@octonote/shared";
import Link from "next/link";
import { PROFILES } from "../_data/company";
import { COMPARISONS } from "../_data/comparisons";
import { USE_CASES } from "../_data/use-cases";
import { Logo } from "./logo";

/**
 * Columns list every use case and comparison by name, so each of those pages
 * is one click (and one internal link) from every marketing page.
 */
const COLUMNS: {
  title: string;
  href: string;
  links: { href: string; label: string }[];
}[] = [
  {
    title: "Product",
    href: "/",
    links: [
      { href: "/#notes", label: "Features" },
      { href: "/#agents", label: "Agents" },
      { href: "/#examples", label: "Examples" },
      { href: "/cli", label: "CLI" },
      { href: "/pricing", label: "Pricing" },
      { href: "/students", label: "Students" },
    ],
  },
  {
    title: "Use cases",
    href: "/use-cases",
    links: USE_CASES.map((u) => ({
      href: `/use-cases/${u.slug}`,
      label: u.name,
    })),
  },
  {
    title: "Compare",
    href: "/vs",
    links: COMPARISONS.map((c) => ({
      href: `/vs/${c.slug}`,
      label: `vs ${c.name}`,
    })),
  },
  {
    title: "Company",
    href: "/about",
    links: [
      { href: "/about", label: "About" },
      { href: `mailto:${SUPPORT_EMAIL}`, label: "Contact" },
      ...PROFILES.map((p) => ({ href: p.url, label: p.label })),
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t px-4 py-14 md:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
          <Logo />
          <p className="text-muted-foreground text-sm">© 2026 Octonote AI</p>
        </div>
        {COLUMNS.map((col) => (
          <nav
            key={col.title}
            aria-label={col.title}
            className="flex flex-col gap-3"
          >
            <Link
              href={col.href}
              className="text-foreground-strong text-sm font-semibold"
            >
              {col.title}
            </Link>
            {col.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
    </footer>
  );
}
