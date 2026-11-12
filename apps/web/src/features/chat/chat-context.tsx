"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ChatState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  workspaceId: string;
}

const ChatContext = createContext<ChatState | null>(null);

const KEY = "octonote-chat-open";

/** The AI chat's open state for the whole app: remembered per browser, toggled with ⌘J / Ctrl+J. */
export function ChatProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    try {
      setOpenState(localStorage.getItem(KEY) === "1");
    } catch {
      // Storage blocked: start closed.
    }
  }, []);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Not remembered; still works.
    }
  }, []);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "j"
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ open, setOpen, toggle, workspaceId }),
    [open, setOpen, toggle, workspaceId],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat needs a ChatProvider");
  return value;
}
