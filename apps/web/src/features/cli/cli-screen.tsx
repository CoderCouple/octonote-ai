import { Focus } from "lucide-react";
import Link from "next/link";

/** The small centred card the CLI sign-in pages share. */
export function CliScreen({
  icon,
  title,
  body,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
            <Focus className="size-4" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Octonote AI
          </span>
        </Link>
        <div className="flex flex-col items-center gap-2">
          {icon ? (
            <span className="bg-muted text-foreground-strong mb-1 grid size-11 place-items-center rounded-xl">
              {icon}
            </span>
          ) : null}
          <h1 className="text-foreground-strong text-xl font-bold">{title}</h1>
          <div className="text-muted-foreground text-sm leading-relaxed">
            {body}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
