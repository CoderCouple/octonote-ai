"use client";

import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface NavItem {
  title: string;
  url: string;
  icon?: LucideIcon;
}

/** Sidebar links; the page you're on is highlighted (it wasn't before). */
export function NavMain({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <SidebarGroup className={cn("px-3", className)}>
      <SidebarMenu className="gap-0.5">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={active}
                className={cn(
                  "h-9 gap-3 rounded-md px-2.5 text-[14px] transition-colors [&>svg]:size-[18px]",
                  active
                    ? // Black pill in light mode, white in dark (primary inverts) — same as the mobile tab bar.
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground font-medium"
                    : "text-sidebar-foreground hover:text-foreground-strong",
                )}
              >
                <Link href={item.url} aria-current={active ? "page" : undefined}>
                  {item.icon ? <item.icon strokeWidth={active ? 2.2 : 1.8} /> : null}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
