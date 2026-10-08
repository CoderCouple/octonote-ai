"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

/**
 * Tanstack Query client provider.
 *
 *   staleTime          5 min — server data stays fresh for that long before
 *                       refetch is triggered on remount
 *   refetchOnWindowFocus false — chatty in dev, and we have explicit
 *                       invalidation in mutations anyway
 *   retry              1 — give one retry on transient errors; mutations
 *                       handle their own error toasts
 *
 * Per-feature hooks live at `features/<f>/hooks/use-<f>.ts` and use
 * hierarchical query keys (e.g. `["notes", workspaceId]`) so invalidation
 * is surgical.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
