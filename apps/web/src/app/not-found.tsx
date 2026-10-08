import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-background relative grid min-h-svh place-items-center overflow-hidden px-4">
      <div className="relative flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <div className="space-y-4">
          <div className="text-foreground text-7xl font-semibold tracking-tighter tabular-nums sm:text-8xl md:text-9xl">
            404
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Out of focus</h1>
          <p className="text-muted-foreground text-sm whitespace-nowrap">
            We couldn&apos;t find that page. It may have been moved, archived, or never existed.
          </p>
        </div>
        <Button asChild>
          <Link href="/workspace">
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Link>
        </Button>
      </div>
    </main>
  );
}
