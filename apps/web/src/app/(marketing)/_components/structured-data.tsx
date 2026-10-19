import { PRO_PRICE, SUPPORT_EMAIL } from "@octonote/shared";
import { JsonLd } from "@/components/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { FOUNDERS, PROFILES } from "../_data/company";
import { FAQS, PRICING_FAQS } from "../_data/faqs";

/**
 * schema.org data for the marketing pages: who we are, the site, the product
 * with its real prices, and the FAQs. Only facts shown on the pages — no
 * ratings.
 */

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  alternateName: "Octonote",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description: SITE_DESCRIPTION,
  email: SUPPORT_EMAIL,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SUPPORT_EMAIL,
  },
  ...(FOUNDERS.length > 0 && {
    founder: FOUNDERS.map((f) => ({
      "@type": "Person",
      name: f.name,
      jobTitle: f.role,
      ...(f.url && { url: f.url }),
    })),
  }),
  ...(PROFILES.length > 0 && { sameAs: PROFILES.map((p) => p.url) }),
};

const website = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  // Google takes the site name shown above results from here.
  name: SITE_NAME,
  alternateName: ["Octonote", "octonote.ai"],
  url: SITE_URL,
  publisher: { "@id": ORGANIZATION_ID },
};

const proOffer = (interval: "month" | "year") => ({
  "@type": "Offer",
  name: interval === "month" ? "Pro (monthly)" : "Pro (yearly)",
  price: String(PRO_PRICE[interval]),
  priceCurrency: "USD",
  priceSpecification: {
    "@type": "UnitPriceSpecification",
    price: String(PRO_PRICE[interval]),
    priceCurrency: "USD",
    unitText: interval === "month" ? "MONTH" : "YEAR",
  },
});

const application = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  publisher: { "@id": ORGANIZATION_ID },
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    proOffer("month"),
    proOffer("year"),
  ],
};

function faqPage(faqs: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function breadcrumbs(name: string, path: string) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

export function HomeStructuredData() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [organization, website, application, faqPage(FAQS)],
      }}
    />
  );
}

export function PricingStructuredData() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          breadcrumbs("Pricing", "/pricing"),
          application,
          faqPage(PRICING_FAQS),
        ],
      }}
    />
  );
}

export function AboutStructuredData() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          breadcrumbs("About", "/about"),
          {
            "@type": "AboutPage",
            url: `${SITE_URL}/about`,
            name: `About ${SITE_NAME}`,
            mainEntity: { "@id": ORGANIZATION_ID },
          },
          organization,
        ],
      }}
    />
  );
}
