"use client";

/**
 * The portal's navigation. On desktop: a slim icon rail (shadcn's sidebar-09
 * pattern), each icon named in a tooltip, so pages like the Inbox get the
 * width. On phones: a scrolling row of named tabs.
 */
import {
  Activity,
  ArrowLeft,
  CalendarCheck,
  GraduationCap,
  Handshake,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const GROUPS: { href: string; label: string; icon: LucideIcon }[][] = [
  [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/inbox", label: "Inbox", icon: Inbox },
    { href: "/admin/followups", label: "Follow-ups", icon: CalendarCheck },
  ],
  [
    { href: "/admin/users", label: "People", icon: Users },
    { href: "/admin/partners", label: "Creators", icon: Handshake },
    { href: "/admin/codes", label: "Promo codes", icon: Ticket },
    { href: "/admin/students", label: "Student emails", icon: GraduationCap },
  ],
  [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }],
];

export function AdminNav({ email, mainOrigin }: { email: string; mainOrigin: string }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/admin"
      ? path === "/admin"
      : path === href || path.startsWith(`${href}/`) || (href === "/admin/users" && path.startsWith("/admin/workspaces"));

  return (
    <TooltipProvider delayDuration={150}>
      {/* Phones: a scrolling row of named tabs. */}
      <aside className="bg-sidebar border-sidebar-border flex shrink-0 flex-col border-b md:hidden">
        <div className="flex h-12 items-center gap-2 px-4">
          <Activity className="text-foreground-strong size-4" />
          <span className="text-foreground-strong text-sm font-semibold">Octonote Admin</span>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {GROUPS.flat().map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
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
      </aside>

      {/* Desktop: the icon rail. */}
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-14 shrink-0 flex-col items-center border-r py-2.5 md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/admin"
              aria-label="Octonote Admin"
              className="bg-foreground-strong text-background mb-2 grid size-8 place-items-center rounded-lg"
            >
              <Activity className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Octonote Admin</TooltipContent>
        </Tooltip>
        <nav aria-label="Admin" className="flex flex-col items-center gap-1">
          {GROUPS.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 ? <span aria-hidden className="bg-sidebar-border my-1.5 h-px w-6" /> : null}
              {group.map(({ href, label, icon: Icon }) => (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-label={label}
                      aria-current={active(href) ? "page" : undefined}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg transition-colors",
                        active(href)
                          ? "bg-foreground-strong text-background"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`${mainOrigin}/workspace`}
                aria-label="Back to Octonote"
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground grid size-9 place-items-center rounded-lg"
              >
                <ArrowLeft className="size-[18px]" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Back to Octonote</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={`Signed in as ${email}`}
                className="bg-sidebar-accent text-foreground grid size-8 place-items-center rounded-lg text-xs font-semibold uppercase"
              >
                {email.slice(0, 1)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{email}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
