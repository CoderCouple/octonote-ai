"use client";

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

interface WorkspaceBreadcrumbsProps {
  workspaceName: string;
}

const ROUTE_LABELS: Record<string, string> = {
  notes: "Notes",
  canvases: "Canvases",
  projects: "Projects",
  notebooks: "Notebooks",
  shared: "Shared",
  settings: "Settings",
};

/**
 * Top-header breadcrumb. Workspace is always the root; the second
 * crumb is whichever top-level tab the user is on. Dynamic segments
 * (UUIDs) get a generic leaf label since the breadcrumb doesn't have
 * cheap access to the resource title — detail pages can render their
 * own title inside the page chrome.
 */
export function WorkspaceBreadcrumbs({ workspaceName }: WorkspaceBreadcrumbsProps) {
  const pathname = usePathname() ?? "/workspace";
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/");

  // Path starts with "workspace" — drop it and start from the tab segment.
  const tail = segments[0] === "workspace" ? segments.slice(1) : segments;
  const tab = tail[0];
  const tabLabel = tab ? (ROUTE_LABELS[tab] ?? null) : null;
  const isDetail = tail.length > 1;

  const crumbs: Array<{ label: string; href?: string }> = [
    { label: workspaceName, href: tabLabel ? "/workspace" : undefined },
  ];
  if (tabLabel) {
    crumbs.push({
      label: tabLabel,
      ...(isDetail ? { href: `/workspace/${tab}` } : {}),
    });
  }
  if (isDetail) {
    crumbs.push({ label: leafLabel(tab) });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem>
                {isLast || !crumb.href ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function leafLabel(tab: string | undefined): string {
  switch (tab) {
    case "projects":
      return "Project";
    case "notes":
      return "Note";
    case "canvas":
      return "Canvas";
    default:
      return "Details";
  }
}
