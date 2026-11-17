"use client";

import "@octonote/infographic/styles.css";
import { Infographic, LAYOUT_FAMILIES, type InfographicSpec } from "@octonote/infographic";
import gallery from "@octonote/infographic/examples/gallery.json";
import { useState } from "react";

const examples = gallery as unknown as InfographicSpec[];

export function Gallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(960);
  return (
    <main className={theme === "dark" ? "min-h-screen bg-[#0b0b0c] p-8" : "min-h-screen bg-[#f6f6f4] p-8"}>
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-4 text-sm" style={{ color: theme === "dark" ? "#ddd" : "#333" }}>
        <strong>Infographic gallery</strong> · {examples.length} examples
        <button className="rounded border px-2 py-1" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme}
        </button>
        <select className="rounded border px-2 py-1 text-black" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
          {[960, 720, 520, 380].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      </div>
      {Object.entries(LAYOUT_FAMILIES).map(([family, layouts]) => (
        <section key={family} className="mx-auto mb-12" style={{ maxWidth: width }}>
          <h2 className="mb-4 text-xs font-bold tracking-widest uppercase" style={{ color: theme === "dark" ? "#888" : "#777" }}>
            {family}
          </h2>
          <div className="space-y-8">
            {examples
              .filter((e) => (layouts as readonly string[]).includes(e.layout))
              .map((spec) => (
                <div key={spec.id} id={spec.id} data-example={spec.id}>
                  <p className="mb-2 font-mono text-xs" style={{ color: theme === "dark" ? "#888" : "#777" }}>
                    {spec.layout}
                    {spec.style ? ` · ${spec.style}` : ""}
                    {spec.palette ? ` · ${spec.palette}` : ""}
                  </p>
                  <Infographic spec={spec} theme={theme} />
                </div>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}
