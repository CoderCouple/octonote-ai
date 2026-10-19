import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { ClosingCta, Faqs } from "../_components/content-page";
import { PricingSection } from "../_components/pricing-section";
import { PricingStructuredData } from "../_components/structured-data";
import { PRICING_FAQS } from "../_data/faqs";

const TITLE = "Pricing — Octonote AI";
const DESCRIPTION =
  "Octonote AI is free to start with every feature. Pro is $10 a month or $100 a year for unlimited notes, canvases, projects and workspaces. Students get Pro free for a year.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    url: "/pricing",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function PricingPage() {
  return (
    <div className="pb-28">
      <PricingStructuredData />
      <PricingSection page />
      <div className="px-4 md:px-8">
        <Faqs faqs={PRICING_FAQS} />
        <ClosingCta title="Your first note is one click away." />
      </div>
    </div>
  );
}
