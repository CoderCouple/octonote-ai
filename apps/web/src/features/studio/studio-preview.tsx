"use client";

/**
 * A studio item drawn with the same libraries and providers as the note
 * block, so what you see here is exactly what lands in a note. The spec is
 * checked again before it renders.
 */
import "@octonote/widgets/styles.css";
import "@octonote/infographic/styles.css";
import "@octonote/interactive/styles.css";
import "@octonote/motion/styles.css";
import "@octonote/compose/styles.css";
import { checkBlock } from "@octonote/compose";
import { BlockView } from "@octonote/compose/react";
import { defaultComponents, InteractiveProvider, webStorageStore } from "@octonote/interactive";
import { webWidgetStore, WidgetsProvider } from "@octonote/widgets";
import { useEffect, useMemo, useState } from "react";
import { notesCatalog, renderRichText } from "@/features/notes/blocks/interactive-block";

const store = typeof window === "undefined" ? undefined : webStorageStore(window.localStorage, "octonote-studio:");
const widgetStore = typeof window === "undefined" ? undefined : webWidgetStore(window.localStorage, "octonote-studio-widget:");

export function StudioPreview({ id, kind, spec }: { id: string; kind: string; spec: Record<string, unknown> }) {
  const dark = useIsDark();
  const theme = dark ? "dark" : "light";
  const result = useMemo(() => checkBlock(notesCatalog, { ...spec, kind }, id), [spec, kind, id]);
  if (!result.ok)
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        This couldn't be shown: {result.issues[0]?.message ?? "the block didn't check out"}.
      </div>
    );
  return (
    <InteractiveProvider components={defaultComponents} theme={theme} store={store} renderText={renderRichText}>
      <WidgetsProvider theme={theme} store={widgetStore}>
        <BlockView block={result.block} theme={theme} />
      </WidgetsProvider>
    </InteractiveProvider>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
