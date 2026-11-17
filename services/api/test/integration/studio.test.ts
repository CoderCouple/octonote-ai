/**
 * Studio: a source (pasted text, a note, a web page or a PDF) turned into one
 * interactive block by AI, kept private until published, and added to notes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../src/common/error/app-error";
import { ErrorCode } from "../../src/common/error/error-codes";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import { ComposeAiService } from "../../src/service/compose-ai.service";
import { ExtensionItemsService } from "../../src/service/extension-items.service";
import { htmlToText, readPdf } from "../../src/service/lib/studio-sources";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { StudioService, toMarkdown } from "../../src/service/studio.service";
import { createHarness, statusOf, type Harness } from "./harness";

const SOURCE =
  "Photosynthesis is how plants turn light into chemical energy. Chlorophyll in the leaves absorbs sunlight. Water and carbon dioxide go in; glucose and oxygen come out.";

const INFOGRAPHIC = {
  title: "Photosynthesis in four steps",
  layout: "process",
  items: [
    { label: "Light is absorbed", icon: "bolt" },
    { label: "Water is split", icon: "drop" },
    { label: "CO2 is fixed", icon: "leaf" },
    { label: "Glucose is made", icon: "star" },
  ],
};

/** Stands in for the AI: returns a scripted block, or fails, or waits until released. */
class FakeAi extends ComposeAiService {
  calls: { kind: string; source: string }[] = [];
  next: (kind: string) => Promise<{ spec: Record<string, unknown>; title: string }> = async () => ({ spec: INFOGRAPHIC, title: INFOGRAPHIC.title });
  override async assertReady() {}
  override async generate(_userId: string, input: { kind: string; title: string; source: string }) {
    this.calls.push({ kind: input.kind, source: input.source });
    return this.next(input.kind);
  }
}

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let tools: McpToolsService;
let ai: FakeAi;
let studio: StudioService;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  tools = new McpToolsService(
    new WorkspaceMembersRepository(h.db),
    h.pages,
    h.canvases,
    h.projects,
    h.notebooks,
    h.noteMarkdown,
    h.canvasDiagrams,
    h.settings,
    h.shares,
    h.figures,
  );
  ai = new FakeAi();
  studio = new StudioService(h.db, tools, ai, new ExtensionItemsService(tools, h.notebooks, h.noteMarkdown, h.canvases, h.projects));
});

const make = (kind = "infographic" as const, text = SOURCE) =>
  studio.create(alice.id, { workspaceId: alice.workspaceId, kind, source: { type: "text", text } });

describe("making an item", () => {
  it("saves it as running, then fills in the block and the AI's title", async () => {
    const item = await make();
    expect(item).toMatchObject({ status: "running", kind: "infographic", sourceType: "text", mine: true, spec: null });
    expect(item.title).toMatch(/^Infographic: Photosynthesis is how plants/);
    await studio.settled(item.id);
    const done = await studio.get(alice.id, item.id);
    expect(done).toMatchObject({ status: "succeeded", title: "Photosynthesis in four steps", spec: INFOGRAPHIC, error: null });
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(ai.calls[0]).toEqual({ kind: "infographic", source: SOURCE });
  });

  it("keeps a title the person typed", async () => {
    const item = await studio.create(alice.id, { workspaceId: alice.workspaceId, kind: "quiz", title: "Biology check", source: { type: "text", text: SOURCE } });
    await studio.settled(item.id);
    expect((await studio.get(alice.id, item.id)).title).toBe("Biology check");
  });

  it("records a failure with the reason, and a retry can succeed", async () => {
    ai.next = async () => {
      throw new AppError(ErrorCode.SERVER_ERROR, "The AI's infographic didn't check out. Try again.", 502);
    };
    const item = await make();
    await studio.settled(item.id);
    expect(await studio.get(alice.id, item.id)).toMatchObject({ status: "failed", error: "The AI's infographic didn't check out. Try again." });

    ai.next = async () => ({ spec: INFOGRAPHIC, title: "x" });
    const retried = await studio.retry(alice.id, item.id);
    expect(retried.status).toBe("running");
    await studio.settled(item.id);
    expect(await studio.get(alice.id, item.id)).toMatchObject({ status: "succeeded", error: null });
  });

  it("refuses at once when AI isn't set up, without keeping an item", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const noKey = new StudioService(h.db, tools, new ComposeAiService(), new ExtensionItemsService(tools, h.notebooks, h.noteMarkdown, h.canvases, h.projects));
      expect(await statusOf(noKey.create(alice.id, { workspaceId: alice.workspaceId, kind: "quiz", source: { type: "text", text: SOURCE } }))).toBe(503);
      expect((await studio.list(alice.id, alice.workspaceId)).items).toHaveLength(0);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("refuses a source that's too short", async () => {
    expect(await statusOf(make("infographic", "Too short."))).toBe(400);
  });

  it("cuts long sources to the limit", async () => {
    const item = await make("text", `${"word ".repeat(9000)}\n${"more ".repeat(9000)}`);
    expect(item.sourceChars).toBeLessThanOrEqual(30_000);
  });

  it("lets only three run at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ai.next = async () => {
      await gate;
      return { spec: INFOGRAPHIC, title: "t" };
    };
    const running = await Promise.all([make(), make(), make()]);
    expect(await statusOf(make())).toBe(400);
    release();
    await Promise.all(running.map((r) => studio.settled(r.id)));
    expect((await make()).status).toBe("running");
  });

  it("lists items with stats", async () => {
    ai.next = async (kind) => {
      if (kind === "quiz") throw new AppError(ErrorCode.SERVER_ERROR, "nope", 502);
      return { spec: INFOGRAPHIC, title: "ok" };
    };
    const a = await make();
    const b = await make("quiz");
    await Promise.all([studio.settled(a.id), studio.settled(b.id)]);
    const { items, stats } = await studio.list(alice.id, alice.workspaceId);
    expect(items).toHaveLength(2);
    expect(stats).toEqual({ total: 2, succeeded: 1, running: 0, failed: 1, thisWeek: 2 });
    expect(await statusOf(studio.list(bob.id, alice.workspaceId))).toBe(404);
  });
});

describe("sources", () => {
  it("reads a note the person can open, and refuses one they can't", async () => {
    const note = await tools.createNote(alice.id, { title: "Cells", markdown: `# Cells\n\n${SOURCE}`, workspaceId: alice.workspaceId });
    const item = await studio.create(alice.id, { workspaceId: alice.workspaceId, kind: "flashcards", source: { type: "item", id: note.id } });
    expect(item).toMatchObject({ sourceType: "item", sourceLabel: "Cells", sourceRef: note.id });
    expect(item.sourceText).toContain("Chlorophyll");
    expect(await statusOf(studio.create(bob.id, { workspaceId: bob.workspaceId, kind: "flashcards", source: { type: "item", id: note.id } }))).toBe(404);
  });

  it("refuses links to private networks without fetching them", async () => {
    for (const url of ["http://127.0.0.1/admin", "http://localhost:80/", "http://10.0.0.5/", "http://[::1]/", "http://metadata.google.internal/", "ftp://example.com/x"]) {
      expect(await statusOf(studio.create(alice.id, { workspaceId: alice.workspaceId, kind: "text", source: { type: "url", url } }))).toBe(400);
    }
  });

  it("turns a web page into its readable text", () => {
    const html = `<html><head><title>Ignored</title><meta property="og:title" content="Plants &amp; light"><style>p{}</style></head>
      <body><nav>Home · About</nav><article><h1>Photosynthesis</h1><p>Plants use light.</p><ul><li>Water in</li><li>Oxygen out</li></ul>
      <script>track()</script></article><footer>© 2026</footer></body></html>`;
    const page = htmlToText(html);
    expect(page.title).toBe("Plants & light");
    expect(page.text).toContain("## Photosynthesis");
    expect(page.text).toContain("- Water in");
    expect(page.text).not.toMatch(/Home|track|©|p\{\}/);
  });

  it("reads the text of a PDF and refuses files that aren't PDFs", async () => {
    const pdf = await readPdf(simplePdf("Chlorophyll absorbs sunlight in the leaves."));
    expect(pdf.pages).toBe(1);
    expect(pdf.text).toContain("Chlorophyll absorbs sunlight");
    const fake = Buffer.from("<html>not a pdf</html>").toString("base64");
    expect(await statusOf(studio.create(alice.id, { workspaceId: alice.workspaceId, kind: "quiz", source: { type: "pdf", name: "x.pdf", data: fake } }))).toBe(400);
  });

  it("makes an item from an uploaded PDF", async () => {
    const data = Buffer.from(simplePdf(`${SOURCE} ${SOURCE}`)).toString("base64");
    const item = await studio.create(alice.id, { workspaceId: alice.workspaceId, kind: "quiz", source: { type: "pdf", name: "Biology notes.pdf", data } });
    expect(item).toMatchObject({ sourceType: "pdf", sourceLabel: "Biology notes" });
    expect(item.sourceText).toContain("Photosynthesis");
  });
});

describe("privacy and sharing", () => {
  it("keeps an item private until it's published, and hides the source text from others", async () => {
    const item = await make();
    await studio.settled(item.id);
    expect(await statusOf(studio.get(bob.id, item.id))).toBe(404);
    expect(await statusOf(studio.get(null, item.id))).toBe(404);
    expect(await statusOf(studio.rename(bob.id, item.id, "Mine now"))).toBe(404);
    expect(await statusOf(studio.remove(bob.id, item.id))).toBe(404);
    expect(await statusOf(studio.setPublished(bob.id, item.id, true))).toBe(404);

    expect((await studio.setPublished(alice.id, item.id, true)).published).toBe(true);
    const shared = await studio.get(null, item.id);
    expect(shared).toMatchObject({ mine: false, spec: INFOGRAPHIC, sourceText: "", workspaceId: "" });

    await studio.setPublished(alice.id, item.id, false);
    expect(await statusOf(studio.get(bob.id, item.id))).toBe(404);
  });

  it("can't share an item that hasn't finished", async () => {
    ai.next = () => new Promise(() => undefined);
    const item = await make();
    expect(await statusOf(studio.setPublished(alice.id, item.id, true))).toBe(400);
  });
});

describe("adding to a note", () => {
  it("makes a new note holding the block, which the note accepts as a live block", async () => {
    const item = await make();
    await studio.settled(item.id);
    const note = await studio.addToNote(alice.id, item.id, {});
    const md = await h.noteMarkdown.read(note.id, alice.id);
    expect(md.title).toBe("Photosynthesis in four steps");
    expect(md.markdown).toContain("```infographic");
  });

  it("appends to a note the person can edit, and not to someone else's", async () => {
    const item = await make();
    await studio.settled(item.id);
    const note = await tools.createNote(alice.id, { title: "Biology", markdown: "Intro", workspaceId: alice.workspaceId });
    await studio.addToNote(alice.id, item.id, { noteId: note.id });
    expect((await h.noteMarkdown.read(note.id, alice.id)).markdown).toMatch(/Intro[\s\S]*```infographic/);

    const bobs = await tools.createNote(bob.id, { title: "Bob's", markdown: "Private", workspaceId: bob.workspaceId });
    expect([403, 404]).toContain(await statusOf(studio.addToNote(alice.id, item.id, { noteId: bobs.id })));
  });

  it("adds a summary as plain markdown", () => {
    expect(toMarkdown({ kind: "text", spec: { markdown: "**Gist.** Plants make food." } })).toBe("**Gist.** Plants make food.");
    expect(toMarkdown({ kind: "quiz", spec: { questions: [] } })).toBe('```quiz\n{\n  "questions": []\n}\n```');
  });
});

describe("the AI making one block", () => {
  /** A model that answers from a list, recording each request. */
  class ScriptedModel extends ComposeAiService {
    requests: { system: string; tool: string }[] = [];
    constructor(private answers: unknown[]) {
      super();
    }
    protected override async model() {
      return {
        callTool: async (req: { system: string; tool: { name: string } }) => {
          this.requests.push({ system: req.system, tool: req.tool.name });
          return this.answers.shift();
        },
      } as never;
    }
  }

  it("validates the block, repairs it once, and returns its JSON and title", async () => {
    const broken = { ...INFOGRAPHIC, layout: "bars" }; // bars need an amount on every item
    const model = new ScriptedModel([broken, INFOGRAPHIC]);
    const made = await model.generate(alice.id, { kind: "infographic", title: "Leaves", source: SOURCE });
    expect(made).toEqual({ spec: INFOGRAPHIC, title: "Photosynthesis in four steps" });
    expect(model.requests.map((r) => r.tool)).toEqual(["make_block", "fix_block"]);
    expect(model.requests[0]!.system).toContain("Octonote Studio");
  });

  it("gives up with the reason when the repair fails too", async () => {
    const broken = { ...INFOGRAPHIC, layout: "bars" };
    const model = new ScriptedModel([broken, broken]);
    await expect(model.generate(alice.id, { kind: "infographic", title: "Leaves", source: SOURCE })).rejects.toThrow(/didn't check out \(items\.0\.value/);
  });
});

/** A one-page PDF with a line of Helvetica text, built by hand with a correct cross-reference table. */
function simplePdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
