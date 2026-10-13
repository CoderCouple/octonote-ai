"use client";

/**
 * Phones: a slim floating bar — ↑ ↓ votes, Contents (headings sheet) and
 * Share. It slides away while you scroll down to read and comes back when
 * you scroll up, so it never sits on the text you're reading.
 */
import { List, Share } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { SectionEntry } from "@/features/notes/lib/derive-published-meta";
import { cn } from "@/lib/utils";
import { VoteButtons } from "./votes";

export async function shareThisPage(title: string) {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // Cancelled — fall through to copying.
    }
  }
  await navigator.clipboard.writeText(url);
  toast.success("Link copied");
}

export function ReaderBar({
  sections,
  title,
}: {
  sections: SectionEntry[];
  title: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Hide when scrolling down past the top; show on any scroll up.
      if (Math.abs(y - lastY.current) < 6) return;
      setHidden(y > lastY.current && y > 120);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div
        className={cn(
          "bg-background fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1 shadow-lg transition-transform duration-300 lg:hidden",
          hidden && "translate-y-[calc(100%+2rem)]",
        )}
      >
        <VoteButtons size="sm" />
        <span aria-hidden className="bg-border mx-1 h-5 w-px" />
        {sections.length > 1 ? (
          <button
            type="button"
            aria-label="Contents"
            onClick={() => setContentsOpen(true)}
            className="hover:bg-accent grid size-10 place-items-center rounded-full"
          >
            <List className="size-[18px]" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Share"
          onClick={() => void shareThisPage(title)}
          className="hover:bg-accent grid size-10 place-items-center rounded-full"
        >
          <Share className="size-[18px]" />
        </button>
      </div>
      <ContentsSheet
        open={contentsOpen}
        onOpenChange={setContentsOpen}
        sections={sections}
      />
    </>
  );
}

/** The note's headings; the one you're reading is highlighted. Tap to jump. */
function ContentsSheet({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: SectionEntry[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let best: string | null = sections[0]?.id ?? null;
    for (const s of sections) {
      const el = document.querySelector<HTMLElement>(`[data-id="${s.id}"]`);
      if (el && el.getBoundingClientRect().top - 96 <= 0) best = s.id;
    }
    setActiveId(best);
  }, [open, sections]);

  function jump(id: string) {
    onOpenChange(false);
    const el = document.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) return;
    // After the sheet closes, so the scroll isn't fought by the drawer.
    setTimeout(() => {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 72,
        behavior: "smooth",
      });
    }, 250);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80svh]">
        <DrawerHeader className="border-b px-5 pb-3 text-left">
          <DrawerTitle>Contents</DrawerTitle>
        </DrawerHeader>
        <nav aria-label="Contents" className="overflow-auto pb-6">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              aria-current={s.id === activeId ? "location" : undefined}
              className={cn(
                "flex min-h-12 w-full items-center px-5 text-left text-base",
                s.level === 2 && "pl-9",
                s.level === 3 && "pl-13",
                s.id === activeId
                  ? "bg-accent text-foreground-strong font-semibold"
                  : "text-muted-foreground",
              )}
            >
              <span className="truncate">{s.text || "Untitled section"}</span>
            </button>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
