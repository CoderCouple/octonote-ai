"use client";

/**
 * `manimVideo` block: an explainer video generated with Manim from a concept
 * (@octonote/manim, rendered by services/manim-worker). It stores only the
 * video id; while the video is being made it shows progress, then plays it with
 * chapters. In markdown it's ```video {"videoId": "vid_…"}```.
 */
import "@octonote/manim/styles.css";
import { createReactBlockSpec } from "@blocknote/react";
import { ManimVideo } from "@octonote/manim/react";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clientApi } from "@/lib/api/client-fetch";

interface Video {
  id: string;
  status: "queued" | "storyboard" | "code" | "render" | "join" | "done" | "failed";
  orientation: "landscape" | "portrait";
  title: string | null;
  progress: { done?: number; total?: number; repaired?: number; fallbacks?: number } | null;
  chapters: { title: string; caption: string; start: number; end: number; fallback?: boolean }[] | null;
  url: string | null;
  posterUrl: string | null;
  error: string | null;
}

export const ManimVideoBlock = createReactBlockSpec(
  {
    type: "manimVideo" as const,
    propSchema: { videoId: { default: "" } },
    content: "none" as const,
  },
  {
    toExternalHTML: ({ block }) => (
      <pre>
        <code className="language-video">{JSON.stringify({ videoId: block.props.videoId })}</code>
      </pre>
    ),
    render: ({ block }) => <VideoView videoId={block.props.videoId} />,
  },
);

const STAGES: Record<string, string> = {
  queued: "Waiting for a free renderer…",
  storyboard: "Planning the storyboard…",
  code: "Writing the animation code…",
  join: "Putting the scenes together…",
};

function VideoView({ videoId }: { videoId: string }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll until the video is finished; readers of published notes use the same public endpoint.
  useEffect(() => {
    if (!videoId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await clientApi.get<Video>(`/videos/${videoId}`);
        if (stop) return;
        setVideo(next);
        setError(null);
        if (next.status !== "done" && next.status !== "failed") timer = setTimeout(load, 3000);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Couldn't load this video.");
      }
    };
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [videoId]);

  let body;
  if (error) body = <p className="text-destructive text-sm">{error}</p>;
  else if (!video) body = <p className="text-muted-foreground text-sm">Loading video…</p>;
  else if (video.status === "done" && video.url) {
    body = <ManimVideo src={video.url} poster={video.posterUrl ?? undefined} title={video.title ?? "Explainer video"} orientation={video.orientation} chapters={video.chapters ?? []} />;
  } else if (video.status === "failed") {
    body = <p className="text-destructive text-sm">This video couldn't be made: {video.error}</p>;
  } else {
    const p = video.progress ?? {};
    const label = video.status === "render" && p.total ? `Rendering scene ${Math.min((p.done ?? 0) + 1, p.total)} of ${p.total}…` : (STAGES[video.status] ?? "Working…");
    const percent = video.status === "render" && p.total ? 30 + 60 * ((p.done ?? 0) / p.total) : { queued: 2, storyboard: 10, code: 20, join: 95 }[video.status as string] ?? 5;
    body = (
      <div className="flex flex-col gap-3 py-6" role="status">
        <div className="text-foreground flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full transition-[width] duration-700" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-muted-foreground text-xs">Videos take a few minutes. You can keep writing; this updates by itself.</p>
      </div>
    );
  }

  return (
    <div className="my-1 w-full" contentEditable={false} onKeyDown={(e) => e.stopPropagation()}>
      <div className="bg-card rounded-xl border p-3">
        <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Clapperboard className="size-3.5" />
          Explainer video
        </div>
        {body}
      </div>
    </div>
  );
}

/** "/video": describe a concept, pick a shape, and a block is added that fills in when the video is ready. */
export function VideoDialog({ open, onOpenChange, workspaceId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; onCreated: (videoId: string) => void }) {
  const [concept, setConcept] = useState("");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (concept.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const video = await clientApi.post<{ id: string }>("/ai/videos", { workspaceId, concept, orientation });
      onCreated(video.id);
      setConcept("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the video.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Explainer video
          </DialogTitle>
          <DialogDescription>Describe a concept. AI plans a 1–2 minute animated explainer and renders it with Manim; it appears in the note when it's ready.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. How compound interest works"
            aria-label="Concept"
            className="bg-background w-full resize-none rounded-md border p-3 text-sm outline-none"
            disabled={busy}
          />
          <div className="flex gap-2" role="radiogroup" aria-label="Shape">
            {(["landscape", "portrait"] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={orientation === o}
                onClick={() => setOrientation(o)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${orientation === o ? "border-foreground font-medium" : "text-muted-foreground"}`}
              >
                {o === "landscape" ? "Landscape 16:9" : "Portrait 9:16"}
              </button>
            ))}
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || concept.trim().length < 3}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Make video"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
