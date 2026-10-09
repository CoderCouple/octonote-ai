import { Focus } from "lucide-react";
import Link from "next/link";

/** The Octonote AI mark: the focus glyph on a rounded tile. */
export function Logo() {
  return (
    <Link href="/" className="text-foreground-strong flex items-center gap-2.5">
      <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg">
        <Focus className="size-5" strokeWidth={2.25} />
      </span>
      <span className="text-xl font-bold tracking-tight">Octonote AI</span>
    </Link>
  );
}
