/**
 * The inline Octonote card for MCP Apps hosts (Claude, ChatGPT, and any client
 * that renders `ui://` resources). One self-contained page: it does the
 * MCP Apps handshake over postMessage, renders the tool result's
 * `structuredContent.preview` (an ItemPreview) and reports its height. Notes
 * render as HTML with mermaid diagrams and KaTeX math (both from jsdelivr,
 * declared in the resource's CSP); canvases show their snapshot.
 *
 * Comments: when the person can edit the note and the host lets cards call
 * tools, they can select text (or click an image, table or diagram), write
 * what should change and send it. The card saves the comment
 * (note_comment_create), asks the assistant in the chat (ui/message) and polls
 * note_comment_status: a spinner while it works, a tick when done, and the
 * updated note in place. Each block in the note HTML carries data-b="…" so a
 * selection maps to blocks.
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
  :root { --bg:#ffffff; --ink:#37352f; --strong:#191919; --muted:#787774; --line:#e9e9e7; --tint:#f7f7f5; --link:#2f6fd6; --ok:#0f9d58; --bad:#e03131; --mark:#f1ac4b; color-scheme: light; }
  :root[data-theme="dark"] { --bg:#191919; --ink:#d4d4d2; --strong:#f5f5f4; --muted:#9b9a97; --line:#2f2f2f; --tint:#232323; --link:#7aa7f0; --ok:#34a853; --bad:#f87777; --mark:#c98a2c; color-scheme: dark; }
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
  .note [data-b] { border-radius: 6px; transition: background .15s, box-shadow .15s; }
  .note { padding-left: 8px; margin-left: -8px; }
  .note [data-b].c-on { background: color-mix(in srgb, var(--mark) 20%, var(--bg)); box-shadow: -5px 0 0 var(--mark); }
  .note [data-b].c-hot { background: color-mix(in srgb, var(--mark) 32%, var(--bg)); }
  .note [data-b].c-pick { background: color-mix(in srgb, var(--link) 12%, var(--bg)); box-shadow: -5px 0 0 var(--link); }
  .cpop { position: fixed; z-index: 20; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16); padding: 6px; }
  .cpop textarea { display: block; width: 300px; max-width: calc(100vw - 40px); min-height: 70px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font: 14px/1.45 Inter, system-ui, sans-serif; background: var(--bg); color: var(--ink); outline: none; }
  .cpop textarea:focus { border-color: var(--link); }
  .cpop .row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; margin-top: 6px; }
  .cpop .row .hint { margin-right: auto; }
  .cpanel { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 8px; }
  .cphead { display: flex; align-items: center; gap: 8px; font-weight: 650; color: var(--strong); font-size: 13.5px; padding: 2px 0 4px; }
  .cphead .btn { margin-left: auto; }
  .crow { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .crow:last-child { border-bottom: 0; }
  .cst { width: 18px; height: 18px; flex: none; margin-top: 2px; display: grid; place-items: center; }
  .spin { width: 15px; height: 15px; border: 2px solid var(--line); border-top-color: var(--strong); border-radius: 50%; animation: cspin .8s linear infinite; }
  @keyframes cspin { to { transform: rotate(360deg); } }
  .tick, .cross { width: 18px; height: 18px; border-radius: 50%; color: #fff; display: grid; place-items: center; }
  .tick { background: var(--ok); } .cross { background: var(--bad); }
  .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--muted); }
  .cmain { flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.45; }
  .cq { color: var(--muted); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cb { color: var(--ink); overflow-wrap: anywhere; }
  .cr { color: var(--bad); font-size: 12.5px; }
  .cact { display: flex; gap: 6px; flex: none; }
  .btn.sm { padding: 3px 9px; font-size: 12px; border-radius: 7px; }
  .hint { color: var(--muted); font-size: 12.5px; }
  .chint { color: var(--muted); font-size: 12.5px; margin-top: 8px; }
  .cwarn { color: var(--bad); font-size: 12.5px; display: flex; gap: 8px; align-items: center; padding: 4px 0; }
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
  function requestT(method, params, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      request(method, params).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

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
  // Outline colour names (or hex values) → strokes and soft fills (light/dark aware via CSS vars where it matters).
  var COLORS = { black: "var(--strong)", grey: "#9b9a97", "light-violet": "#c8a2f0", violet: "#8f4cd6", blue: "#2f6fd6", "light-blue": "#4ba1f1",
    yellow: "#f1ac4b", orange: "#e16919", green: "#099268", "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131", white: "#ffffff" };
  function strokeOf(c) { return COLORS[c] || (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : "var(--strong)"); }
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
    o.arrows.forEach(function (a) {
      grow(a.x1, a.y1); grow(a.x2, a.y2);
      // A bent line bulges to mid + bend·n (n = (−dy, dx)/len) at its middle.
      if (a.bend) {
        var bl = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
        grow((a.x1 + a.x2) / 2 - (a.y2 - a.y1) / bl * a.bend, (a.y1 + a.y2) / 2 + (a.x2 - a.x1) / bl * a.bend);
      }
    });
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


  // ---------- Comments: select, ask the assistant, watch it happen ----------
  var tools = { mcp: false }, items = [], keySeq = 1, sel = null, pop = null, composing = false, deferred = false;
  var picked = false, askFailed = false, stale = false, pollTimer = null, pollStart = 0;
  var ICON_OK = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5"/></svg>';
  var ICON_X = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg>';

  function canComment() {
    return !!(last && last.canComment && last.noteId && (last.kind === "note" || last.kind === "project") &&
      (tools.mcp || (window.openai && window.openai.callTool)));
  }
  function isOpen(it) { return it.status === "pending" || it.status === "working"; }
  function byId(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }

  /** Call one of our server's tools through the host (MCP Apps), or ChatGPT's bridge. */
  function callTool(name, args) {
    var p = tools.mcp ? requestT("tools/call", { name: name, arguments: args }, 30000)
      : (window.openai && window.openai.callTool) ? Promise.resolve(window.openai.callTool(name, args))
      : Promise.reject(new Error("This app can't do that here."));
    return p.then(function (r) {
      if (r && r.isError) {
        var msg = "Something went wrong.";
        try { msg = JSON.parse(r.content[0].text).message || msg; } catch (e) {}
        throw new Error(msg);
      }
      if (r && r.structuredContent) return r.structuredContent;
      try { return JSON.parse(r.content[0].text); } catch (e) { return r || {}; }
    });
  }

  /** Put a message in the chat for the assistant (MCP Apps ui/message, or ChatGPT's follow-up). */
  function say(text) {
    return requestT("ui/message", { role: "user", content: { type: "text", text: text } }, 30000)
      .catch(function () { return requestT("ui/message", { role: "user", content: [{ type: "text", text: text }] }, 30000); })
      .catch(function (e) {
        if (window.openai && window.openai.sendFollowUpMessage) return window.openai.sendFollowUpMessage({ prompt: text });
        throw e;
      });
  }

  /** Blocks a range covers, in document order (null when it leaves the note). */
  function anchorsFor(range) {
    var a = range.startContainer, b = range.endContainer;
    var ea = a.nodeType === 1 ? a : a.parentNode, eb = b.nodeType === 1 ? b : b.parentNode;
    var root = ea && ea.closest && ea.closest(".note");
    if (!root || !eb.closest || eb.closest(".note") !== root) return null;
    var out = Array.prototype.slice.call(root.querySelectorAll("[data-b]"))
      .filter(function (el) { return range.intersectsNode(el); })
      .map(function (el) { return el.getAttribute("data-b"); });
    return out.length ? out : null;
  }

  function blocksFor(anchors) {
    var out = [];
    (anchors || []).forEach(function (a) {
      document.querySelectorAll('.note [data-b="' + a.replace(/"/g, "") + '"]').forEach(function (el) { out.push(el); });
    });
    return out;
  }

  function markBlocks() {
    document.querySelectorAll(".note [data-b]").forEach(function (el) { el.classList.remove("c-on"); });
    items.forEach(function (it) {
      if (it.status === "done" || it.status === "cancelled") return;
      blocksFor(it.blockIds || it.anchors).forEach(function (el) { el.classList.add("c-on"); });
    });
  }
  function hot(key, on) {
    var it = null; items.forEach(function (x) { if (String(x.key) === String(key)) it = x; });
    if (it) blocksFor(it.blockIds || it.anchors).forEach(function (el) { el.classList.toggle("c-hot", on); });
  }

  function closePop() {
    if (pop) { pop.remove(); pop = null; }
    composing = false;
    document.querySelectorAll(".c-pick").forEach(function (el) { el.classList.remove("c-pick"); });
    if (deferred) { deferred = false; refreshNote(); }
  }
  function place(el, rect) {
    var w = el.offsetWidth || 120, h = el.offsetHeight || 36;
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    var top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  function showButton(rect) {
    closePop();
    if (sel) blocksFor(sel.anchors).forEach(function (el) { el.classList.add("c-pick"); });
    pop = document.createElement("div");
    pop.className = "cpop";
    pop.innerHTML = '<button class="btn sm primary" data-act="compose">Comment</button>';
    document.body.appendChild(pop);
    place(pop, rect);
  }
  function compose() {
    if (!pop || !sel) return;
    composing = true;
    var rect = pop.getBoundingClientRect();
    pop.innerHTML = '<textarea placeholder="What should change? e.g. Make this shorter" maxlength="1000"></textarea>' +
      '<div class="row"><span class="hint">' + (sel.quote ? "On the selected text" : "On this block") + '</span>' +
      '<button class="btn sm" data-act="add">Add</button><button class="btn sm primary" data-act="send-now">Send</button></div>';
    place(pop, { left: rect.left, top: rect.top, bottom: rect.top - 6 });
    var ta = pop.querySelector("textarea");
    ta.focus();
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closePop(); }
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addDraft(true); }
    });
  }
  function addDraft(sendNow) {
    if (!pop || !sel) return;
    var text = pop.querySelector("textarea").value.trim();
    if (!text) { pop.querySelector("textarea").focus(); return; }
    var it = { key: keySeq++, id: null, status: "draft", quote: sel.quote, body: text, anchors: sel.anchors, blockIds: null, reason: null };
    items.push(it);
    sel = null;
    var s = window.getSelection(); if (s) s.removeAllRanges();
    closePop();
    markBlocks(); renderPanel(); resize();
    if (sendNow) send([it]);
  }

  /** Save drafts as comments, then ask the assistant to do them. */
  function send(list) {
    list = list.filter(function (it) { return it.status === "draft" || it.status === "error"; });
    if (!list.length) return;
    list.forEach(function (it) { it.status = "saving"; it.reason = null; });
    renderPanel();
    callTool("note_comment_create", {
      noteId: last.noteId,
      comments: list.map(function (it) { return { anchors: it.anchors, quote: it.quote || "", body: it.body }; })
    }).then(function (r) {
      (r.comments || []).forEach(function (c, i) {
        var it = list[i]; if (!it) return;
        it.id = c.id; it.status = c.status; it.blockIds = c.blockIds;
      });
      renderPanel(); markBlocks();
      ask(list.map(function (it) { return it.id; }).filter(Boolean));
    }).catch(function (e) {
      list.forEach(function (it) { it.status = "error"; it.reason = e.message || "Couldn't save the comment."; });
      renderPanel();
    });
  }
  function ask(ids) {
    if (!ids.length) return;
    askFailed = false; stale = false;
    var title = (last && last.title) || "this note";
    say("Please apply my comment" + (ids.length > 1 ? "s" : "") + ' on the Octonote note "' + title + '" (' + ids.join(", ") + ").")
      .catch(function () { askFailed = true; renderPanel(); });
    poll(true);
  }
  function askAgain() {
    ask(items.filter(isOpen).map(function (it) { return it.id; }));
    renderPanel();
  }

  function retry(it) {
    if (!it.id) { it.status = "draft"; send([it]); return; }
    it.status = "pending"; it.reason = null; renderPanel();
    callTool("note_comment_retry", { id: it.id })
      .then(function (r) { if (r.comment) { it.status = r.comment.status; it.blockIds = r.comment.blockIds; } renderPanel(); ask([it.id]); })
      .catch(function (e) { it.status = "failed"; it.reason = e.message; renderPanel(); });
  }
  function cancel(it) {
    if (!it.id) { items = items.filter(function (x) { return x !== it; }); markBlocks(); renderPanel(); resize(); return; }
    callTool("note_comment_cancel", { id: it.id })
      .then(function (r) { it.status = (r.comment && r.comment.status) || "cancelled"; markBlocks(); renderPanel(); resize(); })
      .catch(function () {});
  }

  /** Watch open comments; show the note again whenever it changes. */
  function poll(restart) {
    if (restart) { clearTimeout(pollTimer); pollStart = Date.now(); }
    if (!items.some(isOpen)) { pollStart = 0; return; }
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      var ids = items.filter(function (it) { return it.id; }).map(function (it) { return it.id; });
      callTool("note_comment_status", { noteId: last.noteId, ids: ids, since: last.version || null }).then(function (r) {
        (r.comments || []).forEach(function (c) {
          var it = byId(c.id);
          if (it) { it.status = c.status; it.reason = c.reason; it.blockIds = c.blockIds; }
        });
        if (r.version) last.version = r.version;
        if (typeof r.html === "string") { last.html = r.html; refreshNote(); }
        markBlocks(); renderPanel();
      }).catch(function () {}).then(function () {
        if (!items.some(isOpen)) { pollStart = 0; return; }
        if (Date.now() - pollStart > 600000) { stale = true; pollStart = 0; renderPanel(); return; }
        poll();
      });
    }, 2000);
  }

  /** On load: comments still open on this note (e.g. the chat was reloaded). */
  function pickUp() {
    callTool("note_comment_status", { noteId: last.noteId, since: last.version || null }).then(function (r) {
      (r.comments || []).forEach(function (c) {
        if (byId(c.id) || (c.status !== "pending" && c.status !== "working")) return;
        items.push({ key: keySeq++, id: c.id, status: c.status, quote: c.quote, body: c.body, anchors: c.blockIds, blockIds: c.blockIds, reason: c.reason });
      });
      if (r.version) last.version = r.version;
      if (typeof r.html === "string") { last.html = r.html; refreshNote(); }
      markBlocks(); renderPanel(); resize();
      if (items.some(isOpen)) poll(true);
    }).catch(function () {});
  }

  /** Put fresh note HTML in place without rebuilding the card. */
  function refreshNote() {
    if (composing) { deferred = true; return; }
    var el = document.querySelector(".body .note");
    if (!el || !last) return;
    el.innerHTML = last.html ? sanitize(last.html) : '<p class="kind">This note is empty.</p>';
    enhance(); markBlocks(); resize();
  }

  function statusIcon(it) {
    if (it.status === "pending" || it.status === "working" || it.status === "saving") return '<span class="spin" title="Working on it"></span>';
    if (it.status === "done") return '<span class="tick" title="Done">' + ICON_OK + "</span>";
    if (it.status === "failed" || it.status === "declined" || it.status === "error") return '<span class="cross" title="Not done">' + ICON_X + "</span>";
    return '<span class="dot" title="Not sent yet"></span>';
  }
  function actions(it) {
    var k = ' data-k="' + it.key + '"';
    if (it.status === "draft") return '<button class="btn sm primary" data-act="send-one"' + k + '>Send</button><button class="btn sm" data-act="remove"' + k + '>Remove</button>';
    if (it.status === "pending" || it.status === "working") return '<button class="btn sm" data-act="cancel"' + k + '>Cancel</button>';
    if (it.status === "failed" || it.status === "declined" || it.status === "error") return '<button class="btn sm" data-act="retry"' + k + '>Retry</button>';
    return "";
  }
  function renderPanel() {
    var box = document.getElementById("cpanel");
    if (!box) return;
    if (!canComment()) { box.innerHTML = ""; return; }
    var shown = items.filter(function (it) { return it.status !== "cancelled"; });
    if (!shown.length) { box.innerHTML = '<div class="chint">Select text, or click an image or table, to ask for a change.</div>'; return; }
    var drafts = shown.filter(function (it) { return it.status === "draft"; });
    var working = shown.filter(function (it) { return isOpen(it) || it.status === "saving"; }).length;
    var settled = !working && !drafts.length;
    var head = '<div class="cphead">Comments' + (working ? ' <span class="hint">· working on ' + working + "</span>" : "") +
      (drafts.length > 1 ? '<button class="btn sm primary" data-act="send-all">Send all (' + drafts.length + ")</button>"
        : settled ? '<button class="btn sm" data-act="clear">Clear</button>' : "") + "</div>";
    var warn = askFailed ? '<div class="cwarn">Couldn\\'t ask the assistant.<button class="btn sm" data-act="ask-again">Ask again</button></div>'
      : stale ? '<div class="cwarn">Still waiting on the assistant.<button class="btn sm" data-act="ask-again">Ask again</button></div>' : "";
    box.innerHTML = head + warn + shown.map(function (it) {
      return '<div class="crow" data-k="' + it.key + '"><span class="cst">' + statusIcon(it) + '</span><div class="cmain">' +
        (it.quote ? '<div class="cq">\u201c' + esc(it.quote) + '\u201d</div>' : "") + '<div class="cb">' + esc(it.body) + "</div>" +
        (it.reason && it.status !== "done" ? '<div class="cr">' + esc(it.reason) + "</div>" : "") +
        '</div><div class="cact">' + actions(it) + "</div></div>";
    }).join("");
  }

  function itemFor(el) {
    var k = el.getAttribute("data-k"), it = null;
    items.forEach(function (x) { if (String(x.key) === k) it = x; });
    return it;
  }

  function onSelect() {
    if (!canComment() || composing) return;
    var s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    var range = s.getRangeAt(0), anchors = anchorsFor(range);
    if (!anchors) return;
    sel = { anchors: anchors, quote: s.toString().split(/\\s+/).join(" ").trim().slice(0, 500) };
    showButton(range.getBoundingClientRect());
  }
  document.addEventListener("mouseup", function (e) {
    if (pop && pop.contains(e.target)) return;
    setTimeout(onSelect, 0);
  });
  document.addEventListener("keyup", function (e) { if (e.shiftKey) onSelect(); });
  document.addEventListener("mousedown", function (e) {
    if (pop && !pop.contains(e.target) && !composing) closePop();
  });
  document.addEventListener("scroll", function () { if (pop && !composing) closePop(); }, true);
  document.addEventListener("mouseover", function (e) {
    var row = e.target.closest && e.target.closest(".crow");
    document.querySelectorAll(".c-hot").forEach(function (el) { el.classList.remove("c-hot"); });
    if (row) hot(row.getAttribute("data-k"), true);
  });

  var last = null, mode = "inline", canFullscreen = false;
  function setMode(m) {
    if (!m || m === mode) return;
    mode = m; document.documentElement.dataset.mode = m;
    if (last) render(last);
  }
  function render(p) {
    if (!last || last.noteId !== p.noteId) { items = []; picked = false; askFailed = false; stale = false; }
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
    document.getElementById("root").innerHTML = '<div class="card">' + head(p) + '<div class="body">' + body + '</div><div id="cpanel"></div></div>';
    enhance();
    markBlocks();
    renderPanel();
    if (canComment() && !picked) { picked = true; pickUp(); }
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
    var act = e.target.closest("[data-act]");
    if (act) {
      e.preventDefault();
      var a = act.getAttribute("data-act"), it = act.hasAttribute("data-k") ? itemFor(act) : null;
      if (a === "compose") compose();
      else if (a === "add") addDraft(false);
      else if (a === "send-now") addDraft(true);
      else if (a === "send-all") send(items.slice());
      else if (a === "send-one" && it) send([it]);
      else if (a === "remove" && it) cancel(it);
      else if (a === "cancel" && it) cancel(it);
      else if (a === "retry" && it) retry(it);
      else if (a === "ask-again") askAgain();
      else if (a === "clear") { items = items.filter(function (x) { return isOpen(x) || x.status === "draft"; }); markBlocks(); renderPanel(); resize(); }
      return;
    }
    // Images, tables, diagrams and code: a click picks the whole block.
    var blk = canComment() && !composing && e.target.closest && e.target.closest(".note [data-b]");
    var s = window.getSelection();
    if (blk && (!s || s.isCollapsed) && e.target.closest("img,table,.diagram,svg,pre,.katex-display")) {
      e.preventDefault();
      sel = { anchors: [blk.getAttribute("data-b")], quote: "" };
      showButton(blk.getBoundingClientRect());
      return;
    }
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
    tools.mcp = !!(res && res.hostCapabilities && res.hostCapabilities.serverTools);
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
