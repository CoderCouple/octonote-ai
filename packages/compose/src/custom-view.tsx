import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@octonote/widgets";
import { CUSTOM_LIMITS, customSrcDoc, customVideos, readCustomMessage, type CustomBlock, type CustomVideo } from "./custom.js";

export interface CustomExperienceProps {
  block: CustomBlock;
  theme?: "light" | "dark";
  onComplete?: (score: number) => void;
  onEvent?: (name: string, data: unknown) => void;
  /** Show the author's controls (view code, stop). Readers only get the app. */
  editable?: boolean;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || String(Math.random()).slice(2);
}

/** Saves one embedded video as a file named after the block. */
function downloadVideo(video: CustomVideo, title: string, index: number, count: number): void {
  const bytes = Uint8Array.from(atob(video.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: video.mime }));
  const name = title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "video";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}${count > 1 ? `-${index + 1}` : ""}.${video.mime === "video/webm" ? "webm" : "mp4"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Runs generated code in an isolated frame, straight away (it loads lazily,
 * so blocks further down start as they scroll near). The frame gets
 * `sandbox="allow-scripts"` and nothing else: no access to this page, its
 * cookies or storage, no forms, popups or navigation, and its CSP blocks all
 * network requests. It can only send the three bridge messages.
 */
export function CustomExperience({ block, theme = "light", onComplete, onEvent, editable = true }: CustomExperienceProps) {
  const [running, setRunning] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [height, setHeight] = useState(block.height ?? 360);
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(randomNonce, [block.html]);
  const srcDoc = useMemo(() => customSrcDoc(block.html, nonce, theme), [block.html, nonce, theme]);
  const videos = useMemo(() => (editable ? customVideos(block.html) : []), [block.html, editable]);
  const handlers = useRef({ onComplete, onEvent });
  handlers.current = { onComplete, onEvent };

  useEffect(() => {
    if (!running) return;
    const onMessage = (event: MessageEvent) => {
      // Only this frame, only its secret, only known messages.
      if (event.source !== frame.current?.contentWindow) return;
      const message = readCustomMessage(event.data, nonce);
      if (!message) return;
      if (message.type === "resize") setHeight(Math.min(CUSTOM_LIMITS.maxHeight, Math.max(CUSTOM_LIMITS.minHeight, Math.round(message.height))));
      else if (message.type === "complete") handlers.current.onComplete?.(Math.min(100, Math.max(0, message.score)));
      else handlers.current.onEvent?.(message.name, message.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [running, nonce]);

  return (
    <section className="cx-custom" aria-label={block.title}>
      <h3 className="cx-custom__title">{block.title}</h3>
      {running ? (
        <iframe
          ref={frame}
          title={block.title}
          className="cx-custom__frame"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          allow=""
          loading="lazy"
          style={{ height }}
        />
      ) : (
        <div className="cx-custom__gate">
          <p>Runs isolated from the page, with no internet access.</p>
          <Button size="sm" variant="primary" onClick={() => setRunning(true)}>
            Run it
          </Button>
        </div>
      )}
      {editable ? (
        <div className="cx-custom__footer">
        <Button size="sm" variant="ghost" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>
          {showCode ? "Hide code" : "View code"}
        </Button>
        {running ? (
          <Button size="sm" variant="ghost" onClick={() => setRunning(false)}>
            Stop
          </Button>
        ) : null}
        {videos.map((video, i) => (
          <Button key={i} size="sm" variant="ghost" onClick={() => downloadVideo(video, block.title, i, videos.length)}>
            {videos.length > 1 ? `Download video ${i + 1}` : "Download video"}
          </Button>
        ))}
        </div>
      ) : null}
      {editable && showCode ? (
        <pre className="cx-custom__code" tabIndex={0}>
          <code>{block.html}</code>
        </pre>
      ) : null}
    </section>
  );
}
