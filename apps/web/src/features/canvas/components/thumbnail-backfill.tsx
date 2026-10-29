"use client";

/**
 * Canvases made outside the editor (API, imports, examples) have no
 * thumbnail until someone opens them. Lists mount this with the ones
 * missing a picture; it makes them in the background (octodraw loads only
 * when there's work) and refreshes the list. Each canvas is tried once per
 * browser session, so empty canvases aren't retried on every visit.
 * Project ids (`prj_…`) work too: their canvas gets the picture.
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const Impl = dynamic(
  () =>
    import("./thumbnail-backfill-impl").then((m) => m.ThumbnailBackfillImpl),
  { ssr: false },
);

const KEY = "octonote:thumb-backfill-tried";
function tried(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function markTried(ids: string[]) {
  try {
    const all = tried();
    for (const id of ids) all.add(id);
    sessionStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // Storage blocked: worst case we try again next visit.
  }
}

export function ThumbnailBackfill({ canvasIds }: { canvasIds: string[] }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  // Worked out after hydration: the server can't see sessionStorage.
  const [todo, setTodo] = useState<string[]>([]);
  const key = canvasIds.join(",");
  useEffect(() => {
    const skip = tried();
    setTodo(canvasIds.filter((id) => !skip.has(id)).slice(0, 10));
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (done || todo.length === 0) return null;
  return (
    <Impl
      canvasIds={todo}
      onDone={(madeAny) => {
        markTried(todo);
        setDone(true);
        if (madeAny) router.refresh();
      }}
    />
  );
}
