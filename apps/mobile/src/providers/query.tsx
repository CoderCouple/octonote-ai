import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );

  // React Native has no window focus: treat "app came to the foreground" as
  // focus, so stale lists refetch after the user was away (or edited on web).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") focusManager.setFocused(status === "active");
    });
    return () => sub.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
