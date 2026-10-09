"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResourceKind } from "@/features/sharing";
import { createResource } from "../operations";

const LABEL: Record<ResourceKind, string> = {
  page: "New note",
  canvas: "New canvas",
  project: "New project",
  notebook: "New notebook",
};

/** One click: create an "Untitled" resource and open it; rename happens inline there. */
export function CreateButton({
  kind,
  workspaceId,
  notebookId,
  variant = "default",
}: {
  kind: ResourceKind;
  workspaceId: string;
  notebookId?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      router.push(await createResource(kind, workspaceId, notebookId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create.");
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={variant}
      onClick={create}
      disabled={pending}
      className="gap-1.5"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Plus className="size-3.5" />
      )}
      {LABEL[kind]}
    </Button>
  );
}
