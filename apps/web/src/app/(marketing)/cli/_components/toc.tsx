"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Sticky contents for the docs page; highlights the section you're reading. */
export function Toc({
  items,
}: {
  items: { id: string; label: string; sub?: boolean }[];
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const onScroll = () => {
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top < 140) current = item.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);
  return (
    <nav aria-label="On this page" className="flex flex-col gap-0.5 text-sm">
      <p className="text-muted-foreground mb-2 text-2xs font-semibold tracking-[0.12em] uppercase">
        On this page
      </p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={active === item.id ? "location" : undefined}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            item.sub && "pl-5 text-xs",
            active === item.id
              ? "text-foreground-strong bg-accent font-medium"
              : "text-muted-foreground hover:text-foreground-strong",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
