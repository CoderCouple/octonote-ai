import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME } from "@/lib/site";
import {
  ClosingCta,
  ContentHero,
  ContentJsonLd,
  Faqs,
  Points,
} from "../../_components/content-page";
import {
  COMPARISONS,
  findComparison,
  type Cell,
} from "../../_data/comparisons";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = findComparison((await params).slug);
  if (!c) return {};
  const path = `/vs/${c.slug}`;
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: SITE_NAME,
      title: c.title,
      description: c.description,
    },
    twitter: {
      card: "summary_large_image",
      title: c.title,
      description: c.description,
    },
  };
}

function CellValue({ value }: { value: Cell }) {
  if (value === true)
    return <Check aria-label="Yes" className="text-foreground-strong size-5" />;
  if (value === false)
    return <Minus aria-label="No" className="text-foreground-subtle size-5" />;
  return <span>{value}</span>;
}

export default async function ComparisonPage({ params }: Params) {
  const c = findComparison((await params).slug);
  if (!c) notFound();
  const path = `/vs/${c.slug}`;

  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <ContentJsonLd
        path={path}
        name={`Octonote AI vs ${c.name}`}
        section={{ name: "Compare", path: "/vs" }}
        faqs={c.faqs}
      />
      <ContentHero
        eyebrow={`Octonote AI vs ${c.name}`}
        title={c.h1}
        intro={c.intro}
      />

      <section className="mx-auto mt-24 max-w-5xl">
        <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">
          Side by side
        </h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[560px] text-left text-base">
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="px-5 py-4 font-medium">
                  &nbsp;
                </th>
                <th
                  scope="col"
                  className="text-foreground-strong px-5 py-4 font-semibold"
                >
                  Octonote AI
                </th>
                <th
                  scope="col"
                  className="text-foreground-strong px-5 py-4 font-semibold"
                >
                  {c.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.feature} className="border-t align-top">
                  <th
                    scope="row"
                    className="text-foreground-strong px-5 py-4 font-medium"
                  >
                    {r.feature}
                  </th>
                  <td className="text-muted-foreground px-5 py-4">
                    <CellValue value={r.us} />
                  </td>
                  <td className="text-muted-foreground px-5 py-4">
                    <CellValue value={r.them} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">
          {c.name} details checked {c.checked} from{" "}
          {c.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 ? ", " : ""}
              <a
                href={s.url}
                target="_blank"
                rel="noopener nofollow"
                className="underline underline-offset-4"
              >
                {s.label}
              </a>
            </span>
          ))}
          . Prices are monthly unless noted.
        </p>
      </section>

      <Points title="What's different in Octonote AI" points={c.differences} />

      <section className="mx-auto mt-28 grid max-w-5xl gap-6 md:grid-cols-2">
        {[
          { title: "Choose Octonote AI if…", items: c.chooseUs },
          { title: `Choose ${c.name} if…`, items: c.chooseThem },
        ].map((col) => (
          <div key={col.title} className="bg-card rounded-2xl border p-8">
            <h2 className="text-foreground-strong text-2xl font-bold">
              {col.title}
            </h2>
            <ul className="text-muted-foreground mt-5 list-disc space-y-3 pl-5 text-lg">
              {col.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Faqs faqs={c.faqs} />

      <p className="text-muted-foreground mx-auto mt-16 max-w-3xl text-center text-lg">
        See real pages made with Octonote AI in the{" "}
        <Link
          href="/#examples"
          className="text-foreground-strong underline underline-offset-4"
        >
          examples
        </Link>
        , or compare with{" "}
        {COMPARISONS.filter((o) => o.slug !== c.slug).map((o, i) => (
          <span key={o.slug}>
            {i > 0 ? ", " : ""}
            <Link
              href={`/vs/${o.slug}`}
              className="text-foreground-strong underline underline-offset-4"
            >
              {o.name}
            </Link>
          </span>
        ))}
        .
      </p>

      <ClosingCta title={`Try it next to ${c.name}.`} />
    </div>
  );
}
