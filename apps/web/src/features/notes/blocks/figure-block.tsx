"use client";

/**
 * `figure` block: a canvas figure embedded in a note as an image. The image
 * lives at a fixed URL per figure that the canvas overwrites whenever the
 * figure changes, so the note always shows the latest picture — in the
 * editor, on mobile and on published pages. In the app it also refreshes
 * the title and links to the canvas. Never renders tldraw (live inline
 * canvases are v2).
 */
import { createReactBlockSpec } from "@blocknote/react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Group } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useCanvasReferenceResolver } from "./canvas-reference-context";

const MIN_PCT = 25;
const HANDLE =
  "bg-foreground-strong/70 absolute z-10 rounded-full opacity-0 transition-opacity group-hover/figure:opacity-100";
const clampPct = (n: number) =>
  Math.min(100, Math.max(MIN_PCT, Number.isFinite(n) ? n : 100));

export const FigureBlock = createReactBlockSpec(
  {
    type: "figure" as const,
    propSchema: {
      figureId: { default: "" },
      /** Stored at insert time: the fallback when the figure can't be looked up. */
      title: { default: "" },
      imageUrl: { default: "" },
      width: { default: 0 },
      height: { default: 0 },
      /** Display width as % of the note column (resizable from the edges). */
      widthPct: { default: 100 },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }) => (
      <FigureCard
        {...block.props}
        onResize={
          editor.isEditable
            ? (widthPct) => editor.updateBlock(block, { props: { widthPct } })
            : undefined
        }
      />
    ),
    toExternalHTML: ({ block }) =>
      block.props.imageUrl ? (
        <figure>
          <img src={block.props.imageUrl} alt={block.props.title} />
          <figcaption>{block.props.title}</figcaption>
        </figure>
      ) : (
        <p>[Figure {block.props.title}]</p>
      ),
  },
);

function FigureCard({
  figureId,
  title,
  imageUrl,
  width,
  height,
  widthPct,
  onResize,
}: {
  figureId: string;
  title: string;
  imageUrl: string;
  width: number;
  height: number;
  widthPct: number;
  /** Editors only: commit a new width after dragging an edge. */
  onResize?: (widthPct: number) => void;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const pct = liveWidth ?? clampPct(widthPct);

  /**
   * Drag an edge or the corner. The figure stays centred, so side edges grow
   * it by twice the pointer travel. It's an image, so dragging the bottom
   * makes it taller *and* wider (aspect ratio kept) rather than stretching it.
   */
  function startResize(
    e: React.PointerEvent,
    side: "left" | "right" | "bottom" | "corner",
  ) {
    const frame = frameRef.current;
    const column = frame?.parentElement;
    if (!frame || !column || !onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const columnWidth = column.getBoundingClientRect().width;
    const rect = frame.getBoundingClientRect();
    const startWidth = rect.width;
    // Width per pixel of height, from the rendered figure (image + caption).
    const aspect = rect.width / Math.max(1, rect.height);
    const startX = e.clientX;
    const startY = e.clientY;
    let next = pct;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const grow =
        side === "right"
          ? dx * 2
          : side === "left"
            ? -dx * 2
            : side === "bottom"
              ? dy * aspect
              : Math.max(dx * 2, dy * aspect);
      next = clampPct(((startWidth + grow) / columnWidth) * 100);
      setLiveWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onResize(Math.round(next));
      setLiveWidth(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const resolver = useCanvasReferenceResolver();
  const live = useQuery({
    queryKey: ["figure", resolver.id, figureId],
    queryFn: () => resolver.resolveFigure!(figureId),
    enabled: Boolean(figureId && resolver.resolveFigure),
    retry: false,
    // The canvas re-exports a figure a few seconds after each edit.
    staleTime: 15_000,
  });

  const shown = {
    title: live.data?.title ?? title,
    imageUrl: live.data?.imageUrl ?? imageUrl,
    width: live.data?.width || width,
    height: live.data?.height || height,
  };
  const href = live.data?.href;

  if (!shown.imageUrl) {
    return (
      <div
        contentEditable={false}
        className="text-muted-foreground my-2 flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm"
      >
        <Group className="size-4" />
        {figureId
          ? "This figure is still being prepared — it appears once the canvas saves."
          : "Empty figure"}
      </div>
    );
  }

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown.imageUrl}
      alt={shown.title || "Figure"}
      loading="lazy"
      className="mx-auto block h-auto max-h-[640px] w-auto max-w-full"
      style={
        shown.width && shown.height
          ? { aspectRatio: `${shown.width} / ${shown.height}` }
          : undefined
      }
    />
  );

  return (
    <figure
      ref={frameRef}
      contentEditable={false}
      className="group/figure relative mx-auto my-3"
      style={{ width: `${pct}%` }}
    >
      {onResize ? (
        <>
          {(["left", "right"] as const).map((side) => (
            <span
              key={side}
              role="separator"
              aria-label={`Resize figure from the ${side}`}
              onPointerDown={(e) => startResize(e, side)}
              className={`${HANDLE} top-1/2 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize ${
                side === "left" ? "-left-3" : "-right-3"
              }`}
            />
          ))}
          <span
            role="separator"
            aria-label="Resize figure from the bottom"
            onPointerDown={(e) => startResize(e, "bottom")}
            className={`${HANDLE} -bottom-3 left-1/2 h-1.5 w-12 -translate-x-1/2 cursor-ns-resize`}
          />
          <span
            role="separator"
            aria-label="Resize figure from the corner"
            onPointerDown={(e) => startResize(e, "corner")}
            className={`${HANDLE} -right-3 -bottom-3 size-3 cursor-nwse-resize`}
          />
        </>
      ) : null}
      <div className="relative overflow-hidden rounded-lg border bg-white p-2">
        {image}
        {/* Opening the canvas is an explicit action, not a click on the image. */}
        {href ? (
          <Link
            href={href}
            className="bg-background/95 text-foreground-strong absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium opacity-0 shadow-sm transition-opacity group-hover/figure:opacity-100 focus-visible:opacity-100"
          >
            <ExternalLink className="size-3.5" />
            Open canvas
          </Link>
        ) : null}
      </div>
      {shown.title ? (
        <figcaption className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-center text-sm">
          <Group className="size-3.5" />
          {shown.title}
        </figcaption>
      ) : null}
    </figure>
  );
}
