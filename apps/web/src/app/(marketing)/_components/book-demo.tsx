import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * "Book a demo": opens the Cal.com booking page in a new tab (no embedded
 * widget, so no third-party scripts on our pages). `data-demo` lets
 * SiteAnalytics count clicks as `demo_clicked`. Renders nothing until
 * DEMO_URL is set.
 */
export function BookDemoButton({
  variant = "outline",
  size = "lg",
  className,
  label = "Book a demo",
}: {
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
}) {
  if (!DEMO_URL) return null;
  return (
    <Button asChild variant={variant} size={size} className={cn("gap-2", className)}>
      <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" data-demo="">
        <CalendarDays className="size-[1.1em]" />
        {label}
      </a>
    </Button>
  );
}
