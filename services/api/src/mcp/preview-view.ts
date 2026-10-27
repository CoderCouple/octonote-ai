/**
 * The inline Octonote card for MCP Apps hosts (Claude, ChatGPT, and any client
 * that renders `ui://` resources). One self-contained page: it does the
 * MCP Apps handshake over postMessage, renders the tool result's
 * `structuredContent.preview` (an ItemPreview) and reports its height. Notes
 * render as HTML with mermaid diagrams and KaTeX math (both from jsdelivr,
 * declared in the resource's CSP); canvases show their snapshot.
 *
 * Note HTML is produced by our own server from the note's blocks, but it
 * holds user-written text, so it's still sanitised here (no scripts, no
 * event handlers, no javascript: links) before it's inserted.
 */

export const PREVIEW_URI = "ui://octonote/preview";
export const PREVIEW_MIME = "text/html;profile=mcp-app";
export const MERMAID_VERSION = "12.1.0";
export const KATEX_VERSION = "0.19.0";
const CDN = "https://cdn.jsdelivr.net";

export function previewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="${CDN}/npm/katex@${KATEX_VERSION}/dist/katex.min.css" />
<style>
  :root { --bg:#ffffff; --ink:#37352f; --strong:#191919; --muted:#787774; --line:#e9e9e7; --tint:#f7f7f5; --link:#2f6fd6; color-scheme: light; }
  :root[data-theme="dark"] { --bg:#191919; --ink:#d4d4d2; --strong:#f5f5f4; --muted:#9b9a97; --line:#2f2f2f; --tint:#232323; --link:#7aa7f0; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { padding: 14px 16px 16px; }
  .head { display: flex; align-items: center; gap: 10px; }
  .mark { width: 26px; height: 26px; border-radius: 7px; background: var(--strong); color: var(--bg); display: grid; place-items: center; flex: none; }
  .title { font-weight: 650; color: var(--strong); font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind { color: var(--muted); font-size: 12.5px; }
  .actions { margin-left: auto; display: flex; gap: 8px; flex: none; }
  .btn { appearance: none; border: 1px solid var(--line); background: var(--bg); color: var(--strong); border-radius: 8px; padding: 6px 11px; font: 600 13px Inter, system-ui, sans-serif; cursor: pointer; text-decoration: none; }
  .btn.primary { background: var(--strong); color: var(--bg); border-color: var(--strong); }
  .body { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
  .note { max-height: 520px; overflow: auto; }
  :root[data-mode="fullscreen"] .note { max-height: none; }
  :root[data-mode="fullscreen"] .card { max-width: 980px; margin: 0 auto; }
  .board { display: block; width: 100%; height: auto; max-height: 560px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
  :root[data-mode="fullscreen"] .board { max-height: none; }
  .board text { font: 15px Inter, ui-sans-serif, system-ui, sans-serif; fill: var(--strong); }
  .board .alab { font-size: 13px; fill: var(--muted); }
  .board .link { cursor: pointer; }
  .note h1 { font-size: 22px; margin: .4em 0 .3em; color: var(--strong); }
  .note h2 { font-size: 18px; margin: .9em 0 .3em; color: var(--strong); }
  .note h3 { font-size: 16px; margin: .8em 0 .2em; color: var(--strong); }
  .note p { margin: .35em 0; }
  .note ul, .note ol { padding-left: 1.4em; margin: .3em 0; }
  .note li > p { margin: .1em 0; display: inline; }
  .note li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.3em; }
  .note input[type=checkbox] { margin-right: 8px; pointer-events: none; }
  .note a { color: var(--link); }
  .note code { background: var(--tint); border-radius: 5px; padding: .1em .35em; font: 13px ui-monospace, "JetBrains Mono", Menlo, monospace; }
  .note pre { background: var(--tint); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; overflow: auto; }
  .note pre code { background: none; padding: 0; }
  .note blockquote { border-left: 3px solid var(--line); margin: .5em 0; padding-left: 12px; color: var(--muted); }
  .note table { border-collapse: collapse; margin: .5em 0; }
  .note th, .note td { border: 1px solid var(--line); padding: 5px 9px; text-align: left; }
  .note img { max-width: 100%; border-radius: 8px; }
  .diagram { border: 1px solid var(--line); border-radius: 10px; padding: 10px; overflow: auto; text-align: center; margin: .5em 0; }
  .shot { display: block; width: 100%; border: 1px solid var(--line); border-radius: 10px; background: var(--tint); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 560px) { .split { grid-template-columns: 1fr; } .actions .btn:not(.primary) { display: none; } }
  .empty { color: var(--muted); font-size: 14px; padding: 18px; text-align: center; border: 1px dashed var(--line); border-radius: 10px; }
  .items { list-style: none; margin: 0; padding: 0; }
  .items li { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .items li:last-child { border-bottom: 0; }
  .items .k { color: var(--muted); width: 64px; flex: none; font-size: 13px; }
  .items a { color: var(--strong); text-decoration: none; }
  .loading { color: var(--muted); padding: 18px 16px; font-size: 14px; }
</style>
</head>
<body>
<div id="root"><div class="loading">Loading from Octonote…</div></div>
<script>
(function () {
  "use strict";
  var MERMAID = "${CDN}/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs";
  var KATEX = "${CDN}/npm/katex@${KATEX_VERSION}/dist/katex.min.js";
  var nextId = 1, pending = {};
  var KIND = { note: "Note", canvas: "Canvas", project: "Project · note + canvas", notebook: "Notebook" };
  var MARK = '<svg width="16" height="16" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7H7v2"/><path d="M23 7h2v2"/><path d="M9 25H7v-2"/><path d="M23 25h2v-2"/><circle cx="16" cy="16" r="3.5"/></svg>';

  function post(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params || {} }); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { try { var x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch (e) { return null; } }

  /** Keep the note's markup, drop anything that could run code. */
  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    var root = doc.body.firstChild;
    root.querySelectorAll("script,style,iframe,object,embed,link,meta,form,base").forEach(function (n) { n.remove(); });
    root.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var name = a.name.toLowerCase();
        if (name.indexOf("on") === 0 || name === "style" || name === "srcdoc") el.removeAttribute(a.name);
        else if ((name === "href" || name === "src") && !safeUrl(a.value)) el.removeAttribute(a.name);
      });
      if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
    });
    return root.innerHTML;
  }

  function open(url) {
    var u = safeUrl(url); if (!u) return;
    request("ui/open-link", { url: u }).catch(function () { window.open(u, "_blank", "noopener"); });
  }

  function head(p) {
    var pub = p.publicUrl ? '<button class="btn" data-open="' + esc(p.publicUrl) + '">Public page</button>' : "";
    return '<div class="head"><span class="mark">' + MARK + '</span><div style="min-width:0"><div class="title">' + esc(p.title) +
      '</div><div class="kind">' + esc(KIND[p.kind] || p.kind) + (p.publicUrl ? " · Published" : "") + '</div></div>' +
      '<div class="actions">' + (canFullscreen ? '<button class="btn" data-mode-toggle>' + (mode === "fullscreen" ? "Collapse" : "Expand") + "</button>" : "") +
      pub + '<button class="btn primary" data-open="' + esc(p.url) + '">Open in Octonote</button></div></div>';
  }
  // tldraw colour names → strokes and soft fills (light/dark aware via CSS vars where it matters).
  var COLORS = { black: "var(--strong)", grey: "#9b9a97", "light-violet": "#c8a2f0", violet: "#8f4cd6", blue: "#2f6fd6", "light-blue": "#4ba1f1",
    yellow: "#f1ac4b", orange: "#e16919", green: "#099268", "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131", white: "#ffffff" };
  function strokeOf(c) { return COLORS[c] || "var(--strong)"; }
  function fillOf(sh) {
    if (sh.kind === "note") return sh.color === "black" ? "#fef3c7" : "color-mix(in srgb, " + strokeOf(sh.color) + " 22%, var(--bg))";
    if (sh.fill === "none") return "none";
    if (sh.fill === "solid" || sh.fill === "fill") return "color-mix(in srgb, " + strokeOf(sh.color) + " 30%, var(--bg))";
    return "color-mix(in srgb, " + strokeOf(sh.color) + " 10%, var(--bg))";
  }
  var FONT = { s: 15, m: 18, l: 22, xl: 30 };

  /** Wrap a label into lines that fit roughly in the given width. */
  function wrap(text, width, size) {
    var max = Math.max(4, Math.floor(width / (size * 0.56)));
    var out = [];
    String(text).split("\\n").forEach(function (para) {
      var line = "";
      para.split(/\\s+/).forEach(function (w) {
        if ((line + " " + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + " " + w).trim();
      });
      out.push(line);
    });
    return out;
  }
  function textBlock(label, cx, cy, width, size, cls) {
    if (!label) return "";
    var lines = wrap(label, width, size), lh = size * 1.25, top = cy - (lines.length - 1) * lh / 2;
    return '<text text-anchor="middle" dominant-baseline="middle"' + (cls ? ' class="' + cls + '"' : "") + ' style="font-size:' + size + 'px">' +
      lines.map(function (l, i) { return '<tspan x="' + cx + '" y="' + (top + i * lh) + '">' + esc(l) + "</tspan>"; }).join("") + "</text>";
  }
  function geoPath(sh) {
    var x = sh.x, y = sh.y, w = sh.w, h = sh.h, cx = x + w / 2, cy = y + h / 2;
    switch (sh.geo) {
      case "ellipse": case "oval": case "cloud":
        return sh.geo === "oval" ? '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) / 2 + '"/>'
          : '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + w / 2 + '" ry="' + h / 2 + '"/>';
      case "diamond": return '<polygon points="' + cx + "," + y + " " + (x + w) + "," + cy + " " + cx + "," + (y + h) + " " + x + "," + cy + '"/>';
      case "triangle": return '<polygon points="' + cx + "," + y + " " + (x + w) + "," + (y + h) + " " + x + "," + (y + h) + '"/>';
      case "hexagon": { var q = w / 4; return '<polygon points="' + (x + q) + "," + y + " " + (x + w - q) + "," + y + " " + (x + w) + "," + cy + " " + (x + w - q) + "," + (y + h) + " " + (x + q) + "," + (y + h) + " " + x + "," + cy + '"/>'; }
      default: return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (sh.kind === "note" ? 4 : 8) + '"/>';
    }
  }
  function drawOutline(o, title) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    o.shapes.forEach(function (s) { grow(s.x, s.y - (s.kind === "frame" ? 24 : 0)); grow(s.x + s.w, s.y + s.h); });
    o.arrows.forEach(function (a) { grow(a.x1, a.y1); grow(a.x2, a.y2); });
    var pad = 24; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    var w = maxX - minX, h = maxY - minY;
    var parts = ['<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>'];
    o.shapes.forEach(function (sh) {
      var size = FONT[sh.size] || 16, stroke = strokeOf(sh.color);
      if (sh.kind === "text") { parts.push(textBlock(sh.label, sh.x + sh.w / 2, sh.y + sh.h / 2, Math.max(sh.w, 80), size)); return; }
      if (sh.kind === "frame") {
        parts.push('<rect x="' + sh.x + '" y="' + sh.y + '" width="' + sh.w + '" height="' + sh.h + '" rx="6" fill="none" stroke="var(--line)" stroke-width="1.5"/>');
        if (sh.label) parts.push('<text x="' + sh.x + '" y="' + (sh.y - 8) + '" class="alab">' + esc(sh.label) + "</text>");
        return;
      }
      var dash = sh.dash === "dashed" ? ' stroke-dasharray="8 6"' : sh.dash === "dotted" ? ' stroke-dasharray="2 5"' : "";
      var link = sh.url && safeUrl(sh.url);
      parts.push('<g' + (link ? ' class="link" data-open="' + esc(link) + '"' : "") + ' fill="' + fillOf(sh) + '" stroke="' + stroke + '" stroke-width="2"' + dash + ">" + geoPath(sh) + "</g>");
      if (sh.geo !== "none") parts.push(textBlock(sh.label, sh.x + sh.w / 2, sh.y + sh.h / 2, sh.w - 16, size));
    });
    o.arrows.forEach(function (a) {
      var stroke = strokeOf(a.color), mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2;
      var len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1, nx = -(a.y2 - a.y1) / len, ny = (a.x2 - a.x1) / len;
      var cx = mx + nx * a.bend * 2, cy = my + ny * a.bend * 2;
      var d = a.bend ? "M" + a.x1 + " " + a.y1 + " Q" + cx + " " + cy + " " + a.x2 + " " + a.y2 : "M" + a.x1 + " " + a.y1 + " L" + a.x2 + " " + a.y2;
      var dash = a.dash === "dashed" ? ' stroke-dasharray="8 6"' : a.dash === "dotted" ? ' stroke-dasharray="2 5"' : "";
      parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="2"' + dash +
        (a.end !== "none" ? ' marker-end="url(#ah)"' : "") + (a.start !== "none" ? ' marker-start="url(#ah)"' : "") + "/>");
      if (a.label) {
        var lx = a.bend ? (mx + cx) / 2 : mx, ly = a.bend ? (my + cy) / 2 : my, lw = a.label.length * 7.5 + 12;
        parts.push('<rect x="' + (lx - lw / 2) + '" y="' + (ly - 11) + '" width="' + lw + '" height="22" rx="4" fill="var(--bg)"/>');
        parts.push(textBlock(a.label, lx, ly, lw, 13, "alab"));
      }
    });
    return '<svg class="board" role="img" aria-label="Canvas: ' + esc(title) + '" viewBox="' + minX + " " + minY + " " + w + " " + h + '" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:' + w + "/" + h + '">' + parts.join("") + "</svg>";
  }

  function shot(p) {
    if (p.outline && (p.outline.shapes.length || p.outline.arrows.length)) return drawOutline(p.outline, p.title);
    var src = p.thumbnailUrl && safeUrl(p.thumbnailUrl);
    return src ? '<img class="shot" alt="Canvas: ' + esc(p.title) + '" src="' + esc(src) + '" />'
               : '<div class="empty">Open the canvas to see the drawing.</div>';
  }

  var last = null, mode = "inline", canFullscreen = false;
  function setMode(m) {
    if (!m || m === mode) return;
    mode = m; document.documentElement.dataset.mode = m;
    if (last) render(last);
  }
  function render(p) {
    last = p;
    var body = "";
    if (p.kind === "note") body = '<div class="note">' + (p.html ? sanitize(p.html) : '<p class="kind">This note is empty.</p>') + "</div>";
    else if (p.kind === "canvas") body = shot(p);
    else if (p.kind === "project") body = '<div class="split"><div class="note">' + (p.html ? sanitize(p.html) : '<p class="kind">No write-up yet.</p>') + "</div><div>" + shot(p) + "</div></div>";
    else if (p.kind === "notebook") {
      var items = p.items || [];
      body = items.length ? '<ul class="items">' + items.map(function (i) {
        return '<li><span class="k">' + esc(i.kind) + '</span><a href="#" data-open="' + esc(i.url) + '">' + esc(i.title) + "</a></li>";
      }).join("") + "</ul>" : '<div class="empty">This notebook is empty.</div>';
    }
    document.getElementById("root").innerHTML = '<div class="card">' + head(p) + '<div class="body">' + body + "</div></div>";
    enhance();
    resize();
  }

  /** Mermaid diagrams and math, loaded only when the note has them. */
  function enhance() {
    var codes = Array.prototype.slice.call(document.querySelectorAll('pre code.language-mermaid, pre[data-language="mermaid"] > code'));
    if (codes.length) {
      import(MERMAID).then(function (m) {
        var mermaid = m.default;
        var dark = document.documentElement.dataset.theme === "dark";
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
        codes.forEach(function (code, i) {
          var pre = code.closest("pre");
          mermaid.render("d" + i + "_" + Date.now(), code.textContent).then(function (r) {
            var box = document.createElement("div"); box.className = "diagram"; box.innerHTML = r.svg;
            pre.replaceWith(box); resize();
          }).catch(function () {});
        });
      }).catch(function () {});
    }
    var maths = Array.prototype.slice.call(document.querySelectorAll(".note code")).filter(function (c) {
      return !c.closest("pre") && /^\\$[^$]+\\$$/.test(c.textContent);
    });
    var blocks = Array.prototype.slice.call(document.querySelectorAll('pre code.language-math, pre[data-language="math"] > code, pre code.language-latex'));
    if (maths.length || blocks.length) {
      var s = document.createElement("script"); s.src = KATEX;
      s.onload = function () {
        maths.forEach(function (c) { try { var span = document.createElement("span"); window.katex.render(c.textContent.slice(1, -1), span, { throwOnError: false }); c.replaceWith(span); } catch (e) {} });
        blocks.forEach(function (c) { try { var div = document.createElement("div"); window.katex.render(c.textContent, div, { throwOnError: false, displayMode: true }); c.closest("pre").replaceWith(div); } catch (e) {} });
        resize();
      };
      document.head.appendChild(s);
    }
  }

  var lastH = 0;
  function resize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (Math.abs(h - lastH) > 1) { lastH = h; notify("ui/notifications/size-changed", { width: document.documentElement.clientWidth, height: h }); }
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);

  function theme(ctx) {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
    if (Array.isArray(ctx.availableDisplayModes)) canFullscreen = ctx.availableDisplayModes.indexOf("fullscreen") !== -1;
    if (ctx.displayMode) setMode(ctx.displayMode);
  }

  function fromResult(result) {
    var p = result && result.structuredContent && result.structuredContent.preview;
    if (p) render(p);
    else if (result && result.isError) document.getElementById("root").innerHTML = '<div class="loading">Octonote couldn\\'t open that.</div>';
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-open]");
    if (t) { e.preventDefault(); open(t.getAttribute("data-open")); return; }
    if (e.target.closest("[data-mode-toggle]")) {
      var want = mode === "fullscreen" ? "inline" : "fullscreen";
      request("ui/request-display-mode", { mode: want }).then(function (r) { setMode((r && r.mode) || want); }).catch(function () {});
    }
  });

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(m.error); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") fromResult(m.params);
    else if (m.method === "ui/notifications/host-context-changed") theme(m.params);
    else if (m.method === "ui/resource-teardown" && m.id != null) post({ jsonrpc: "2.0", id: m.id, result: {} });
  });

  request("ui/initialize", {
    appInfo: { name: "octonote-preview", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    protocolVersion: "2026-01-26"
  }).then(function (res) {
    theme(res && res.hostContext);
    if (last) render(last); // show Expand once we know the host allows it
    notify("ui/notifications/initialized", {});
    resize();
  }).catch(function () {});

  // ChatGPT's Apps SDK bridge, for hosts that expose it instead of the MCP Apps messages.
  if (window.openai && window.openai.toolOutput) {
    theme({ theme: window.openai.theme });
    fromResult({ structuredContent: window.openai.toolOutput });
  }
})();
</script>
</body>
</html>`;
}
