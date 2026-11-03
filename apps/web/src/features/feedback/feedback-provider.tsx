"use client";

/**
 * "Report a bug" / "Request a feature": one dialog for the whole app, opened
 * from Home, the account menu, Settings, or a link with ?feedback=bug|feature.
 * Reports are kept in the database and read in Admin → Feedback.
 */
import {
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_TYPES,
  type FeedbackContext,
  type FeedbackCreate,
  type FeedbackKind,
  type FeedbackScreenshotType,
} from "@octonote/shared";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { OctopusMark } from "@/components/octopus-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

const FeedbackContextValue = createContext<(kind: FeedbackKind) => void>(() => {});

/** Opens the form: `useFeedback()("bug")`. */
export const useFeedback = () => useContext(FeedbackContextValue);

const COPY: Record<FeedbackKind, { prompt: string; hint: string }> = {
  bug: {
    prompt: "What went wrong?",
    hint: "What you did, what you expected, and what happened instead.",
  },
  feature: {
    prompt: "What would you like Octonote to do?",
    hint: "What are you trying to get done? How would this help?",
  },
};

function isScreenshotType(type: string): type is FeedbackScreenshotType {
  return (FEEDBACK_SCREENSHOT_TYPES as readonly string[]).includes(type);
}

/** "Chrome on macOS", from the browser's own description of itself. */
function browserName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "another system";
  return `${browser} on ${os}`;
}

/** The details sent with every report. */
function pageDetails(): FeedbackContext {
  return {
    platform: navigator.userAgent.includes("OctonoteApp") ? "Mobile app (web editor)" : "Web",
    appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    device: browserName(navigator.userAgent),
    system: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    page: window.location.pathname,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Rough location; a report still goes out without it. */
async function roughLocation(): Promise<Pick<FeedbackContext, "city" | "region" | "country">> {
  try {
    const res = await fetch("/api/geo", { signal: AbortSignal.timeout(2500) });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

export function FeedbackProvider({
  email,
  userId,
  workspaceId,
  workspaceName,
  children,
}: {
  email: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");

  // The dialog opens after the menu that launched it has closed and let go of focus.
  const show = useCallback((next: FeedbackKind) => {
    setKind(next);
    window.setTimeout(() => setOpen(true), 0);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const asked = url.searchParams.get("feedback");
    if (asked !== "bug" && asked !== "feature") return;
    url.searchParams.delete("feedback");
    window.history.replaceState(window.history.state, "", url);
    show(asked);
  }, [show]);

  return (
    <FeedbackContextValue.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
          {/* Mounted per opening, so each report starts empty. */}
          {open ? (
            <FeedbackForm
              kind={kind}
              setKind={setKind}
              email={email}
              userId={userId}
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </FeedbackContextValue.Provider>
  );
}

function FeedbackForm({
  kind,
  setKind,
  email,
  userId,
  workspaceId,
  workspaceName,
  onClose,
}: {
  kind: FeedbackKind;
  setKind: (kind: FeedbackKind) => void;
  email: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const details = useMemo(pageDetails, []);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function take(next: File | null | undefined) {
    if (!next) return;
    if (!isScreenshotType(next.type)) {
      setError("The screenshot must be a PNG, JPG or WebP image.");
      return;
    }
    if (next.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      setError("The screenshot must be under 5 MB.");
      return;
    }
    setError(null);
    setFile(next);
  }

  function onPaste(e: ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (pasted) {
      e.preventDefault();
      take(pasted);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files[0]);
  }

  async function send() {
    if (!message.trim()) {
      setError("Write a few words first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const contentType = file?.type;
      const body: FeedbackCreate = {
        kind,
        message,
        workspaceId,
        context: { ...details, ...(await roughLocation()) },
        ...(file && contentType && isScreenshotType(contentType)
          ? { screenshot: { contentType, data: await toBase64(file) } }
          : {}),
      };
      await clientApi.post("/feedback", body);
      setSent(true);
    } catch (err) {
      // What they wrote stays in the form, so they can try again.
      setError(err instanceof Error ? err.message : "That didn't send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
        <OctopusMark className="size-14" />
        <DialogTitle className="text-xl">Thanks, we got it</DialogTitle>
        <DialogDescription className="max-w-[340px] leading-relaxed">
          We read everything. If we need more from you, we&apos;ll write to {email}.
        </DialogDescription>
        <Button variant="outline" className="mt-2" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  const copy = COPY[kind];
  return (
    <div className="flex flex-col gap-4" onPaste={onPaste}>
      <DialogTitle className="text-lg">Send feedback</DialogTitle>
      <DialogDescription className="sr-only">
        Report a bug or request a feature.
      </DialogDescription>

      <div
        role="group"
        aria-label="Type of feedback"
        className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        {(["bug", "feature"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "min-h-10 rounded-md px-2 text-sm transition-colors",
              kind === k
                ? "bg-background text-foreground-strong border font-semibold"
                : "text-muted-foreground hover:text-foreground-strong border border-transparent font-medium",
            )}
          >
            {k === "bug" ? "Report a bug" : "Request a feature"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-message">{copy.prompt}</Label>
        <Textarea
          id="feedback-message"
          rows={5}
          autoFocus
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={copy.hint}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          Screenshot <span className="text-muted-foreground font-normal">(optional)</span>
        </span>
        <input
          ref={picker}
          type="file"
          accept={FEEDBACK_SCREENSHOT_TYPES.join(",")}
          className="hidden"
          aria-label="Choose a screenshot"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file && preview ? (
          <div className="flex items-center gap-3 rounded-lg border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local file preview */}
            <img src={preview} alt="Your screenshot" className="h-14 w-20 rounded-md border object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground-strong truncate text-sm font-medium">{file.name || "Pasted image"}</p>
              <p className="text-muted-foreground text-xs">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFile(null)}>
              <X /> Remove
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => picker.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "hover:bg-muted/50 flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors",
              dragging && "bg-muted",
            )}
          >
            <span className="inline-flex items-center gap-2">
              <ImagePlus className="size-4" /> Add a screenshot
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              Choose a file, drag it here, or paste it. Up to 5 MB.
            </span>
          </button>
        )}
      </div>

      <div className="text-muted-foreground text-[13px] leading-relaxed">
        We attach your account, device and rough location so we can look into this.{" "}
        <button
          type="button"
          className="text-foreground-strong font-medium underline underline-offset-2"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? "Hide" : "See what we attach"}
        </button>
        {showDetails ? (
          <dl className="bg-muted/60 text-foreground mt-2 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md px-3 py-2 text-xs">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="truncate">{userId}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{email}</dd>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="truncate">
              {workspaceName} · {workspaceId}
            </dd>
            <dt className="text-muted-foreground">Device</dt>
            <dd className="line-clamp-2 break-words">
              {details.device} · {details.screen}
            </dd>
            <dt className="text-muted-foreground">App version</dt>
            <dd>{details.appVersion ?? "—"}</dd>
            <dt className="text-muted-foreground">Page</dt>
            <dd className="truncate">{details.page}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd>When you send this, with your time zone ({details.timeZone})</dd>
            <dt className="text-muted-foreground">Location</dt>
            <dd>City and country, from your connection. Your IP address isn&apos;t kept.</dd>
          </dl>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={() => void send()} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : null}
          Send
        </Button>
      </div>
    </div>
  );
}
