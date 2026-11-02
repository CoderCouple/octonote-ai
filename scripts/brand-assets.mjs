// Generates every Octonote logo file from the one octopus in
// packages/shared/src/octopus.ts. Run after changing the octopus:
//   pnpm --filter @octonote/shared build && pnpm brand:assets
// SVGs are written directly; PNGs are rendered in Chrome via Playwright (the
// e2e package's), so this needs `pnpm install` and Google Chrome.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireFrom = (pkg) => createRequire(join(root, pkg, "package.json"));
const { octopusSvg, OCTOPUS_MOODS } = requireFrom("apps/web")("@octonote/shared");
const { chromium } = requireFrom("e2e")("@playwright/test");

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const TILE = "#191919";
const WORDMARK_FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
/** The octopus placed in a box (x, y, size) inside a bigger SVG. */
const placed = (opts, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512">${inner(octopusSvg(opts))}</svg>`;
/** Square tile with the octopus in the middle; `radius` 0 = full bleed (iOS adds its own mask). */
const tile = ({ size, bg = TILE, ink = WHITE, scale = 0.72, radius = 0.22 }) => {
  const s = Math.round(size * scale);
  const o = (size - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * radius}" fill="${bg}"/>${placed({ ink, paper: bg }, o, o + s * 0.02, s)}</svg>`;
};
/** Octopus + "Octonote AI" (the text needs Inter to look right; PNGs are rendered with it). */
const lockup = ({ ink, paper }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196 40" width="196" height="40">${placed({ ink, paper }, 0, 2, 36)}<text x="44" y="27" font-family="${WORDMARK_FONT}" font-size="20" font-weight="700" letter-spacing="-0.4" fill="${ink}">Octonote AI</text></svg>`;
/** Favicon: black octopus, white in dark mode. */
const favicon = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32"><style>.i{fill:#000}.p{fill:#fff}.s{fill:none;stroke:#fff}@media (prefers-color-scheme:dark){.i{fill:#fff}.p{fill:#000}.s{stroke:#000}}</style>${inner(
    octopusSvg({ ink: "INK", paper: "PAPER" }),
  )
    .replace('fill="INK"', 'class="i"')
    .replaceAll('fill="PAPER"', 'class="p"')
    .replaceAll('fill="none" stroke="PAPER"', 'class="s"')}</svg>`;

const files = new Map(); // path → svg (also rendered to the PNGs that name it)
const pngs = []; // [svg, out, width, height, transparent]
const svgFile = (path, svg) => files.set(path, svg);
const png = (svg, path, w, h = w) => pngs.push([svg, path, w, h]);

// Brand page downloads: apps/web/public/brand/
const B = "apps/web/public/brand";
for (const mood of OCTOPUS_MOODS) {
  const black = octopusSvg({ mood, ink: BLACK, paper: WHITE });
  const white = octopusSvg({ mood, ink: WHITE, paper: BLACK });
  svgFile(`${B}/octonote-${mood}-black.svg`, black);
  svgFile(`${B}/octonote-${mood}-white.svg`, white);
  png(black, `${B}/octonote-${mood}-black.png`, 1024);
  png(white, `${B}/octonote-${mood}-white.png`, 1024);
}
svgFile(`${B}/octonote-waiting-black-animated.svg`, octopusSvg({ mood: "waiting", ink: BLACK, paper: WHITE, animate: true }));
svgFile(`${B}/octonote-waiting-white-animated.svg`, octopusSvg({ mood: "waiting", ink: WHITE, paper: BLACK, animate: true }));
const appIcon = tile({ size: 1024 });
svgFile(`${B}/octonote-app-icon.svg`, appIcon);
png(appIcon, `${B}/octonote-app-icon.png`, 1024);
for (const [name, ink, paper] of [["black", BLACK, WHITE], ["white", WHITE, BLACK]]) {
  svgFile(`${B}/octonote-logo-${name}.svg`, lockup({ ink, paper }));
  png(lockup({ ink, paper }), `${B}/octonote-logo-${name}.png`, 196 * 6, 40 * 6);
}

// Web: favicon, the brand PNGs emails and the API's favicon redirect use.
svgFile("apps/web/src/app/icon.svg", favicon());
svgFile("apps/web/public/brand-logo-source.svg", tile({ size: 120 }));
png(tile({ size: 120 }), "apps/web/public/brand-logo-120.png", 120);
png(tile({ size: 512 }), "apps/web/public/brand-logo-512.png", 512);

// Docs (Mintlify).
svgFile("docs/logo/light.svg", lockup({ ink: TILE, paper: WHITE }));
svgFile("docs/logo/dark.svg", lockup({ ink: "#F5F5F4", paper: "#0A0A0B" }));
svgFile("docs/favicon.svg", favicon());

// Mobile (Expo): iOS icon is full bleed (no transparency); Android adaptive
// layers keep the octopus inside the 66% safe zone.
const M = "apps/mobile/assets/images";
png(tile({ size: 1024, radius: 0, scale: 0.66 }), `${M}/icon.png`, 1024);
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${placed({ ink: WHITE, paper: TILE }, 272, 276, 480)}</svg>`, `${M}/android-icon-foreground.png`, 1024);
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${TILE}"/></svg>`, `${M}/android-icon-background.png`, 1024);
// Monochrome: the system tints the alpha, so the face must be see-through.
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><mask id="m"><rect width="1024" height="1024" fill="black"/>${placed({ ink: WHITE, paper: BLACK }, 272, 276, 480)}</mask><rect width="1024" height="1024" fill="${WHITE}" mask="url(#m)"/></svg>`, `${M}/android-icon-monochrome.png`, 1024);
png(tile({ size: 288, bg: "#F5F5F4", ink: "#0A0A0B" }), `${M}/splash-icon-dark.png`, 288);

// ChatGPT plugin listing.
png(tile({ size: 512 }), "integrations/openai-plugin/assets/logo.png", 512);
png(tile({ size: 64 }), "integrations/openai-plugin/assets/composer-icon.png", 64);

for (const [path, svg] of files) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), svg + "\n");
}
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [svg, path, w, h] of pngs) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet"><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  await page.screenshot({ path: join(root, path), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
await browser.close();
console.log(`wrote ${files.size} SVG and ${pngs.length} PNG files`);
