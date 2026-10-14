import type { Metadata } from "next";
import { LinkHub } from "../_components/link-hub";
import { USE_CASES } from "../_data/use-cases";

export const metadata: Metadata = {
  title: "Use cases",
  description:
    "What people make with Octonote AI: notes with LaTeX math and Mermaid diagrams, technical explainers with drawings, and more.",
  alternates: { canonical: "/use-cases" },
};

export default function UseCasesIndexPage() {
  return (
    <LinkHub
      eyebrow="Use cases"
      title="What people make with Octonote AI"
      intro="Notes, canvases and the two side by side — for anyone who explains things."
      items={USE_CASES.map((u) => ({
        href: `/use-cases/${u.slug}`,
        title: u.name,
        body: u.description,
      }))}
    />
  );
}
