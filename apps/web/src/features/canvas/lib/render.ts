/**
 * Canvas → PNG without a mounted canvas (thumbnails, figure images, the
 * list backfill): octodraw renders items as SVG, figures straight from
 * their diagram code, then rasterizes it in the browser.
 */
import {
  collectFontCss,
  loadEraserIcons,
  loadFullIconCatalog,
  loadVendorIcons,
  renderCanvasSvg,
  renderSourceSvg,
  svgToPng,
  type CanvasDocument,
  type FigureItem,
  type TextFont,
} from "@octonote/octodraw";
import { EXPORT_THEME } from "./octodraw-theme";

const theme = EXPORT_THEME;

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Measures with the font the SVG renders, so figure layouts match the editor's. */
function measureText(text: string, font: TextFont): number {
  if (measureContext === undefined)
    measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * font.size * 0.55;
  measureContext.font = `${font.weight} ${font.size}px ${theme.font.sans}`;
  return measureContext.measureText(text).width;
}

async function ready() {
  await Promise.all([
    document.fonts?.ready,
    loadFullIconCatalog().catch(() => undefined),
    loadVendorIcons().catch(() => undefined),
    // Figures use octodraw's default icon set (Eraser's artwork).
    loadEraserIcons().catch(() => undefined),
  ]);
}

/** SVG images can't load external URLs once rasterized: inline them as data URLs. */
async function inlineImages(doc: CanvasDocument): Promise<CanvasDocument> {
  const items = await Promise.all(
    doc.items.map(async (item) => {
      if (item.type !== "image" || item.src.startsWith("data:")) return item;
      try {
        const blob = await (await fetch(item.src)).blob();
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return { ...item, src };
      } catch {
        return item;
      }
    }),
  );
  return { ...doc, items };
}

/** `title`: false on the canvas, where the title is drawn above the figure's border. */
function figureSvg(item: FigureItem, title = true) {
  return renderSourceSvg(item.source, {
    theme,
    measureText,
    placements: item.placements,
    title,
    iconSet: "eraser",
  });
}

/** The canvas (or some of its items) as a PNG at most `maxWidth` pixels wide. */
export async function renderCanvasPng(
  doc: CanvasDocument,
  { ids, maxWidth }: { ids?: string[]; maxWidth: number },
): Promise<Blob | null> {
  const wanted = ids ? new Set(ids) : null;
  const items = wanted ? doc.items.filter((i) => wanted.has(i.id)) : doc.items;
  if (items.length === 0) return null;
  await ready();
  const figureSvgs = new Map<string, string>();
  for (const item of items) {
    if (item.type !== "figure") continue;
    try {
      figureSvgs.set(item.id, (await figureSvg(item, false)).svg);
    } catch {
      // A figure whose code doesn't lay out is drawn as its empty frame.
    }
  }
  const fontCss = await collectFontCss([theme.font.sans, theme.font.mono]).catch(
    () => "",
  );
  const { svg, width, height } = renderCanvasSvg(await inlineImages(doc), {
    theme,
    figureSvgs,
    fontCss,
    ids,
    iconSet: "eraser",
  });
  return svgToPng(svg, width, height, Math.min(2, maxWidth / Math.max(1, width)));
}

/** One figure's diagram as a PNG (what notes embed), with its natural size. */
export async function renderFigurePng(
  item: FigureItem,
  maxWidth: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  await ready();
  const rendered = await figureSvg(item);
  const fontCss = await collectFontCss([theme.font.sans, theme.font.mono]).catch(
    () => "",
  );
  // Embed the fonts so the picture uses Inter, not a fallback.
  const svg = fontCss
    ? rendered.svg.replace(/^(<svg[^>]*>)/, `$1<style>${fontCss}</style>`)
    : rendered.svg;
  const blob = await svgToPng(
    svg,
    rendered.width,
    rendered.height,
    Math.min(2, maxWidth / Math.max(1, rendered.width)),
  );
  return { blob, width: rendered.width, height: rendered.height };
}
