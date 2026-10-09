/** Remembers on this device whether the intro has been seen, so it shows once. */
import * as SecureStore from "expo-secure-store";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

const KEY = "octonote.onboarding.seen";

interface OnboardingState {
  /** null until read from storage. */
  seen: boolean | null;
  markSeen: () => void;
  /** Dev: show the intro again. */
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setSeen(v === "1"))
      .catch(() => setSeen(false));
  }, []);

  const markSeen = () => {
    setSeen(true);
    void SecureStore.setItemAsync(KEY, "1").catch(() => {});
  };
  const reset = () => {
    setSeen(false);
    void SecureStore.deleteItemAsync(KEY).catch(() => {});
  };

  return <OnboardingContext value={{ seen, markSeen, reset }}>{children}</OnboardingContext>;
}

export function useOnboarding(): OnboardingState {
  const ctx = use(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>.");
  return ctx;
}
