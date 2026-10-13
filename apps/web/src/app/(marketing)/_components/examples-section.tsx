import { ArrowUpRight, Columns2, FileText, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Real published pages from the "Octonote examples" notebook (made by
 * scripts/demo-pages). Links go to the live /pub pages, so if one is
 * unpublished or re-created, update its slug here.
 */
const GALLERY = "https://octonote.ai/pub/octonote-examples-3kny0t";

const EXAMPLES = [
  {
    kind: "Project",
    title: "How a URL shortener works",
    tag: "System design",
    slug: "how-a-url-shortener-works-kftx8d",
  },
  {
    kind: "Project",
    title: "Self-attention in one page",
    tag: "Machine learning",
    slug: "self-attention-in-one-page-ag9yno",
  },
  {
    kind: "Project",
    title: "Gradient descent, from intuition to update rule",
    tag: "Math",
    slug: "gradient-descent-from-intuition-to-update-rule-2xvfev",
  },
  {
    kind: "Note",
    title: "Designing a distributed rate limiter",
    tag: "Math · Mermaid · code",
    slug: "designing-a-distributed-rate-limiter-4dhz2j",
  },
  {
    kind: "Note",
    title: "Bayes' theorem and the 99%-accurate test",
    tag: "Math",
    slug: "bayes-theorem-and-the-99-accurate-test-pjfmlb",
  },
  {
    kind: "Note",
    title: "TCP vs UDP — cheat sheet",
    tag: "Simple note",
    slug: "tcp-vs-udp-cheat-sheet-mpmg84",
  },
  {
    kind: "Canvas",
    title: "E-commerce microservices architecture",
    tag: "Architecture",
    slug: "e-commerce-microservices-architecture-qw973b",
  },
  {
    kind: "Canvas",
    title: "CI/CD pipeline with a safe rollout",
    tag: "DevOps",
    slug: "ci-cd-pipeline-with-a-safe-rollout-q3tzr0",
  },
  {
    kind: "Canvas",
    title: "Mind map: learning system design",
    tag: "Mind map",
    slug: "mind-map-learning-system-design-o8defv",
  },
] as const;

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
        {EXAMPLES.map((e) => {
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
            Browse all 15 examples <ArrowUpRight className="size-4" />
          </a>
        </Button>
      </div>
    </section>
  );
}
