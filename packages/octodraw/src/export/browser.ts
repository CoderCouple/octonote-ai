// Browser-only export helpers: PNG via canvas, PDF via jsPDF + svg2pdf.js
// (loaded on demand), web fonts embedded so files render like the screen,
// downloads and clipboard.

/**
 * @font-face rules for the given families, with their (Latin) font files
 * inlined as data URLs, so an exported SVG/PNG keeps its typography outside the
 * page. Best effort: cross-origin stylesheets and fonts are skipped.
 */
export async function collectFontCss(families: string[]): Promise<string> {
  if (typeof document === 'undefined') return '';
  const wanted = new Set(families.flatMap((f) => f.split(',')).map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase()));
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '').toLowerCase();
      const range = rule.style.getPropertyValue('unicode-range');
      // Only the Latin subset, to keep files small. Browsers normalize "U+0000-00FF" to "U+0-FF".
      if (wanted.has(family) && (!range || /U\+0+-0*FF(?![0-9A-F])/i.test(range))) rules.push(rule);
    }
  }
  const css = await Promise.all(
    rules.map(async (rule) => {
      const match = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'));
      if (!match) return '';
      try {
        const response = await fetch(new URL(match[1]!, rule.parentStyleSheet?.href ?? location.href));
        const dataUrl = await blobToDataUrl(await response.blob());
        const descriptors = ['font-family', 'font-style', 'font-weight', 'font-display', 'unicode-range']
          .map((p) => [p, rule.style.getPropertyValue(p)] as const)
          .filter(([, v]) => v)
          .map(([p, v]) => `${p}:${v}`)
          .join(';');
        return `@font-face{${descriptors};src:url(${dataUrl})}`;
      } catch {
        return '';
      }
    }),
  );
  return css.join('');
}

export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not rasterize the diagram'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A TrueType font to embed in PDF exports (jsPDF only embeds TTF, not the WOFF2 web fonts). */
export interface PdfFont {
  /** The family name as the SVG uses it, e.g. "Inter Variable" (the first name in theme.font.sans). */
  family: string;
  url: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

let pdfFonts: PdfFont[] = [];
const fontData = new Map<string, Promise<string>>();

/**
 * Fonts PDF exports embed, so text keeps the diagram's typeface instead of
 * falling back to Helvetica. Call once at startup; files are fetched on the
 * first PDF export.
 */
export function registerPdfFonts(fonts: PdfFont[]): void {
  pdfFonts = fonts;
}

/** The style key svg2pdf looks fonts up by (it combines style and weight this way). */
const styleKey = (weight = 400, style: 'normal' | 'italic' = 'normal') => (weight === 400 ? (style === 'italic' ? 'italic' : 'normal') : weight === 700 && style === 'normal' ? 'bold' : `${weight === 700 ? 'bold' : weight}${style}`);

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function svgToPdf(svg: string, width: number, height: number, options: { fonts?: PdfFont[] } = {}): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const fonts = options.fonts ?? pdfFonts;
  // Fetch (once) every registered font; a font that fails to load just falls back.
  const loaded = await Promise.all(
    fonts.map(async (font) => {
      let data = fontData.get(font.url);
      if (!data) {
        data = fetch(font.url).then(async (r) => {
          if (!r.ok) throw new Error(`${font.url}: ${r.status}`);
          return base64(await r.arrayBuffer());
        });
        fontData.set(font.url, data);
        data.catch(() => fontData.delete(font.url));
      }
      return data.then((b64) => ({ font, b64 })).catch(() => null);
    }),
  );
  const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as SVGElement;
  // svg2pdf measures with the live DOM, so attach the element briefly.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  host.appendChild(element);
  document.body.appendChild(host);
  try {
    const pdf = new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });
    // One virtual file per font URL (a file registered under several weights is embedded once).
    const files = new Map<string, string>();
    for (const entry of loaded) {
      if (!entry) continue;
      let file = files.get(entry.font.url);
      if (!file) {
        file = `octodraw-font-${files.size}.ttf`;
        files.set(entry.font.url, file);
        pdf.addFileToVFS(file, entry.b64);
      }
      pdf.addFont(file, entry.font.family, styleKey(entry.font.weight, entry.font.style));
    }
    await svg2pdf(element, pdf, { x: 0, y: 0, width, height });
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyBlob(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Link / Markdown / HTML snippets for sharing a diagram hosted at `url` (with an optional preview image). */
export function embedSnippets({ url, imageUrl, title = 'Diagram' }: { url: string; imageUrl?: string; title?: string }): { link: string; markdown: string; html: string } {
  const safeTitle = title.replace(/[[\]]/g, '');
  const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return {
    link: url,
    markdown: imageUrl ? `[![${safeTitle}](${imageUrl})](${url})` : `[${safeTitle}](${url})`,
    html: imageUrl ? `<a href="${attr(url)}"><img src="${attr(imageUrl)}" alt="${attr(title)}" /></a>` : `<a href="${attr(url)}">${attr(title)}</a>`,
  };
}
