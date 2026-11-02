import Link from "next/link";
import { OctopusMark } from "@/components/octopus-mark";

/** The Octonote AI mark: the octopus (black in light mode, white in dark) and the name. */
export function Logo() {
  return (
    <Link href="/" className="text-foreground-strong flex items-center gap-2.5">
      <OctopusMark className="size-9" />
      <span className="text-xl font-bold tracking-tight">Octonote AI</span>
    </Link>
  );
}
