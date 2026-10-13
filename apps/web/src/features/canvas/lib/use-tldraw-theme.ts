"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import type { Editor } from "tldraw";

/**
 * Keeps tldraw's light/dark drawing colors in step with the site theme
 * (system or the user's choice). Exports stay light: thumbnails and figure
 * images pass `darkMode: false`.
 */
export function useTldrawTheme(editor: Editor | null) {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!editor || !resolvedTheme) return;
    editor.user.updateUserPreferences({
      colorScheme: resolvedTheme === "dark" ? "dark" : "light",
    });
  }, [editor, resolvedTheme]);
}
