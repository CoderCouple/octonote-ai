import { z } from "zod/v4";
import type { CatalogEntry } from "./catalog.js";

export const CUSTOM_LIMITS = { htmlLength: 150_000, minHeight: 120, maxHeight: 1400 } as const;

const customSchema = z.object({
  kind: z.literal("custom"),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(400).describe("What the learner will do, shown before they press Run."),
  html: z
    .string()
    .min(20)
    .max(CUSTOM_LIMITS.htmlLength)
    .describe(
      "One self-contained HTML document: inline <style> and <script> only, no external files, fonts, images by URL or network requests. Report progress with host.complete(score 0-100) and host.event(name, data).",
    ),
  height: z.number().int().min(CUSTOM_LIMITS.minHeight).max(CUSTOM_LIMITS.maxHeight).optional().describe("Starting height in pixels; the frame then follows its content."),
});

export type CustomBlock = z.infer<typeof customSchema>;

/**
 * Generated code for experiences the catalog can't provide. It never runs in
 * the host page: see `customSrcDoc` and the CustomExperience component.
 */
export const customEntry: CatalogEntry = {
  kind: "custom",
  library: "compose",
  summary: "A small custom interactive app written as one self-contained HTML document, run in an isolated sandbox with no network access.",
  useWhen: ["Only when the plan's strategy is custom: a bespoke game, simulation or tool that no other block can provide."],
  avoidWhen: ["Anything another block can do: always prefer widgets, activities and scenes, which are faster, consistent and accessible."],
  weight: "rich",
  jsonSchema: () => z.toJSONSchema(customSchema, { io: "input" }) as Record<string, unknown>,
  example: {
    kind: "custom",
    title: "Tap the chambers in order",
    description: "Tap the heart's chambers in the order blood flows through them.",
    html: '<!doctype html><html><body><p id="msg">Tap the right atrium first.</p><button onclick="host.complete(100)">Right atrium</button></body></html>',
  },
  validate(block, id) {
    const parsed = customSchema.safeParse(block);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
    return { ok: true, block: { kind: "custom", id, renderer: "custom", custom: parsed.data } };
  },
};

/**
 * No network, no external resources, no forms or navigation targets. Added
 * first in the document; a CSP the generated code adds can only restrict more.
 */
export const CUSTOM_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The only way the sandbox can talk to the host: three messages, tagged with this frame's secret. */
function bridge(nonce: string): string {
  return `<script>(function(){
var send=function(m){m.source="octonote-custom";m.nonce=${JSON.stringify(nonce)};parent.postMessage(m,"*");};
window.host=Object.freeze({
  complete:function(score){send({type:"complete",score:Number(score)});},
  event:function(name,data){try{send({type:"event",name:String(name),data:JSON.parse(JSON.stringify(data===undefined?null:data))});}catch(e){}},
  resize:function(h){send({type:"resize",height:Number(h)});}
});
var last=0,report=function(){var h=Math.ceil(document.documentElement.scrollHeight);if(Math.abs(h-last)>2){last=h;send({type:"resize",height:h});}};
addEventListener("load",report);
if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement);}
})();</script>`;
}

/** The document the sandboxed frame loads: CSP and bridge first, then the generated HTML. */
export function customSrcDoc(html: string, nonce: string, theme: "light" | "dark" = "light"): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CUSTOM_CSP}"><meta name="color-scheme" content="${theme}">${bridge(nonce)}<style>html{color-scheme:${theme}}body{margin:0;padding:16px;font-family:system-ui,sans-serif}</style>`;
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

export const customMessageSchema = z.discriminatedUnion("type", [
  z.object({ source: z.literal("octonote-custom"), nonce: z.string(), type: z.literal("resize"), height: z.number().finite() }),
  z.object({ source: z.literal("octonote-custom"), nonce: z.string(), type: z.literal("complete"), score: z.number().finite() }),
  z.object({ source: z.literal("octonote-custom"), nonce: z.string(), type: z.literal("event"), name: z.string().max(64), data: z.unknown() }),
]);

export type CustomMessage = z.infer<typeof customMessageSchema>;

/** Checks a postMessage from a sandbox: right shape and right secret, or null. */
export function readCustomMessage(data: unknown, nonce: string): CustomMessage | null {
  const parsed = customMessageSchema.safeParse(data);
  if (!parsed.success || parsed.data.nonce !== nonce) return null;
  if (parsed.data.type === "event" && JSON.stringify(parsed.data.data ?? null).length > 4000) return null;
  return parsed.data;
}
