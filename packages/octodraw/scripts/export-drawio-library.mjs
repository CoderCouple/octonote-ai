// Renders every entry of a draw.io library (mxlibrary XML, e.g. the OCI
// Architecture Diagram Toolkit's "OCI Library.xml") to SVG with the
// diagrams.net viewer in headless Chrome, cropping off draw.io's label area.
//
//   node scripts/export-drawio-library.mjs <library.xml> <outdir> [limit]
//
// Needs Chrome; set CHROME_PATH if it isn't in the default macOS location.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const [lib, outDir, limit] = process.argv.slice(2);
const xml = readFileSync(lib, 'utf8');
const entries = JSON.parse(/<mxlibrary>([\s\S]*)<\/mxlibrary>/.exec(xml)[1]).slice(0, limit ? Number(limit) : undefined);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.setContent('<html><body><div id="c"></div></body></html>');
await page.addScriptTag({ url: 'https://viewer.diagrams.net/js/viewer-static.min.js' });
await page.waitForFunction(() => typeof window.GraphViewer !== 'undefined' && typeof window.mxUtils !== 'undefined', null, { timeout: 60000 });
let ok = 0;
for (const [i, e] of entries.entries()) {
  const svg = await page.evaluate((data) => {
    try {
      const raw = window.Graph.decompress ? window.Graph.decompress(data) : data;
      const doc = window.mxUtils.parseXml(raw.startsWith('<') ? raw : decodeURIComponent(raw));
      const container = document.getElementById('c');
      container.innerHTML = '';
      const graph = new window.Graph(container);
      new window.mxCodec(doc).decode(doc.documentElement, graph.getModel());
      const node = graph.getSvg('none', 1, 0, true, null, true, null, null, null, false);
      return new XMLSerializer().serializeToString(node);
    } catch (err) {
      return 'ERR ' + err.message;
    }
  }, e.xml);
  if (svg.startsWith('ERR')) { console.log(i, e.title, svg); continue; }
  const name = (e.title ?? `untitled-${i}`).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Library entries reserve space for a label under the square icon; keep just the square.
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const cropped = box && Number(box[2]) > Number(box[1]) * 1.05 ? svg.replace(box[0], `viewBox="0 0 ${box[1]} ${box[1]}"`).replace(/width="[\d.]+px" height="[\d.]+px"/, `width="${box[1]}px" height="${box[1]}px"`) : svg;
  writeFileSync(`${outDir}/${name}.svg`, cropped);
  ok++;
}
console.log(`exported ${ok}/${entries.length}`);
await browser.close();
