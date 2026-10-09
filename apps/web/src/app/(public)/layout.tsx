import { Focus } from "lucide-react";
import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex min-h-svh flex-col">
        <header className="bg-background/85 sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md">
              <Focus className="size-3.5" strokeWidth={2.25} />
            </div>
            <span className="text-sm font-semibold tracking-tight">Octonote AI</span>
          </Link>
          <Link href="/signup" className="text-muted-foreground hover:text-foreground text-sm">
            Make your own →
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}
