"use client";

import dynamic from "next/dynamic";

// BlockNote touches the DOM at construction; slides draw their blocks client-side only.
export const ReadOnlySlideBlocks = dynamic(() => import("./slide-blocks-impl").then((m) => m.ReadOnlySlideBlocks), { ssr: false });
export const EditableSlideBlocks = dynamic(() => import("./slide-blocks-impl").then((m) => m.EditableSlideBlocks), { ssr: false });
