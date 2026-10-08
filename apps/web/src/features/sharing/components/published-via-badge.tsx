"use client";

/**
 * Small header badge: "Public" when published, "Public via <notebook>" when
 * it's public only because an ancestor is published — so inheriting public
 * visibility is never a surprise.
 */
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPublishStateApi } from "../api/sharing-api";
import { KIND_LABEL, shareKeys } from "../constants";
import type { ResourceKind } from "../types";

export function PublishedViaBadge({ kind, id }: { kind: ResourceKind; id: string }) {
  const { data } = useQuery({
    queryKey: shareKeys.publish(kind, id),
    queryFn: () => getPublishStateApi(kind, id),
  });
  if (!data?.published) return null;
  const label = data.publishedVia ? `Public via ${data.publishedVia.name}` : "Public";
  const hint = data.publishedVia
    ? `Visible on the web because its ${KIND_LABEL[data.publishedVia.kind]} is published.`
    : "Published to the web.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground flex max-w-48 items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px]">
          <Globe className="size-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
