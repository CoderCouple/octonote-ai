"use client";

/**
 * "Build with AI": describe what you want to learn or show, and the compose
 * agent writes a section (text plus widgets, activities or animations) that
 * goes into the note at the cursor. The API returns markdown, so it goes
 * through the same importer as pasting.
 */
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clientApi } from "@/lib/api/client-fetch";

const EXAMPLES = ["A widget showing how compound interest grows", "Flashcards for the first 10 elements", "Quiz me on the causes of World War I", "An animation of how a web request works"];

export function ComposeAiDialog({ open, onOpenChange, onInsert }: { open: boolean; onOpenChange: (open: boolean) => void; onInsert: (markdown: string) => void }) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    if (!request.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { markdown } = await clientApi.post<{ markdown: string }>("/ai/compose", { request });
      onInsert(markdown);
      setRequest("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI couldn't build this.");
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
            Build with AI
          </DialogTitle>
          <DialogDescription>Describe what to explain or practise. The AI picks text, interactive widgets, flashcards, quizzes or animations, and checks each one before it's added.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void build();
          }}
          className="grid gap-3"
        >
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void build();
            }}
            rows={3}
            autoFocus
            placeholder="e.g. Explain how compound interest works"
            aria-label="What should the AI build?"
            className="bg-background w-full resize-none rounded-md border p-3 text-sm outline-none"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setRequest(example)} disabled={busy} className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs">
                {example}
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
            <Button type="submit" disabled={busy || !request.trim()}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Building… (up to a minute)
                </>
              ) : (
                "Build"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
