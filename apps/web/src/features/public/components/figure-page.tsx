"use client";

/** A figure's own page, /f/<id>: the picture, its links, and publishing for its owner. */
import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { setFigurePublishedClientApi, type FigureView } from "@/features/canvas/api/figures-client-api";
import { getFigureWithPicture } from "@/features/canvas/lib/figure-picture";
import {
  FIGURE_LINK_LABELS,
  figureAudience,
  figureLinks,
  type FigureLinks,
} from "@/features/canvas/lib/figure-links";

export function FigurePage({ figure: initial }: { figure: FigureView }) {
  const [figure, setFigure] = useState(initial);
  const [copied, setCopied] = useState<keyof FigureLinks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const links = figureLinks(figure);

  // A canvas made by the CLI or an assistant: an editor's browser draws the picture.
  const drawable = !initial.imageUrl && Boolean(initial.draw);
  useEffect(() => {
    if (!drawable) return;
    let live = true;
    void getFigureWithPicture(initial.id)
      .then((next) => live && setFigure(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [drawable, initial.id]);

  const togglePublished = async () => {
    setBusy(true);
    setError(false);
    try {
      setFigure(await setFigurePublishedClientApi(figure.id, !figure.publishedAt));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-foreground-strong min-w-0 text-xl font-semibold break-words">{figure.title}</h1>
        {figure.canvasHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={figure.canvasHref}>
              <ExternalLink className="size-4" />
              Open canvas
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border bg-white p-3">
        {figure.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={figure.imageUrl}
            alt={figure.title}
            className="mx-auto block h-auto max-w-full"
            style={figure.width && figure.height ? { aspectRatio: `${figure.width} / ${figure.height}` } : undefined}
          />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-600">
            {figure.draw ? "Drawing this figure…" : "This figure's picture appears once its canvas has been opened."}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FIGURE_LINK_LABELS) as (keyof FigureLinks)[]).map((key) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(links[key]).then(() => setCopied(key))}
          >
            {copied === key ? <Check className="size-4" /> : null}
            {copied === key ? "Copied" : FIGURE_LINK_LABELS[key]}
          </Button>
        ))}
        {figure.canPublish ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void togglePublished()}>
            {figure.publishedAt ? "Unpublish this figure" : "Publish this figure"}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm" role={error ? "alert" : undefined}>
        {error ? "That didn't save. Try again." : figureAudience(figure.public)}
      </p>
    </div>
  );
}
