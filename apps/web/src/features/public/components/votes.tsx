"use client";

/**
 * Up/down votes on a published item. One provider per page holds the counts
 * so every vote bar on it (under the byline, at the end, the phone's
 * floating bar) stays in step. Anyone sees the counts; voting needs a
 * signed-in reader — signed-out taps go to sign-in and come back here.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { clientApi } from "@/lib/api/client-fetch";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { PublicKind } from "../types";

type Vote = 1 | -1 | 0;
interface VoteState {
  up: number;
  down: number;
  mine: Vote;
}

const VotesContext = createContext<{
  state: VoteState | null;
  cast: (value: 1 | -1) => void;
} | null>(null);

export function VotesProvider({
  slug,
  kind,
  id,
  children,
}: {
  slug: string;
  kind: PublicKind;
  id: string;
  children: React.ReactNode;
}) {
  const path = `/public/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(id)}/votes`;
  const [state, setState] = useState<VoteState | null>(null);

  useEffect(() => {
    let live = true;
    clientApi
      .get<VoteState>(path)
      .then((s) => live && setState(s))
      .catch(() => live && setState({ up: 0, down: 0, mine: 0 }));
    return () => {
      live = false;
    };
  }, [path]);

  const cast = useCallback(
    async (value: 1 | -1) => {
      const {
        data: { session },
      } = await createSupabaseBrowserClient().auth.getSession();
      if (!session) {
        const here = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(here)}`;
        return;
      }
      // Tapping your current vote again removes it.
      const next: Vote = state?.mine === value ? 0 : value;
      const before = state;
      if (before) setState(applyVote(before, next));
      try {
        setState(await clientApi.put<VoteState>(path, { value: next }));
      } catch {
        setState(before);
        toast.error("Couldn't save your vote. Try again.");
      }
    },
    [path, state],
  );

  return (
    <VotesContext.Provider value={{ state, cast }}>
      {children}
    </VotesContext.Provider>
  );
}

/** Optimistic count change while the request is in flight. */
function applyVote(s: VoteState, next: Vote): VoteState {
  let { up, down } = s;
  if (s.mine === 1) up -= 1;
  if (s.mine === -1) down -= 1;
  if (next === 1) up += 1;
  if (next === -1) down += 1;
  return { up, down, mine: next };
}

/** ↑ n and ↓ n buttons. `size` matches where they sit. */
export function VoteButtons({
  size = "md",
  variant = "pill",
}: {
  size?: "sm" | "md" | "lg";
  /** "pill" for bars, "wide" for the full-width end-of-article buttons on phones. */
  variant?: "pill" | "wide";
}) {
  const ctx = useContext(VotesContext);
  if (!ctx) return null;
  const { state, cast } = ctx;
  const height = { sm: "h-10", md: "h-9", lg: "h-11" }[size];
  const button = (value: 1 | -1) => {
    const on = state?.mine === value;
    const count = value === 1 ? state?.up : state?.down;
    const Icon = value === 1 ? ArrowUp : ArrowDown;
    const label = value === 1 ? "Upvote" : "Downvote";
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${label}${count === undefined ? "" : `, ${count} ${count === 1 ? "vote" : "votes"}`}`}
        onClick={() => cast(value)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold tabular-nums transition-colors",
          height,
          variant === "wide" && "flex-1 rounded-xl",
          on
            ? "bg-foreground-strong text-background border-foreground-strong border"
            : "text-foreground hover:bg-accent border",
        )}
      >
        <Icon className="size-4" strokeWidth={2.4} />
        {variant === "wide" ? `${label} · ` : null}
        {count ?? "–"}
      </button>
    );
  };
  return (
    <div
      className={cn("flex items-center gap-2", variant === "wide" && "w-full")}
    >
      {button(1)}
      {button(-1)}
    </div>
  );
}
