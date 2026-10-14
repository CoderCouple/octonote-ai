/**
 * The link-preview image (Open Graph / X card) for a published page:
 * 1200×630, light theme, title + kind + author, and the canvas picture
 * when there is one (a canvas, a project's canvas, a notebook's first few).
 */
import { light } from "@octonote/design-tokens";
import { previewFromMarkdown } from "@octonote/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PublicView } from "@/features/public/types";
import { publicTitle } from "@/features/public/types";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const KIND_LABEL = {
  page: "Note",
  canvas: "Canvas",
  project: "Project",
  notebook: "Notebook",
} as const;

// Inter, the site's font (Satori reads woff, not woff2), loaded once per server.
let fontsPromise: Promise<
  { name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[]
> | null = null;
function fonts() {
  fontsPromise ??= Promise.all(
    (
      [
        ["Inter-Regular.woff", 400],
        ["Inter-SemiBold.woff", 600],
        ["Inter-ExtraBold.woff", 800],
      ] as const
    ).map(async ([file, weight]) => ({
      name: "Inter",
      data: await readFile(join(process.cwd(), "assets/fonts", file)),
      weight,
      style: "normal" as const,
    })),
  );
  return fontsPromise;
}

/** Fetch a picture up front so one broken URL can't fail the whole card. */
async function inline(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function minutesOf(md: string) {
  const words = md.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function ogCard(view: PublicView | null) {
  if (!view) return notFoundCard();
  const r = view.resource;
  const title = clip(publicTitle(r) || "Untitled", 90);
  const author = view.byline.author?.name ?? null;

  let detail: string | null = null;
  let excerpt: string | null = null;
  let pictures: string[] = [];
  if (r.kind === "page") {
    detail = `${minutesOf(r.contentMd)} min read`;
    excerpt = previewFromMarkdown(r.contentMd, r.title, 200) || null;
  } else if (r.kind === "canvas") {
    pictures = [await inline(r.thumbnailUrl)].filter(Boolean) as string[];
  } else if (r.kind === "project") {
    detail = r.note ? `${minutesOf(r.note.contentMd)} min read` : null;
    excerpt = r.description;
    pictures = [await inline(r.canvas?.thumbnailUrl)].filter(
      Boolean,
    ) as string[];
  } else {
    detail = `${r.items.length} ${r.items.length === 1 ? "item" : "items"}`;
    const withPictures = r.items
      .filter((i) => i.thumbnailUrl)
      .slice(0, 3)
      .map((i) => inline(i.thumbnailUrl));
    pictures = (await Promise.all(withPictures)).filter(Boolean) as string[];
  }
  const byline = [author, detail].filter(Boolean).join(" · ");
  const hasPicture = pictures.length > 0;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: light.background,
        color: light.foreground,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Brand />
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: light["muted-foreground"],
          }}
        >
          {KIND_LABEL[r.kind]}
        </div>
      </div>

      <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: hasPicture ? 60 : 72,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -2,
              color: light["foreground-strong"],
            }}
          >
            {title}
          </div>
          {excerpt && !hasPicture ? (
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.45,
                color: light["muted-foreground"],
              }}
            >
              {clip(excerpt, 160)}
            </div>
          ) : null}
        </div>
        {hasPicture ? <Pictures sources={pictures} /> : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${light.border}`,
          paddingTop: 28,
          fontSize: 26,
          color: light["muted-foreground"],
        }}
      >
        <div style={{ display: "flex", color: light["foreground-strong"] }}>
          {byline || "Published on Octonote AI"}
        </div>
        <div style={{ display: "flex" }}>octonote.ai</div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** The card for a site page (home, /cli): headline, one line under it, the URL. */
export async function siteCard({
  title,
  subtitle,
  path,
}: {
  title: string;
  subtitle: string;
  path: string;
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: light.background,
        color: light.foreground,
      }}
    >
      <Brand />
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2.5,
            color: light["foreground-strong"],
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 32,
            lineHeight: 1.4,
            color: light["muted-foreground"],
          }}
        >
          {subtitle}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: `2px solid ${light.border}`,
          paddingTop: 28,
          fontSize: 26,
          color: light["muted-foreground"],
        }}
      >
        {`octonote.ai${path === "/" ? "" : path}`}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: light["foreground-strong"],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            border: `3px solid ${light.background}`,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: light["foreground-strong"],
        }}
      >
        Octonote AI
      </div>
    </div>
  );
}

/** One canvas picture, or up to three fanned out for a notebook. */
function Pictures({ sources }: { sources: string[] }) {
  const frame = {
    display: "flex",
    background: light.card,
    border: `2px solid ${light.border}`,
    borderRadius: 20,
    padding: 12,
  } as const;
  if (sources.length === 1) {
    return (
      <div style={{ ...frame, width: 500, height: 330 }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img
          src={sources[0]}
          width={476}
          height={306}
          style={{ objectFit: "contain" }}
        />
      </div>
    );
  }
  return (
    <div
      style={{ display: "flex", position: "relative", width: 500, height: 330 }}
    >
      {sources.map((src, i) => (
        <div
          key={i}
          style={{
            ...frame,
            position: "absolute",
            left: i * 70,
            top: i * 40,
            width: 360,
            height: 240,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img
            src={src}
            width={336}
            height={216}
            style={{ objectFit: "contain" }}
          />
        </div>
      ))}
    </div>
  );
}

async function notFoundCard() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: light.background,
      }}
    >
      <Brand />
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}
