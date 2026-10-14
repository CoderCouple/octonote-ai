import { PRO_PRICE, SUPPORT_EMAIL } from "@octonote/shared";
import { JsonLd } from "@/components/json-ld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { FAQS } from "../_data/faqs";

/**
 * The landing page's schema.org data: who we are, the site, the product with
 * its real prices, and the FAQ. Only facts shown on the page — no ratings.
 */
export function HomeStructuredData() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/icon.svg`,
            email: SUPPORT_EMAIL,
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          {
            "@type": "SoftwareApplication",
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            applicationCategory: "ProductivityApplication",
            operatingSystem: "Web",
            publisher: { "@id": `${SITE_URL}/#organization` },
            offers: [
              {
                "@type": "Offer",
                name: "Free",
                price: "0",
                priceCurrency: "USD",
              },
              {
                "@type": "Offer",
                name: "Pro",
                price: String(PRO_PRICE.month),
                priceCurrency: "USD",
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: String(PRO_PRICE.month),
                  priceCurrency: "USD",
                  unitText: "MONTH",
                },
              },
            ],
          },
          {
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ],
      }}
    />
  );
}
