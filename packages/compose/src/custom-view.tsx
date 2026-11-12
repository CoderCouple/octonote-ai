import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@octonote/widgets";
import { CUSTOM_LIMITS, customSrcDoc, readCustomMessage, type CustomBlock } from "./custom.js";

export interface CustomExperienceProps {
  block: CustomBlock;
  theme?: "light" | "dark";
  onComplete?: (score: number) => void;
  onEvent?: (name: string, data: unknown) => void;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || String(Math.random()).slice(2);
}

/**
 * Runs generated code in an isolated frame, only after the learner presses
 * Run. The frame gets `sandbox="allow-scripts"` and nothing else: no access to
 * this page, its cookies or storage, no forms, popups or navigation, and its
 * CSP blocks all network requests. It can only send the three bridge messages.
 */
export function CustomExperience({ block, theme = "light", onComplete, onEvent }: CustomExperienceProps) {
  const [running, setRunning] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [height, setHeight] = useState(block.height ?? 360);
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(randomNonce, [block.html]);
  const srcDoc = useMemo(() => customSrcDoc(block.html, nonce, theme), [block.html, nonce, theme]);
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
      <header className="cx-custom__header">
        <div>
          <h3 className="cx-custom__title">{block.title}</h3>
          <p className="cx-custom__description">{block.description}</p>
        </div>
        <span className="wg-badge" title="Generated for this answer and run in an isolated sandbox without network access">
          Custom · sandboxed
        </span>
      </header>
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
          <p>This experience was written for your question. It runs isolated from the page, with no internet access.</p>
          <Button variant="primary" onClick={() => setRunning(true)}>
            Run it
          </Button>
        </div>
      )}
      <div className="cx-custom__footer">
        <Button size="sm" variant="ghost" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>
          {showCode ? "Hide code" : "View code"}
        </Button>
        {running ? (
          <Button size="sm" variant="ghost" onClick={() => setRunning(false)}>
            Stop
          </Button>
        ) : null}
      </div>
      {showCode ? (
        <pre className="cx-custom__code" tabIndex={0}>
          <code>{block.html}</code>
        </pre>
      ) : null}
    </section>
  );
}
