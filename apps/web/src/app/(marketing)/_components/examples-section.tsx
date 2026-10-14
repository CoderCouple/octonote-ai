import { ArrowUpRight, Columns2, FileText, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAMPLES, EXAMPLES_NOTEBOOK_SLUG } from "../_data/examples";

const GALLERY = `https://octonote.ai/pub/${EXAMPLES_NOTEBOOK_SLUG}`;

const ICON = { Project: Columns2, Note: FileText, Canvas: LayoutGrid } as const;

export function ExamplesSection() {
  return (
    <section
      id="examples"
      className="relative scroll-mt-16 border-t px-4 py-28 md:px-8 md:py-40"
    >
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-muted-foreground text-lg font-medium md:text-xl">
          Examples
        </p>
        <h2 className="text-foreground-strong md:text-display mt-5 text-4xl font-bold">
          See what it makes.
        </h2>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-xl">
          Real pages published from Octonote — from a one-screen cheat sheet to
          a full system design. Open any of them; no account needed.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLES.filter((e) => e.featured).map((e) => {
          const Icon = ICON[e.kind];
          return (
            <a
              key={e.slug}
              href={`https://octonote.ai/pub/${e.slug}`}
              target="_blank"
              rel="noopener"
              className="bg-card hover:border-foreground-subtle group flex flex-col rounded-2xl border p-6 text-left transition-colors"
            >
              <span className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icon className="size-4" />
                {e.kind} · {e.tag}
              </span>
              <span className="text-foreground-strong mt-3 text-lg font-semibold leading-snug">
                {e.title}
              </span>
              <span className="text-muted-foreground group-hover:text-foreground-strong mt-auto flex items-center gap-1 pt-6 text-sm font-medium transition-colors">
                Open page <ArrowUpRight className="size-4" />
              </span>
            </a>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-12 rounded-lg px-6 text-base"
        >
          <a href={GALLERY} target="_blank" rel="noopener">
            Browse all {EXAMPLES.length} examples{" "}
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
      </div>
    </section>
  );
}
