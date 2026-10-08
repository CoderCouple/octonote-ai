import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function NoAccess() {
  return (
    <main className="grid h-full place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="bg-muted grid size-12 place-items-center rounded-full">
          <Lock className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">You don't have access</h1>
        <p className="text-muted-foreground text-sm">
          This item doesn't exist, was deleted, or hasn't been shared with you. Ask the owner to share it
          with your email address.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/workspace">Go to your workspace</Link>
        </Button>
      </div>
    </main>
  );
}
