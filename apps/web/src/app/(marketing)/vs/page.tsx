import type { Metadata } from "next";
import { LinkHub } from "../_components/link-hub";
import { COMPARISONS } from "../_data/comparisons";

export const metadata: Metadata = {
  title: "Compare Octonote AI with other note and diagram tools",
  description:
    "Honest comparisons of Octonote AI with Notion, Eraser and other tools for notes, canvases and diagrams — including when the other tool is the better fit.",
  alternates: { canonical: "/vs" },
};

export default function CompareIndexPage() {
  return (
    <LinkHub
      eyebrow="Compare"
      title="Octonote AI vs the rest"
      intro="Honest comparisons, including when the other tool is the better fit."
      items={COMPARISONS.map((c) => ({
        href: `/vs/${c.slug}`,
        title: `Octonote AI vs ${c.name}`,
        body: c.description,
      }))}
    />
  );
}
