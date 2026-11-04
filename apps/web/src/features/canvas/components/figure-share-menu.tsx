"use client";

/** The canvas's figure bar › Share: copy the figure's links, publish it by itself. */
import { useEffect, useState } from "react";
import {
  getFigureClientApi,
  setFigurePublishedClientApi,
  type FigureView,
} from "../api/figures-client-api";
import {
  FIGURE_LINK_LABELS,
  figureAudience,
  figureLinks,
  type FigureLinks,
} from "../lib/figure-links";

export function FigureShareMenu({
  figureId,
  prepare,
}: {
  figureId: string;
  /** Saves the figure's picture first, so a brand-new figure has a link that works. */
  prepare: () => Promise<void>;
}) {
  const [figure, setFigure] = useState<FigureView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<keyof FigureLinks | null>(null);

  useEffect(() => {
    let live = true;
    prepare()
      .then(() => getFigureClientApi(figureId))
      .then((f) => live && setFigure(f))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [figureId, prepare]);

  if (failed) return <div className="occ-menu-label">Couldn't get this figure's link. Try again in a moment.</div>;
  if (!figure) return <div className="occ-menu-label">Preparing link…</div>;

  const links = figureLinks(figure);
  const copy = async (key: keyof FigureLinks) => {
    await navigator.clipboard.writeText(links[key]);
    setCopied(key);
  };
  const togglePublished = async () => {
    setBusy(true);
    try {
      setFigure(await setFigurePublishedClientApi(figureId, !figure.publishedAt));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {(Object.keys(FIGURE_LINK_LABELS) as (keyof FigureLinks)[]).map((key) => (
        <button key={key} type="button" role="menuitem" onClick={() => void copy(key)}>
          {copied === key ? "Copied" : FIGURE_LINK_LABELS[key]}
        </button>
      ))}
      <div className="occ-menu-sep" />
      {figure.canPublish ? (
        <button type="button" role="menuitem" disabled={busy} onClick={() => void togglePublished()}>
          {figure.publishedAt ? "Unpublish this figure" : "Publish this figure"}
        </button>
      ) : null}
      <div className="occ-menu-label" style={{ textTransform: "none", letterSpacing: "normal" }}>
        {figureAudience(figure.public)}
      </div>
    </>
  );
}
