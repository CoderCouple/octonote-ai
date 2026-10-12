import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { fontSize } from "@octonote/design-tokens";

// Teach tailwind-merge our type-scale names (2xs, lead, display…). Unknown
// `text-*` classes are otherwise read as colors, so `cn("text-muted-foreground",
// "text-2xs")` would silently drop the color.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: Object.keys(fontSize) }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
