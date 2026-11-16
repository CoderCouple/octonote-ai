"use client";

import { STUDIO_KIND_LABEL, type StudioItem } from "@octonote/shared";
import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { KindBadge } from "./kinds";
import { StudioPreview } from "./studio-preview";

/** The public page of a shared studio item. Its maker also gets a link back to edit it. */
export function SharedStudioItem({ item }: { item: StudioItem }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8 md:py-14">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={item.kind} label={STUDIO_KIND_LABEL[item.kind]} />
        {item.sourceType === "url" && item.sourceRef ? (
          <a href={item.sourceRef} target="_blank" rel="noreferrer" className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline">
            From {item.sourceLabel} <ArrowUpRight className="size-3" />
          </a>
        ) : null}
        {item.mine ? (
          <Link href={`/workspace/studio/${item.id}`} className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 text-sm">
            <Pencil className="size-3.5" /> Open in Studio
          </Link>
        ) : null}
      </div>
      <h1 className="text-foreground-strong mt-3 text-3xl font-bold tracking-tight md:text-4xl">{item.title}</h1>
      <div className="mt-8">
        {item.spec ? <StudioPreview id={item.id} kind={item.kind} spec={item.spec} /> : null}
      </div>
      <p className="text-muted-foreground mt-10 text-center text-sm">
        Made with{" "}
        <Link href="/" className="text-foreground hover:underline">
          Octonote Studio
        </Link>
      </p>
    </main>
  );
}
