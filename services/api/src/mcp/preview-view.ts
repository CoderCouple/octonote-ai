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
      '<div class="actions">' + pub + '<button class="btn primary" data-open="' + esc(p.url) + '">Open in Octonote</button></div></div>';
  }
  function shot(p) {
    var src = p.thumbnailUrl && safeUrl(p.thumbnailUrl);
    return src ? '<img class="shot" alt="Canvas: ' + esc(p.title) + '" src="' + esc(src) + '" />'
               : '<div class="empty">Open the canvas to see the drawing.</div>';
  }

  function render(p) {
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

  function theme(ctx) { if (ctx && ctx.theme) document.documentElement.dataset.theme = ctx.theme; }

  function fromResult(result) {
    var p = result && result.structuredContent && result.structuredContent.preview;
    if (p) render(p);
    else if (result && result.isError) document.getElementById("root").innerHTML = '<div class="loading">Octonote couldn\\'t open that.</div>';
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-open]");
    if (t) { e.preventDefault(); open(t.getAttribute("data-open")); }
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
    appCapabilities: { availableDisplayModes: ["inline"] },
    clientInfo: { name: "octonote-preview", version: "1.0.0" },
    protocolVersion: "2026-01-26"
  }).then(function (res) {
    theme(res && res.hostContext);
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
