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

/**
 * The card for a site page (home, /cli): the brand, a headline and one line
 * on the left, and a picture of the product on the right — the app window
 * (note + diagram side by side) or a terminal.
 */
export async function siteCard({
  title,
  subtitle,
  path,
  visual = "app",
}: {
  title: string;
  subtitle: string;
  path: string;
  visual?: "app" | "terminal";
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: light.background,
        color: light.foreground,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 560,
          padding: "64px 0 60px 64px",
        }}
      >
        <Brand />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: -2.5,
              color: light["foreground-strong"],
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 27,
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
            fontSize: 24,
            fontWeight: 600,
            color: light["foreground-strong"],
          }}
        >
          {`octonote.ai${path === "/" ? "" : path}`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 48,
        }}
      >
        {visual === "terminal" ? <TerminalShot /> : <AppShot />}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** The Octonote AI mark (public/brand-logo-source.svg) and name. */
function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width="52" height="52" viewBox="0 0 120 120">
        <rect
          width="120"
          height="120"
          rx="26"
          fill={light["foreground-strong"]}
        />
        <g
          fill="none"
          stroke={light.background}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M40 32 H32 V40" />
          <path d="M80 32 H88 V40" />
          <path d="M40 88 H32 V80" />
          <path d="M80 88 H88 V80" />
          <circle cx="60" cy="60" r="14" />
        </g>
      </svg>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: -0.5,
          color: light["foreground-strong"],
        }}
      >
        Octonote AI
      </div>
    </div>
  );
}

/** A window's red / yellow / green buttons and its title. */
function TitleBar({ title, dark }: { title: string; dark?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 52,
        padding: "0 20px",
        borderBottom: `2px solid ${dark ? light["terminal-border"] : light.border}`,
      }}
    >
      {(["window-close", "window-minimize", "window-zoom"] as const).map(
        (k) => (
          <div
            key={k}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: light[k],
            }}
          />
        ),
      )}
      <div
        style={{
          marginLeft: 12,
          fontSize: 19,
          color: dark ? light["terminal-muted"] : light["muted-foreground"],
        }}
      >
        {title}
      </div>
    </div>
  );
}

/** The app: a note and its diagram side by side, the way projects look. */
function AppShot() {
  const box = (label: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 150,
        height: 46,
        borderRadius: 10,
        border: `2.5px solid ${light["foreground-strong"]}`,
        background: light.card,
        fontSize: 17,
        fontWeight: 600,
        color: light["foreground-strong"],
      }}
    >
      {label}
    </div>
  );
  const arrow = (
    <div
      style={{
        display: "flex",
        width: 2.5,
        height: 26,
        background: light["muted-foreground"],
      }}
    />
  );
  const line = (w: number) => (
    <div
      style={{
        display: "flex",
        width: `${w}%`,
        height: 10,
        borderRadius: 5,
        background: light.muted,
      }}
    />
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 556,
        height: 440,
        borderRadius: 22,
        border: `2px solid ${light.border}`,
        background: light.card,
        boxShadow: "0 30px 60px rgba(0,0,0,0.12)",
        overflow: "hidden",
      }}
    >
      <TitleBar title="Octonote AI — Rate limiter" />
      <div style={{ display: "flex", flex: 1 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            width: 290,
            padding: "26px 24px",
            borderRight: `2px solid ${light.border}`,
          }}
        >
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: light["foreground-strong"],
            }}
          >
            Rate limiter
          </div>
          <div
            style={{
              fontSize: 17,
              lineHeight: 1.45,
              color: light["muted-foreground"],
            }}
          >
            A token bucket per user: refill r tokens a second, up to a cap.
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 14px",
              borderRadius: 8,
              background: light.muted,
              fontSize: 19,
              fontStyle: "italic",
              color: light["foreground-strong"],
            }}
          >
            tokens = min(cap, t · r)
          </div>
          {line(92)}
          {line(78)}
          {line(85)}
          {line(60)}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 0,
            background: light["surface-subtle"],
          }}
        >
          {box("Request")}
          {arrow}
          {box("Token bucket")}
          {arrow}
          {box("API or 429")}
        </div>
      </div>
    </div>
  );
}

/** A terminal running octonote: black, like the ones on the site. */
function TerminalShot() {
  const rows: [string, string][] = [
    ["# Install", ""],
    ["npm", " i -g https://octonote.ai/cli/octonote-cli.tgz"],
    ["", ""],
    ["# Sign in", ""],
    ["octonote", " login"],
    ["", ""],
    ["# Set up Claude Code", ""],
    ["octonote", " setup claude --skill"],
    ["", ""],
    ["# Create a note from markdown", ""],
    ["octonote", ' note create "Standup" --file standup.md'],
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 556,
        height: 420,
        borderRadius: 22,
        border: `2px solid ${light["terminal-border"]}`,
        background: light.terminal,
        boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
        overflow: "hidden",
      }}
    >
      <TitleBar title="terminal" dark />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "26px 28px",
          gap: 6,
        }}
      >
        {rows.map(([a, b], i) =>
          a.startsWith("#") ? (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 20,
                color: light["terminal-muted"],
              }}
            >
              {a}
            </div>
          ) : a ? (
            <div
              key={i}
              style={{
                display: "flex",
                fontSize: 20,
                whiteSpace: "nowrap",
                color: light["terminal-foreground"],
              }}
            >
              <span
                style={{ fontWeight: 800, color: light["terminal-command"] }}
              >
                {a}
              </span>
              <span>{b.replace(/^ /, "\u00a0")}</span>
            </div>
          ) : (
            <div key={i} style={{ display: "flex", height: 12 }} />
          ),
        )}
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
