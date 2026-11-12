import { useMemo, useRef, useState } from "react";
import { chaptersVtt, type Chapter, type Orientation } from "./schema.js";

export interface ManimVideoProps {
  src: string;
  poster?: string;
  title: string;
  orientation?: Orientation;
  chapters?: readonly Chapter[];
  className?: string;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Plays a generated explainer with a chapter list (from the storyboard) the
 * viewer can jump through, and a transcript of the captions.
 */
export function ManimVideo({ src, poster, title, orientation = "landscape", chapters = [], className }: ManimVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const vtt = useMemo(() => (chapters.length ? `data:text/vtt;charset=utf-8,${encodeURIComponent(chaptersVtt(chapters))}` : null), [chapters]);
  const current = chapters.findIndex((c) => now >= c.start && now < c.end);

  return (
    <figure className={["mv-root", `mv-${orientation}`, className].filter(Boolean).join(" ")} aria-label={title}>
      <video ref={video} className="mv-video" src={src} poster={poster} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}>
        {vtt ? <track kind="chapters" src={vtt} srcLang="en" label="Chapters" default /> : null}
      </video>
      {chapters.length ? (
        <figcaption className="mv-chapters">
          <p className="mv-title">{title}</p>
          <ol>
            {chapters.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-current={i === current ? "true" : undefined}
                  onClick={() => {
                    if (!video.current) return;
                    video.current.currentTime = c.start + 0.01;
                    void video.current.play().catch(() => {});
                  }}
                >
                  <span className="mv-time">{clock(c.start)}</span>
                  <span>{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <details className="mv-transcript">
            <summary>Transcript</summary>
            {chapters.map((c, i) => (
              <p key={i}>{c.caption}</p>
            ))}
          </details>
        </figcaption>
      ) : null}
    </figure>
  );
}
