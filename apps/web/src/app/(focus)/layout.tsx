import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppAnalyticsGate } from "@/lib/product-analytics/app-analytics-gate";

/** App pages never belong in search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Full-viewport layout for a single note / canvas / project / notebook.
 * No auth redirect here: "anyone with the link" items open signed-out, and
 * each page gates on the API's answer (see lib/load-or-gate).
 */
export default function FocusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <div className="h-svh w-screen overflow-hidden">{children}</div>
      <AppAnalyticsGate />
    </TooltipProvider>
  );
}
