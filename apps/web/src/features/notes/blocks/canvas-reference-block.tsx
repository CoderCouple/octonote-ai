"use client";

/**
 * `canvasReference` block: a card linking to a canvas, with its thumbnail
 * and title. Reference only — never renders tldraw inside the note (an
 * inline canvas block is a v2 feature).
 */
import { createReactBlockSpec } from "@blocknote/react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Lock } from "lucide-react";
import Link from "next/link";
import { useCanvasReferenceResolver } from "./canvas-reference-context";

export const CanvasReferenceBlock = createReactBlockSpec(
  {
    type: "canvasReference" as const,
    propSchema: {
      canvasId: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block }) => (
      <CanvasReferenceCard canvasId={block.props.canvasId} />
    ),
    toExternalHTML: ({ block }) => <p>[Canvas {block.props.canvasId}]</p>,
  },
);

function CanvasReferenceCard({ canvasId }: { canvasId: string }) {
  const resolver = useCanvasReferenceResolver();
  const { data, isLoading } = useQuery({
    queryKey: ["canvas-reference", resolver.id, canvasId],
    queryFn: () => resolver.resolve(canvasId),
    enabled: Boolean(canvasId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div
        className="bg-muted my-2 h-40 w-full max-w-xl animate-pulse rounded-lg"
        contentEditable={false}
      />
    );
  }

  if (!data) {
    return (
      <div
        className="text-muted-foreground my-2 flex w-full max-w-xl items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm"
        contentEditable={false}
      >
        <Lock className="size-4" />
        Canvas unavailable — it was deleted or you don't have access.
      </div>
    );
  }

  return (
    <Link
      href={data.href}
      contentEditable={false}
      className="hover:border-foreground/30 group my-2 block w-full max-w-xl overflow-hidden rounded-lg border transition-colors"
    >
      <div className="bg-muted grid aspect-[16/9] place-items-center overflow-hidden">
        {data.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs, no next/image loader configured
          <img
            src={data.thumbnailUrl}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <LayoutGrid className="text-muted-foreground size-8" />
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <LayoutGrid className="size-3.5 shrink-0" />
        <span className="truncate">{data.title || "Untitled canvas"}</span>
        <span className="text-muted-foreground ml-auto text-xs opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}
