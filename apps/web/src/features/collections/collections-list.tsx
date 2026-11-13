"use client";

import { Library, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCollection,
  listCollections,
  type CollectionSummary,
} from "./api";

/** Named containers of research clips, newest first, with a way to start one. */
export function CollectionsList({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<CollectionSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCollections(workspaceId)
      .then(setItems)
      .catch(() => setItems([]));
  }, [workspaceId]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await createCollection(workspaceId, name);
      router.push(`/workspace/collections/${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground-strong text-2xl font-bold">
            Collections
          </h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            Keep the parts of AI chats you want, one collection per topic, then
            turn them into a note written only from what you kept, with every
            sentence cited.
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection, e.g. Solid-state batteries"
            aria-label="Collection name"
            className="w-72"
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create
          </Button>
        </form>
      </div>

      <div className="mt-8">
        {items === null ? (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        ) : items.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            <Library className="mx-auto mb-3 size-6" />
            No collections yet. Create one for something you're researching,
            then paste in the bits of ChatGPT, Claude or Gemini answers you want
            to keep.
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/workspace/collections/${c.id}`}
                  className="hover:bg-muted/60 flex items-center gap-3 px-4 py-3"
                >
                  <Library className="text-muted-foreground size-4 shrink-0" />
                  <span className="text-foreground-strong min-w-0 flex-1 truncate font-medium">
                    {c.name}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {c.clips} {c.clips === 1 ? "clip" : "clips"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
