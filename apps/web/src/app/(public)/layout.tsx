import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signupHref } from "@/features/public/lib/signup-ref";
import { OctopusMark } from "@/components/octopus-mark";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex min-h-svh flex-col">
        <header className="bg-background/85 sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <OctopusMark className="text-foreground-strong size-6" />
            <span className="text-sm font-semibold tracking-tight">
              Octonote AI
            </span>
          </Link>
          {/* Desktop pages can put their own title bar here (see HeaderSlot). */}
          <div
            id="pub-header-slot"
            className="flex min-w-0 flex-1 items-center justify-between gap-6 px-6"
          />
          <Link
            href={signupHref(undefined, "pub-header")}
            className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
          >
            Make your own →
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}
