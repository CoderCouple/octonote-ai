"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "./chat-context";

/** The top-bar button that opens the AI chat (also ⌘J / Ctrl+J). */
export function ChatToggle() {
  const { open, toggle } = useChat();
  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      className="ml-auto h-8 gap-1.5"
      onClick={toggle}
      aria-pressed={open}
      title="AI chat (⌘J)"
    >
      <Sparkles className="size-4" />
      <span className="max-sm:hidden">Ask AI</span>
    </Button>
  );
}
