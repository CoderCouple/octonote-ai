"use client";

import dynamic from "next/dynamic";
import { useChat } from "./chat-context";

/**
 * The chat panel's code (and the widgets, quizzes and animations it can show)
 * loads only the first time the panel opens, so app pages stay light.
 */
const Body = dynamic(
  () => import("./chat-panel").then((m) => m.ChatPanelBody),
  { ssr: false },
);

export function ChatPanel() {
  const { open } = useChat();
  return open ? <Body /> : null;
}
