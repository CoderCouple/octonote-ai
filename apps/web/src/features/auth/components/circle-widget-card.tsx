"use client";

import "@octonote/widgets/styles.css";
import { WidgetSpecRenderer, WidgetsProvider } from "@octonote/widgets";
import explorables from "@octonote/widgets/examples/explorables.json";
import { useEffect, useState } from "react";

const CIRCLE = explorables.find((w) => w.id === "unit-circle");

/** The unit-circle widget from the home page, live: drag the point or press play. */
export function CircleWidgetCard() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-card max-h-[340px] overflow-hidden rounded-2xl border p-3 text-left shadow-lg lg:max-h-[390px]">
      <WidgetsProvider theme={dark ? "dark" : "light"}>
        <WidgetSpecRenderer spec={CIRCLE} />
      </WidgetsProvider>
    </div>
  );
}
