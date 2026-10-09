"use client";

import { Code2, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  can,
  PublishedViaBadge,
  ShareDialog,
  type AccessRole,
} from "@/features/sharing";
import { updateNoteClientApi } from "../api/notes-client-api";
import { TypographyPicker } from "../typography/typography-picker";
import { useNoteTypography } from "../typography/use-note-typography";
import type { Page } from "../types";
import { NotesEditor } from "./notes-editor";

interface NotesPaneProps {
  note: Page;
  myRole: AccessRole;
  /** Inside a project the project header owns sharing; hide the per-note share button. */
  showShare?: boolean;
  /** Rendered before the title (e.g. a back link on the focus route). */
  leading?: React.ReactNode;
}

export function NotesPane({
  note,
  myRole,
  showShare = true,
  leading,
}: NotesPaneProps) {
  const editable = can.edit(myRole);
  const [raw, setRaw] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const { style: typographyStyle } = useNoteTypography();

  async function rename(next: string) {
    const prev = title;
    setTitle(next);
    try {
      await updateNoteClientApi(note.id, { title: next });
    } catch (err) {
      setTitle(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't rename.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card flex h-11 shrink-0 items-center gap-2 border-b px-2">
        {leading}
        {editable ? (
          <EditableTitle
            value={title}
            onSave={rename}
            placeholder="Untitled note"
          />
        ) : (
          <span className="truncate px-1 text-sm font-medium">
            {title || "Untitled note"}
          </span>
        )}
        {editable ? null : (
          <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
            View only
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator state={saveState} />
          <PublishedViaBadge kind="page" id={note.id} />
          <TypographyPicker />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                pressed={raw}
                onPressedChange={setRaw}
                size="sm"
                aria-label={raw ? "Show editor" : "Show markdown"}
                className="size-8 p-0"
              >
                {raw ? (
                  <FileText className="size-3.5" />
                ) : (
                  <Code2 className="size-3.5" />
                )}
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              {raw ? "Back to the editor" : "View as markdown"}
            </TooltipContent>
          </Tooltip>
          {showShare ? (
            <ShareDialog
              iconOnly
              kind="page"
              id={note.id}
              title={title}
              myRole={myRole}
              initialLinkAccess={note.linkAccess}
              initialLinkRole={note.linkRole}
            />
          ) : null}
        </div>
      </header>
      {/* Full-width scroll area; the reading column is centred inside it (see globals.css). */}
      <div
        className="reader-typography flex-1 overflow-auto"
        style={{ ...typographyStyle, maxWidth: "none" }}
      >
        {raw ? null : (
          <div className="mx-auto max-w-[var(--reader-content-width)] px-[54px] pt-10 pb-2">
            <h1
              className="text-foreground text-3xl font-bold leading-tight tracking-tight md:text-4xl"
              style={{ fontFamily: "var(--font-reader-family)" }}
            >
              {title || "Untitled note"}
            </h1>
          </div>
        )}
        <NotesEditor
          pageId={note.id}
          initialContent={note.document}
          workspaceId={note.workspaceId}
          readOnly={!editable}
          view={raw ? "raw" : "edit"}
          onSaveStateChange={setSaveState}
        />
      </div>
    </div>
  );
}
