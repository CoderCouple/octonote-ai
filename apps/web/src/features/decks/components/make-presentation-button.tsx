"use client";

import { Presentation } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckSourceRef } from "../lib/load-source";

// The dialog (and the slides library) loads only when someone opens it.
const MakePresentationDialog = dynamic(() => import("./make-presentation-dialog").then((m) => m.MakePresentationDialog), { ssr: false });

/** The header button on notes, projects and notebooks: "Make presentation". */
export function MakePresentationButton({
  kind,
  id,
  title,
  workspaceId,
  notebookId,
}: DeckSourceRef & { workspaceId: string; notebookId?: string | null }) {
  const [open, setOpen] = useState(false);
  const source = useMemo(() => ({ kind, id, title }), [kind, id, title]);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Make presentation" onClick={() => setOpen(true)}>
            <Presentation className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Make presentation — turn this into slides you can present</TooltipContent>
      </Tooltip>
      {open ? <MakePresentationDialog open={open} onOpenChange={setOpen} source={source} workspaceId={workspaceId} notebookId={notebookId} /> : null}
    </>
  );
}
