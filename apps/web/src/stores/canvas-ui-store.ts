import { create } from "zustand";

interface CanvasUIState {
  autoShape: boolean;
  dslOpen: boolean;
  setAutoShape: (value: boolean) => void;
  setDslOpen: (value: boolean) => void;
  toggleDsl: () => void;
}

export const useCanvasUI = create<CanvasUIState>((set) => ({
  autoShape: false,
  dslOpen: false,
  setAutoShape: (value) => set({ autoShape: value }),
  setDslOpen: (value) => set({ dslOpen: value }),
  toggleDsl: () => set((s) => ({ dslOpen: !s.dslOpen })),
}));
