"use client";

import { Activity, ArrowLeft, GraduationCap, LayoutDashboard, ScrollText, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "People", icon: Users },
  { href: "/admin/codes", label: "Promo codes", icon: Ticket },
  { href: "/admin/students", label: "Student emails", icon: GraduationCap },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

/** The portal's navigation: a sidebar on desktop, a scrolling row of tabs on phones. */
export function AdminNav({ email, mainOrigin }: { email: string; mainOrigin: string }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`) || (href === "/admin/users" && path.startsWith("/admin/workspaces"));

  return (
    <aside className="bg-sidebar border-sidebar-border flex shrink-0 flex-col border-b md:sticky md:top-0 md:h-svh md:w-56 md:border-r md:border-b-0">
      <div className="flex h-12 items-center gap-2 px-4 md:border-b md:border-sidebar-border">
        <Activity className="text-foreground-strong size-4" />
        <span className="text-foreground-strong text-sm font-semibold">Octonote Admin</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible md:pt-2 md:pb-0">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
              active(href)
                ? "bg-sidebar-accent text-foreground-strong font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="hidden flex-col gap-2 border-t border-sidebar-border p-3 md:flex">
        <p className="text-muted-foreground truncate text-xs" title={email}>
          {email}
        </p>
        <a href={`${mainOrigin}/workspace`} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">
          <ArrowLeft className="size-3.5" />
          Back to Octonote
        </a>
      </div>
    </aside>
  );
}
