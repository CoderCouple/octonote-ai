"use client";

import { MousePointer2, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoWindow } from "./demo-window";
import { useDemoStep } from "./use-demo-step";

/**
 * Auto-shape, the real canvas feature: a wobbly pencil stroke snaps into a
 * clean shape, twice, then arrows connect them.
 */
export function CanvasDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(8);

  return (
    <div ref={ref}>
      <DemoWindow title="Launch flow" bodyClassName="aspect-[16/9]">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="bg-popover absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-1.5 text-sm shadow-sm">
          <Shapes className="size-4" />
          Auto-shape on
        </div>

        <svg viewBox="0 0 560 315" className="text-foreground relative h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g transform="translate(40 -39)">
          {/* 1. rough rectangle → clean rectangle */}
          <Stroke
            d="M62 112 C 90 104, 140 108, 172 110 C 178 132, 176 160, 174 182 C 140 186, 96 184, 64 180 C 60 156, 58 132, 63 113"
            drawn={step >= 1}
            visible={step < 2}
          />
          <Shape visible={step >= 2}>
            <rect x="62" y="110" width="112" height="72" rx="10" strokeWidth="2" stroke="currentColor" />
            <text x="118" y="151" textAnchor="middle" className="fill-current text-[12px] font-medium" stroke="none">
              Write
            </text>
          </Shape>

          {/* 2. rough ellipse → clean ellipse */}
          <Stroke
            d="M300 146 C 302 116, 350 104, 380 112 C 412 122, 420 158, 396 176 C 368 196, 314 190, 302 166 C 298 158, 300 150, 301 146"
            drawn={step >= 3}
            visible={step < 4}
          />
          <Shape visible={step >= 4}>
            <ellipse cx="360" cy="146" rx="62" ry="40" strokeWidth="2" stroke="currentColor" />
            <text x="360" y="151" textAnchor="middle" className="fill-current text-[12px] font-medium" stroke="none">
              Share
            </text>
          </Shape>

          {/* 3. arrows */}
          <Stroke d="M178 146 L 290 146" drawn={step >= 5} visible strokeWidth={2} />
          <Shape visible={step >= 5}>
            <path d="M283 140 L 292 146 L 283 152" strokeWidth="2" stroke="currentColor" />
          </Shape>
          <Shape visible={step >= 6}>
            <rect x="300" y="236" width="120" height="52" rx="10" strokeWidth="2" stroke="currentColor" strokeDasharray="5 5" />
            <text x="360" y="267" textAnchor="middle" className="fill-current text-[12px] font-medium" stroke="none">
              Publish
            </text>
          </Shape>
          <Stroke d="M360 188 L 360 230" drawn={step >= 6} visible strokeWidth={2} />
          </g>
        </svg>

        <MousePointer2
          className={cn(
            "text-foreground-strong fill-background absolute size-6 transition-all duration-700 ease-emphasized",
            step < 3 ? "top-[43%] left-[36%]" : step < 5 ? "top-[43%] left-[76%]" : "top-[80%] left-[80%]",
          )}
        />
      </DemoWindow>
    </div>
  );
}

/** A pencil stroke that draws itself in, then fades as the clean shape replaces it. */
function Stroke({
  d,
  drawn,
  visible,
  strokeWidth = 2.5,
}: {
  d: string;
  drawn: boolean;
  visible: boolean;
  strokeWidth?: number;
}) {
  return (
    <path
      d={d}
      pathLength={1}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeDasharray="1"
      strokeDashoffset={drawn ? 0 : 1}
      style={{
        transition: "stroke-dashoffset 800ms var(--ease-standard), opacity 250ms",
        opacity: visible ? 1 : 0,
      }}
    />
  );
}

function Shape({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <g
      style={{
        transition: "opacity 300ms var(--ease-standard), transform 300ms var(--ease-emphasized)",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.97)",
        transformBox: "fill-box",
        transformOrigin: "center",
      }}
    >
      {children}
    </g>
  );
}
