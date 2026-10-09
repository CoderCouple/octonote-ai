/**
 * Zustand store for reader typography — separate from the persisted
 * user preference so the picker can preview a choice instantly and
 * commit lazily.
 *
 * On mount the layout seeds the store from either:
 *   1. Signed-in user preference (GET /me/preferences)  — default path
 *   2. localStorage snapshot                              — anon path
 *   3. Baked defaults                                     — first visit
 *
 * Every change persists back to whichever tier is applicable, debounced.
 */
"use client";

import { create } from "zustand";
import type {
  NotesFontFamily,
  NotesFontSize,
  NotesLineHeight,
} from "@octonote/shared";
import type { NotesContentWidth } from "./fonts";

const STORAGE_KEY = "octo.notes.typography";

export interface NoteTypography {
  family: NotesFontFamily;
  size: NotesFontSize;
  lineHeight: NotesLineHeight;
  width: NotesContentWidth;
}

interface TypographyStore extends NoteTypography {
  setFamily: (family: NotesFontFamily) => void;
  setSize: (size: NotesFontSize) => void;
  setLineHeight: (lh: NotesLineHeight) => void;
  setWidth: (w: NotesContentWidth) => void;
  hydrate: (partial: Partial<NoteTypography>) => void;
}

const DEFAULTS: NoteTypography = {
  family: "inter",
  size: "md",
  lineHeight: "normal",
  width: "medium",
};

function readLocal(): Partial<NoteTypography> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<NoteTypography>;
  } catch {
    return null;
  }
}

function writeLocal(state: NoteTypography) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full / disabled — silently ignore
  }
}

export const useTypographyStore = create<TypographyStore>((set, get) => ({
  ...DEFAULTS,
  ...(readLocal() ?? {}),
  setFamily: (family) => {
    set({ family });
    writeLocal({ ...get(), family });
  },
  setSize: (size) => {
    set({ size });
    writeLocal({ ...get(), size });
  },
  setLineHeight: (lineHeight) => {
    set({ lineHeight });
    writeLocal({ ...get(), lineHeight });
  },
  setWidth: (width) => {
    set({ width });
    writeLocal({ ...get(), width });
  },
  hydrate: (partial) => {
    // Only overwrite fields that are actually present on the payload —
    // preserves any explicit user override made before hydration lands.
    const clean: Partial<NoteTypography> = {};
    if (partial.family) clean.family = partial.family;
    if (partial.size) clean.size = partial.size;
    if (partial.lineHeight) clean.lineHeight = partial.lineHeight;
    if (partial.width) clean.width = partial.width;
    set(clean);
  },
}));
