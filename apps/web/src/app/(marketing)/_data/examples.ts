/**
 * Real published pages from the "Octonote examples" notebook (made by
 * scripts/demo-pages). The landing page features some; the sitemap lists all
 * (SEO decision 2026-10-13: only these official examples go in the sitemap,
 * not pages users publish). If one is unpublished or re-created, update its
 * slug here.
 */
export const EXAMPLES_NOTEBOOK_SLUG = "octonote-examples-3kny0t";

export interface Example {
  kind: "Project" | "Note" | "Canvas";
  title: string;
  tag: string;
  slug: string;
  /** Shown on the landing page. */
  featured?: boolean;
}

export const EXAMPLES: Example[] = [
  {
    kind: "Project",
    title: "How a URL shortener works",
    tag: "System design",
    slug: "how-a-url-shortener-works-kftx8d",
    featured: true,
  },
  {
    kind: "Project",
    title: "Self-attention in one page",
    tag: "Machine learning",
    slug: "self-attention-in-one-page-ag9yno",
    featured: true,
  },
  {
    kind: "Project",
    title: "Gradient descent, from intuition to update rule",
    tag: "Math",
    slug: "gradient-descent-from-intuition-to-update-rule-2xvfev",
    featured: true,
  },
  {
    kind: "Project",
    title: "Dijkstra's shortest path, visually",
    tag: "Algorithms",
    slug: "dijkstra-s-shortest-path-visually-0uhnao",
  },
  {
    kind: "Project",
    title: "What happens when you run kubectl apply",
    tag: "DevOps",
    slug: "what-happens-when-you-run-kubectl-apply-o3w4pu",
  },
  {
    kind: "Note",
    title: "Designing a distributed rate limiter",
    tag: "Math · Mermaid · code",
    slug: "designing-a-distributed-rate-limiter-4dhz2j",
    featured: true,
  },
  {
    kind: "Note",
    title: "Bayes' theorem and the 99%-accurate test",
    tag: "Math",
    slug: "bayes-theorem-and-the-99-accurate-test-pjfmlb",
    featured: true,
  },
  {
    kind: "Note",
    title: "TCP vs UDP — cheat sheet",
    tag: "Simple note",
    slug: "tcp-vs-udp-cheat-sheet-mpmg84",
    featured: true,
  },
  {
    kind: "Note",
    title: "Big-O for everyday data structures",
    tag: "Algorithms",
    slug: "big-o-for-everyday-data-structures-do4p80",
  },
  {
    kind: "Note",
    title: "A git branching workflow that scales",
    tag: "Git",
    slug: "a-git-branching-workflow-that-scales-jfyr2v",
  },
  {
    kind: "Canvas",
    title: "E-commerce microservices architecture",
    tag: "Architecture",
    slug: "e-commerce-microservices-architecture-qw973b",
    featured: true,
  },
  {
    kind: "Canvas",
    title: "CI/CD pipeline with a safe rollout",
    tag: "DevOps",
    slug: "ci-cd-pipeline-with-a-safe-rollout-q3tzr0",
    featured: true,
  },
  {
    kind: "Canvas",
    title: "Mind map: learning system design",
    tag: "Mind map",
    slug: "mind-map-learning-system-design-o8defv",
    featured: true,
  },
  {
    kind: "Canvas",
    title: "The OSI model, layer by layer",
    tag: "Networking",
    slug: "the-osi-model-layer-by-layer-o5ce7u",
  },
  {
    kind: "Canvas",
    title: "My weekly content pipeline",
    tag: "Workflow",
    slug: "my-weekly-content-pipeline-w3x987",
  },
];
