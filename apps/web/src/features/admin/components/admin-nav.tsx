"use client";

/**
 * The portal's navigation, built like Octonote's own sidebar: shadcn's
 * Sidebar with collapsible="icon" — names when open, an icon rail with
 * tooltips when closed (the toggle in the top bar, the rail on its edge or
 * ⌘B), a sheet on phones. AdminShell adds the 48px top bar, as in the app.
 */
import {
  ArrowLeft,
  CalendarCheck,
  GraduationCap,
  Handshake,
  Inbox,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    label: "Outreach",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/inbox", label: "Inbox", icon: Inbox },
      { href: "/admin/followups", label: "Follow-ups", icon: CalendarCheck },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/users", label: "People", icon: Users },
      { href: "/admin/partners", label: "Creators", icon: Handshake },
      { href: "/admin/codes", label: "Promo codes", icon: Ticket },
      { href: "/admin/students", label: "Student emails", icon: GraduationCap },
    ],
  },
  { label: "Records", items: [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }] },
];

const ITEMS = GROUPS.flatMap((g) => g.items);

function isActive(path: string, href: string) {
  return href === "/admin"
    ? path === "/admin"
    : path === href || path.startsWith(`${href}/`) || (href === "/admin/users" && path.startsWith("/admin/workspaces"));
}

/** Same pill as the app's NavMain: black in light mode, white in dark. */
function NavButton({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={label}
        isActive={active}
        className={cn(
          "h-9 gap-3 rounded-md px-2.5 text-sm transition-colors [&>svg]:size-[18px]",
          active
            ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground font-medium"
            : "text-sidebar-foreground hover:text-foreground-strong",
        )}
      >
        <Link href={href} aria-current={active ? "page" : undefined}>
          <Icon strokeWidth={active ? 2.2 : 1.8} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AdminSidebar({ email, mainOrigin }: { email: string; mainOrigin: string }) {
  const path = usePathname();
  return (
    <Sidebar collapsible="icon">
      {/* Exactly 48px with a bottom border: lines up with the top bar's border. */}
      <SidebarHeader className="border-sidebar-border h-12 shrink-0 justify-center border-b px-3 py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Octonote Admin"
              className="h-9 gap-2.5 px-1.5 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-1.5"
            >
              <Link href="/admin">
                <span className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-6 shrink-0 items-center justify-center rounded-md">
                  <ShieldCheck className="size-3.5" />
                </span>
                <span className="text-foreground-strong truncate text-sm font-semibold">Octonote Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pt-1">
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label} className="px-3 py-1.5">
            <SidebarGroupLabel className="text-muted-foreground h-7 px-2.5 text-xs">{g.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {g.items.map((item) => (
                <NavButton key={item.href} {...item} active={isActive(path, item.href)} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-1 px-3 pb-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Back to Octonote"
              className="text-sidebar-foreground hover:text-foreground-strong h-9 gap-3 rounded-md px-2.5 text-sm [&>svg]:size-[18px]"
            >
              <a href={`${mainOrigin}/workspace`}>
                <ArrowLeft strokeWidth={1.8} />
                <span>Back to Octonote</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={email}
              className="h-11 gap-2.5 px-1.5 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-1.5"
            >
              <span className="bg-sidebar-accent text-foreground grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold uppercase">
                {email.slice(0, 1)}
              </span>
              <span className="grid min-w-0 text-left leading-tight">
                <span className="text-muted-foreground text-[11px]">Signed in as</span>
                <span className="text-foreground truncate text-xs">{email}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Where you are: Admin › section › item (detail pages get a generic leaf name). */
function crumbsFor(path: string): { label: string; href?: string }[] {
  if (path === "/admin") return [{ label: "Admin" }];
  const section = ITEMS.find((i) => i.href !== "/admin" && isActive(path, i.href));
  const crumbs: { label: string; href?: string }[] = [{ label: "Admin", href: "/admin" }];
  if (!section) return crumbs;
  const detail = path.startsWith("/admin/workspaces/")
    ? "Workspace"
    : path.startsWith(`${section.href}/`)
      ? (DETAIL_LABELS[section.href] ?? "Details")
      : null;
  crumbs.push(detail ? { label: section.label, href: section.href } : { label: section.label });
  if (detail) crumbs.push({ label: detail });
  return crumbs;
}

const DETAIL_LABELS: Record<string, string> = { "/admin/users": "Person", "/admin/partners": "Creator" };

/** Sidebar + the slim top bar (toggle · breadcrumb), wrapping every admin page, as in the app. */
export function AdminShell({ email, mainOrigin, children }: { email: string; mainOrigin: string; children: React.ReactNode }) {
  const crumbs = crumbsFor(usePathname() ?? "/admin");
  return (
    <SidebarProvider>
      <AdminSidebar email={email} mainOrigin={mainOrigin} />
      <SidebarInset className="min-w-0">
        <header className="bg-background sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground-strong size-8" />
          <Separator orientation="vertical" className="mr-1 !h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <Fragment key={`${i}-${c.label}`}>
                  {i > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {c.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
