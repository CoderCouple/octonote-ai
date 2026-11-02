import { OCTOPUS_MOOD_INFO, OCTOPUS_MOODS, type OctopusMood } from "@octonote/shared";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { OctopusMark } from "@/components/octopus-mark";
import { SITE_NAME } from "@/lib/site";

const TITLE = "Octonote AI brand assets";
const DESCRIPTION =
  "The Octonote AI octopus logo in black and white, its moods, the app icon and the logo with the name, as SVG and PNG.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/brand" },
  openGraph: { type: "website", url: "/brand", siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/** Files made by `pnpm brand:assets` (scripts/brand-assets.mjs) in public/brand. */
const file = (name: string) => `/brand/${name}`;

function Downloads({ name, png = true }: { name: string; png?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <DownloadLink href={file(`${name}.svg`)} label="SVG" />
      {png ? <DownloadLink href={file(`${name}.png`)} label="PNG" /> : null}
    </div>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="hover:bg-accent text-foreground-strong inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors"
    >
      <Download className="size-3.5" aria-hidden />
      {label}
    </a>
  );
}

/**
 * A light or dark swatch showing the mark as it ships. The logo files are
 * pure black and white whatever the site theme, so these don't use tokens.
 */
function Swatch({ dark, children, className = "" }: { dark?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid place-items-center rounded-xl border ${dark ? "border-transparent bg-black text-white" : "bg-white text-black"} ${className}`}
    >
      {children}
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-20 max-w-5xl">
      <h2 className="text-foreground-strong text-2xl font-bold md:text-3xl">{title}</h2>
      <p className="text-muted-foreground mt-3 max-w-2xl text-lg">{body}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function MoodCard({ mood }: { mood: OctopusMood }) {
  const info = OCTOPUS_MOOD_INFO[mood];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-4">
      <div className="grid grid-cols-2 gap-2">
        <Swatch className="h-32">
          <OctopusMark mood={mood} className="size-20" paper="white" />
        </Swatch>
        <Swatch dark className="h-32">
          <OctopusMark mood={mood} className="size-20" paper="black" />
        </Swatch>
      </div>
      <div>
        <h3 className="text-foreground-strong font-semibold">{info.name}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{info.use}</p>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted-foreground">Black (for light backgrounds)</span>
        <Downloads name={`octonote-${mood}-black`} />
        <span className="text-muted-foreground mt-1">White (for dark backgrounds)</span>
        <Downloads name={`octonote-${mood}-white`} />
        {mood === "waiting" ? (
          <a href={file("octonote-waiting-black-animated.svg")} download className="text-foreground-strong mt-1 underline underline-offset-4">
            Animated SVG (dots pulse)
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function BrandPage() {
  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <header className="mx-auto max-w-5xl">
        <p className="text-muted-foreground text-lg font-medium">Brand</p>
        <h1 className="text-foreground-strong mt-5 text-4xl leading-[1.1] font-bold md:text-6xl">
          Brand assets
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-xl leading-relaxed">
          The Octonote AI octopus and everything made from it. Use them to link to us, write about us or show
          that your work lives in Octonote.
        </p>
      </header>

      <Section
        title="Logo"
        body="The octopus with our name. Black on light backgrounds, white on dark ones."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(["black", "white"] as const).map((tone) => (
            <div key={tone} className="flex flex-col gap-3">
              <Swatch dark={tone === "white"} className="h-44">
                <span className="flex items-center gap-3">
                  <OctopusMark className="size-12" paper={tone === "white" ? "black" : "white"} />
                  <span className="text-3xl font-bold tracking-tight">Octonote AI</span>
                </span>
              </Swatch>
              <Downloads name={`octonote-logo-${tone}`} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="The octopus"
        body="The mark on its own, for avatars, favicons and anywhere the name is already nearby."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {(["black", "white"] as const).map((tone) => (
            <div key={tone} className="flex flex-col gap-3">
              <Swatch dark={tone === "white"} className="h-56">
                <OctopusMark className="size-36" paper={tone === "white" ? "black" : "white"} />
              </Swatch>
              <Downloads name={`octonote-happy-${tone}`} />
            </div>
          ))}
          <div className="flex flex-col gap-3">
            <div className="bg-muted grid h-56 place-items-center rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file("octonote-app-icon.svg")} alt="Octonote AI app icon" className="size-36" />
            </div>
            <Downloads name="octonote-app-icon" />
          </div>
        </div>
      </Section>

      <Section
        title="Moods"
        body="The same octopus with a different face, for the moments in between: loading, errors and empty or offline screens."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OCTOPUS_MOODS.map((mood) => (
            <MoodCard key={mood} mood={mood} />
          ))}
        </div>
      </Section>

      <Section title="Using the logo" body="A few simple rules keep it looking right.">
        <ul className="text-foreground grid gap-3 text-base md:grid-cols-2">
          {[
            "Black octopus on light backgrounds, white on dark. No other colours.",
            "Leave space around it: at least half the octopus's width on every side.",
            "Don't stretch, rotate, outline or add effects to it.",
            "Keep it at 16 px or larger.",
            "Use the moods only for their moment; the logo is always the default face.",
            "Write the name as “Octonote AI”.",
          ].map((rule) => (
            <li key={rule} className="rounded-xl border px-4 py-3">
              {rule}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
