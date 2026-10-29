/**
 * octonote.ai/cli — the CLI's docs: install, use with Claude Code / Codex,
 * the full command reference (generated from the CLI itself, see
 * _data/reference.json), content formats, sign-in, agent contract and
 * troubleshooting.
 */
import { SUPPORT_EMAIL } from "@octonote/shared";
import type { Metadata } from "next";
import Link from "next/link";
import {
  CliCta,
  CliExamples,
  CliFirstRun,
  CliHero,
  CliInstall,
  CliUses,
} from "./_components/cli-landing";
import { CodeBlock } from "./_components/code-block";
import { Toc } from "./_components/toc";
import { INSTALL } from "./_data/install";
import reference from "./_data/reference.json";

const CLI_TITLE = "Octonote CLI — notes and diagrams for Claude Code & Codex";
const CLI_DESCRIPTION =
  "Let Claude Code, Codex and your scripts write markdown notes, draw canvases from mermaid flowcharts and publish them — with the octonote command-line tool.";

export const metadata: Metadata = {
  title: { absolute: CLI_TITLE },
  description: CLI_DESCRIPTION,
  alternates: { canonical: "/cli" },
  openGraph: {
    type: "website",
    url: "/cli",
    title: CLI_TITLE,
    description: CLI_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: CLI_TITLE,
    description: CLI_DESCRIPTION,
  },
};

interface RefCommand {
  name: string;
  aliases: string[];
  description: string;
  arguments: {
    name: string;
    description: string;
    required: boolean;
    variadic: boolean;
    default?: string;
  }[];
  options: {
    flags: string;
    description: string;
    default?: string;
    required: boolean;
  }[];
}
const commands = reference.commands as RefCommand[];

const GROUPS: {
  id: string;
  title: string;
  blurb: string;
  match: (name: string) => boolean;
  example: string;
}[] = [
  {
    id: "ref-notes",
    title: "Notes",
    blurb:
      "Markdown in, rich notes out. Pull a note to a file, edit it, push it back.",
    match: (n) => n.startsWith("note "),
    example: `$ octonote note create "Plan" --file plan.md --notebook "Work" --publish
$ cat log.md | octonote note create "Build log" --stdin
$ octonote note pull pag_… -o plan.md     # edit plan.md…
$ octonote note push plan.md
$ octonote note append pag_… --text "- shipped the CLI"`,
  },
  {
    id: "ref-canvases",
    title: "Canvases",
    blurb:
      "Write a mermaid flowchart; Octonote lays it out as real, editable shapes.",
    match: (n) => n.startsWith("canvas "),
    example: `$ octonote canvas create "Login flow" --from-mermaid flow.mmd
$ octonote canvas redraw cnv_… --from-mermaid flow.mmd
$ octonote canvas pull cnv_… -o board.json   # raw canvas JSON`,
  },
  {
    id: "ref-projects",
    title: "Projects",
    blurb: "A note and a canvas side by side, created in one command.",
    match: (n) => n.startsWith("project "),
    example: `$ octonote project create "Auth flow" --note auth.md --canvas-mermaid auth.mmd --publish
$ octonote project show prj_…`,
  },
  {
    id: "ref-notebooks",
    title: "Notebooks",
    blurb:
      "Folders for notes, canvases and projects. Refer to them by exact name or id.",
    match: (n) => n.startsWith("notebook "),
    example: `$ octonote notebook create "Architecture"
$ octonote list --notebook "Architecture"`,
  },
  {
    id: "ref-organise",
    title: "Find & organise",
    blurb:
      "Works on any item — the id says what it is (pag_ note, cnv_ canvas, prj_ project, ntb_ notebook).",
    match: (n) => ["list", "search", "open", "move", "delete"].includes(n),
    example: `$ octonote list --kind canvas
$ octonote search onboarding
$ octonote move pag_… --notebook "Archive"
$ octonote delete cnv_… --yes`,
  },
  {
    id: "ref-sharing",
    title: "Publish & share",
    blurb:
      "Publish to a public page, or share with people — the same rules as the app.",
    match: (n) => ["publish", "unpublish", "share"].includes(n),
    example: `$ octonote publish pag_…                       # prints publicUrl
$ octonote share pag_… --email sam@example.com --role editor
$ octonote share pag_… --link view               # anyone with the link`,
  },
  {
    id: "ref-account",
    title: "Account",
    blurb: "Sign in, pick a workspace, manage tokens.",
    match: (n) => /^(login|logout|whoami|account |workspace |token )/.test(n),
    example: `$ octonote login
$ octonote whoami
$ octonote account rename "Sam Lee"
$ octonote workspace use "Team"`,
  },
  {
    id: "ref-agents",
    title: "Agent setup",
    blurb: "Teach Claude Code or Codex to use Octonote.",
    match: (n) => ["guide", "setup"].includes(n),
    example: `$ octonote setup claude --skill
$ octonote setup codex --global
$ octonote guide`,
  },
];

const TOC = [
  { id: "agents", label: "Use with agents" },
  { id: "claude-code", label: "Claude Code", sub: true },
  { id: "codex", label: "Codex", sub: true },
  { id: "cloud", label: "Cloud & CI", sub: true },
  { id: "reference", label: "Command reference" },
  ...GROUPS.map((g) => ({ id: g.id, label: g.title, sub: true })),
  { id: "content", label: "Writing content" },
  { id: "auth", label: "Sign-in & tokens" },
  { id: "contract", label: "For agent builders" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

function usage(c: RefCommand) {
  const args = c.arguments.map((a) => {
    const n = `${a.name}${a.variadic ? "…" : ""}`;
    return a.required ? `<${n}>` : `[${n}]`;
  });
  return ["octonote", c.name, ...args, c.options.length ? "[options]" : ""]
    .filter(Boolean)
    .join(" ");
}

export default function CliDocsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-28 pb-8 md:px-10 md:pt-36">
      <CliHero version={reference.version} />
      <CliUses />
      <CliInstall />
      <CliFirstRun />
      <CliExamples />
      <div id="docs" className="scroll-mt-24 border-t pt-16 md:pt-24">
        <h2 className="text-foreground-strong text-3xl font-bold tracking-tight md:text-5xl">
          Documentation
        </h2>
        <p className="text-muted-foreground mt-3 max-w-2xl text-lg">
          Everything in v{reference.version}: agent setup, every command,
          content formats, sign-in and what scripts can rely on.
        </p>
        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-14">
          <article className="min-w-0">
            <Agents />
            <ReferenceSection />
            <Content />
            <Auth />
            <Contract />
            <Troubleshooting />
          </article>
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <Toc items={TOC} />
            </div>
          </aside>
        </div>
      </div>
      <CliCta />
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t pt-12 pb-4 first:border-t-0"
    >
      <h2 className="text-foreground-strong text-2xl font-bold tracking-tight md:text-3xl">
        {title}
      </h2>
      {lead ? (
        <p className="text-muted-foreground mt-2 max-w-2xl text-base leading-relaxed">
          {lead}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Sub({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h3 className="text-foreground-strong text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground max-w-2xl text-[15px] leading-relaxed">
    {children}
  </p>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-muted text-foreground-strong rounded px-1.5 py-0.5 font-mono text-[0.85em]">
    {children}
  </code>
);

function Agents() {
  return (
    <Section
      id="agents"
      title="Use with Claude Code and Codex"
      lead="Install and sign in once per computer. Then tell your agent about Octonote once — per project or for every project."
    >
      <Sub id="claude-code" title="Claude Code">
        <CodeBlock
          code={`$ octonote setup claude            # this project's CLAUDE.md
$ octonote setup claude --global   # every project (~/.claude/CLAUDE.md)
$ octonote setup claude --skill    # also install the Octonote skill`}
        />
        <P>
          The skill loads the full guide whenever Octonote comes up. To skip the
          permission prompt each time Claude runs a command, allow it in{" "}
          <C>.claude/settings.json</C> (or <C>~/.claude/settings.json</C>):
        </P>
        <CodeBlock
          label=".claude/settings.json"
          code={`{ "permissions": { "allow": ["Bash(octonote:*)"] } }`}
        />
      </Sub>
      <Sub id="codex" title="Codex">
        <CodeBlock
          code={`$ octonote setup codex            # this project's AGENTS.md
$ octonote setup codex --global   # every project (~/.codex/AGENTS.md)`}
        />
        <P>
          Codex runs commands in a sandbox that blocks the network by default,
          so <C>octonote</C> would fail with <C>NETWORK</C>. Allow it (or
          approve the command when Codex asks):
        </P>
        <CodeBlock
          label="~/.codex/config.toml"
          code={`[sandbox_workspace_write]\nnetwork_access = true`}
        />
      </Sub>
      <Sub id="cloud" title="Cloud agents & CI">
        <P>
          Claude Code on the web, Codex cloud tasks and GitHub Actions can't
          open a browser. Create a token in{" "}
          <Link
            href="/workspace/settings#cli"
            className="text-foreground-strong underline underline-offset-4"
          >
            Settings → CLI &amp; agents
          </Link>{" "}
          and set it as the secret <C>OCTONOTE_TOKEN</C>.
        </P>
        <CodeBlock
          label="GitHub Actions"
          code={`- run: npm i -g ${INSTALL.replace("npm i -g ", "")}
- run: octonote note append pag_… --file CHANGELOG.md
  env:
    OCTONOTE_TOKEN: \${{ secrets.OCTONOTE_TOKEN }}`}
        />
      </Sub>
      <Sub title="What to ask">
        <div className="overflow-hidden rounded-xl border">
          {[
            [
              "“Write up this decision as a note in my Architecture notebook.”",
              "note create --file … --notebook Architecture",
            ],
            [
              "“Draw this flow as a canvas and publish it.”",
              "canvas create --from-mermaid flow.mmd --publish",
            ],
            [
              "“Document the auth flow with a diagram, side by side.”",
              "project create --note … --canvas-mermaid …",
            ],
            [
              "“Add today's progress to my Build log note.”",
              'search "Build log" → note append …',
            ],
            [
              "“Update my Onboarding note with these changes.”",
              "note pull … → edit → note push …",
            ],
            [
              "“Share it with sam@example.com as an editor.”",
              "share … --email sam@example.com --role editor",
            ],
          ].map(([ask, runs]) => (
            <div
              key={ask}
              className="grid gap-1 border-b px-4 py-3 last:border-b-0 md:grid-cols-2 md:gap-6"
            >
              <span className="text-foreground-strong text-sm">{ask}</span>
              <code className="text-muted-foreground font-mono text-xs leading-6">
                octonote {runs}
              </code>
            </div>
          ))}
        </div>
        <P>
          Agents only publish, share or delete when you ask for it — the guide
          tells them so, and <C>delete</C> needs <C>--yes</C>.
        </P>
      </Sub>
    </Section>
  );
}

function ReferenceSection() {
  return (
    <Section
      id="reference"
      title="Command reference"
      lead={`Every command in v${reference.version}, read from the CLI itself. Add --help to any command in your terminal for the same details.`}
    >
      <div className="flex flex-col gap-1">
        <p className="text-foreground-strong text-sm font-semibold">
          Global options
        </p>
        <OptionsTable
          options={reference.globalOptions as RefCommand["options"]}
        />
      </div>
      {GROUPS.map((g) => (
        <div
          key={g.id}
          id={g.id}
          className="flex scroll-mt-24 flex-col gap-4 pt-6"
        >
          <div>
            <h3 className="text-foreground-strong text-xl font-bold tracking-tight">
              {g.title}
            </h3>
            <p className="text-muted-foreground mt-1 text-[15px]">{g.blurb}</p>
          </div>
          <CodeBlock code={g.example} />
          {commands
            .filter((c) => g.match(c.name))
            .map((c) => (
              <CommandCard key={c.name} command={c} />
            ))}
        </div>
      ))}
    </Section>
  );
}

function CommandCard({ command: c }: { command: RefCommand }) {
  return (
    <div
      id={`cmd-${c.name.replace(/\s+/g, "-")}`}
      className="scroll-mt-24 rounded-xl border"
    >
      <div className="flex flex-col gap-1.5 border-b px-4 py-3">
        <code className="text-foreground-strong font-mono text-sm font-semibold break-words">
          {usage(c)}
        </code>
        <p className="text-muted-foreground text-sm">
          {c.description}
          {c.aliases.length ? (
            <span className="text-xs">
              {" "}
              · alias {c.aliases.map((a) => `“${a}”`).join(", ")}
            </span>
          ) : null}
        </p>
      </div>
      {c.arguments.length || c.options.length ? (
        <dl className="divide-y text-sm">
          {c.arguments.map((a) => (
            <Row
              key={a.name}
              name={`<${a.name}>`}
              text={a.description}
              extra={
                a.required
                  ? "required"
                  : a.default
                    ? `default: ${a.default}`
                    : "optional"
              }
            />
          ))}
          {c.options.map((o) => (
            <Row
              key={o.flags}
              name={o.flags}
              text={o.description}
              extra={
                o.required
                  ? "required"
                  : o.default
                    ? `default: ${o.default}`
                    : undefined
              }
            />
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function OptionsTable({ options }: { options: RefCommand["options"] }) {
  return (
    <dl className="divide-y rounded-xl border text-sm">
      {options.map((o) => (
        <Row
          key={o.flags}
          name={o.flags}
          text={o.description}
          extra={o.default ? `default: ${o.default}` : undefined}
        />
      ))}
    </dl>
  );
}

function Row({
  name,
  text,
  extra,
}: {
  name: string;
  text: string;
  extra?: string;
}) {
  return (
    <div className="grid gap-1 px-4 py-2.5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-4">
      <dt className="text-foreground-strong font-mono text-xs leading-6 break-words">
        {name}
      </dt>
      <dd className="text-muted-foreground leading-6">
        {text}
        {extra ? (
          <span className="text-muted-foreground/80 ml-2 text-xs">
            ({extra})
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function Content() {
  return (
    <Section
      id="content"
      title="Writing content"
      lead="Agents write plain text formats; Octonote turns them into rich notes and real canvases."
    >
      <Sub title="Notes: markdown">
        <P>
          Headings, paragraphs, bold/italic/code, bullet and numbered lists,
          checklists (<C>- [ ]</C>), tables, quotes, code blocks, images by URL,
          inline math <C>$x^2$</C>, display math <C>$$ … $$</C> or{" "}
          <C>```math</C>, and <C>```mermaid</C> blocks (rendered as diagrams
          inside the note). It's the same converter the editor uses when you
          paste markdown.
        </P>
      </Sub>
      <Sub title="Canvases: mermaid flowcharts">
        <P>
          Flowcharts become real canvas shapes with arrows attached to them — drag
          a box and its arrows follow.
        </P>
        <CodeBlock
          label="flow.mmd"
          code={`flowchart LR
  user((User)) --> api[API]
  api --> cache{Cache hit?}
  cache -->|yes| redis[(Redis)]
  cache -- no --> db[(Postgres)]
  subgraph workers [Background]
    queue([Queue]) -.-> worker[Worker]
  end
  db -.-> queue`}
        />
        <div className="overflow-hidden rounded-xl border text-sm">
          {[
            ["Directions", "graph|flowchart TD · TB · LR · RL · BT"],
            [
              "Shapes",
              "A[box] · A(round) · A([stadium]) · A((circle)) · A{decision} · A[(database)] · A{{hexagon}}",
            ],
            [
              "Arrows",
              "--> · --- · -.-> · ==> · <--> · labels: A -->|yes| B or A -- yes --> B",
            ],
            [
              "Also",
              "chains (A --> B --> C) · A & B --> C · subgraph id [Title] … end",
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="grid gap-1 border-b px-4 py-2.5 last:border-b-0 md:grid-cols-[8rem_minmax(0,1fr)]"
            >
              <span className="text-foreground-strong font-semibold">{k}</span>
              <code className="text-muted-foreground font-mono text-xs leading-6">
                {v}
              </code>
            </div>
          ))}
        </div>
        <P>
          Other mermaid diagrams (sequence, gantt, class…) can't become canvases
          — put them in a note as a <C>```mermaid</C> block instead. Raw canvas
          JSON works too: <C>canvas pull</C> / <C>canvas push</C>.
        </P>
      </Sub>
    </Section>
  );
}

function Auth() {
  return (
    <Section id="auth" title="Sign-in & tokens">
      <P>
        <C>octonote login</C> opens octonote.ai in your browser; click{" "}
        <b>Authorize</b> and the page hands a token to the CLI waiting on your
        computer. If your browser blocks that, the page shows the token to paste
        into the terminal. For agents and CI without a browser, use{" "}
        <C>OCTONOTE_TOKEN</C>.
      </P>
      <ul className="text-muted-foreground max-w-2xl list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
        <li>
          A token can do what you can do in the app — but can't create more
          tokens or delete your account.
        </li>
        <li>
          Tokens are stored hashed; you see each one once. Revoke any time in
          Settings → CLI &amp; agents.
        </li>
        <li>
          <C>octonote logout</C> revokes this computer's token. Sign-in lives in{" "}
          <C>~/.octonote/config.json</C> (readable only by you).
        </li>
      </ul>
      <div className="overflow-hidden rounded-xl border text-sm">
        {[
          [
            "OCTONOTE_TOKEN",
            "a token from Settings (wins over octonote login)",
          ],
          ["OCTONOTE_WORKSPACE", "workspace id (default: the one you own)"],
          [
            "OCTONOTE_API_URL / OCTONOTE_WEB_URL",
            "point at another Octonote (default: octonote.ai)",
          ],
          [
            "OCTONOTE_CONFIG_DIR",
            "where sign-in is kept (default: ~/.octonote)",
          ],
        ].map(([k, v]) => (
          <div
            key={k}
            className="grid gap-1 border-b px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
          >
            <code className="text-foreground-strong font-mono text-xs leading-6">
              {k}
            </code>
            <span className="text-muted-foreground">{v}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Contract() {
  return (
    <Section
      id="contract"
      title="For agent builders"
      lead="What scripts and agents can rely on."
    >
      <ul className="text-muted-foreground max-w-2xl list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
        <li>
          JSON on stdout when piped (force with <C>--json</C>); progress goes to
          stderr.
        </li>
        <li>
          Never prompts: content comes from <C>--file</C>, <C>--stdin</C> or{" "}
          <C>-</C>.
        </li>
        <li>
          Every result has <C>id</C>, <C>url</C> and, once published,{" "}
          <C>publicUrl</C>. Errors are{" "}
          <C>{`{"error":{"code","message","hint"}}`}</C> with a non-zero exit
          code.
        </li>
      </ul>
      <div className="overflow-hidden rounded-xl border text-sm">
        {[
          ["2", "USAGE", "a wrong flag or argument"],
          [
            "3",
            "NOT_LOGGED_IN · UNAUTHORIZED",
            "sign in, or a fresh OCTONOTE_TOKEN",
          ],
          [
            "4",
            "NOT_FOUND · FORBIDDEN",
            "wrong id, deleted, or not shared with you",
          ],
          ["5", "PLAN_LIMIT", "the workspace hit the Free plan limit"],
          [
            "6",
            "NETWORK · SERVER_ERROR",
            "connection problem; safe reads retry automatically",
          ],
          [
            "1",
            "MERMAID_INVALID · WEB_SESSION_REQUIRED · …",
            "other errors, with a hint",
          ],
        ].map(([exit, code, meaning]) => (
          <div
            key={code}
            className="grid gap-1 border-b px-4 py-2.5 last:border-b-0 md:grid-cols-[4rem_minmax(0,16rem)_minmax(0,1fr)]"
          >
            <span className="text-foreground-strong font-mono text-xs leading-6">
              exit {exit}
            </span>
            <code className="text-foreground-strong font-mono text-xs leading-6">
              {code}
            </code>
            <span className="text-muted-foreground">{meaning}</span>
          </div>
        ))}
      </div>
      <details className="rounded-xl border">
        <summary className="text-foreground-strong cursor-pointer px-4 py-3 text-sm font-semibold">
          What <C>octonote setup</C> adds to CLAUDE.md / AGENTS.md
        </summary>
        <pre className="text-muted-foreground overflow-x-auto border-t px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {reference.projectSection}
        </pre>
      </details>
      <details className="rounded-xl border">
        <summary className="text-foreground-strong cursor-pointer px-4 py-3 text-sm font-semibold">
          The full agent guide (<C>octonote guide</C>)
        </summary>
        <pre className="text-muted-foreground overflow-x-auto border-t px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {reference.guide}
        </pre>
      </details>
    </Section>
  );
}

function Troubleshooting() {
  return (
    <Section id="troubleshooting" title="Troubleshooting">
      <div className="overflow-hidden rounded-xl border text-sm">
        {[
          [
            "“octonote: command not found”",
            "npm's global folder isn't on your PATH (rare: npm and nvm normally set it up). Add export PATH=\"$(npm prefix -g)/bin:$PATH\" to ~/.zshrc or ~/.bashrc and open a new terminal. With nvm, install again after switching Node versions.",
          ],
          [
            "“You're not signed in”",
            "Run octonote login — or set OCTONOTE_TOKEN for agents and CI.",
          ],
          [
            "Authorize page says “One more step”",
            "Your browser blocked the page from reaching the CLI. Copy the token and paste it into the terminal where octonote login is waiting.",
          ],
          [
            "NETWORK errors inside Codex",
            "Codex's sandbox blocks the network by default — see the Codex section above.",
          ],
          [
            "Claude asks permission every time",
            "Allow Bash(octonote:*) in .claude/settings.json.",
          ],
          [
            "MERMAID_INVALID",
            "Only flowcharts become canvases; the error names the line. Put other diagrams in a note as a ```mermaid block.",
          ],
          [
            "PLAN_LIMIT",
            "The workspace has 10 of that kind on the Free plan. Upgrade in Settings → Plan & billing, or delete something.",
          ],
          [
            "A token stopped working",
            "It was revoked or expired. Run octonote login again, or create a new one in Settings.",
          ],
        ].map(([problem, fix]) => (
          <div
            key={problem}
            className="grid gap-1 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-4"
          >
            <span className="text-foreground-strong font-semibold">
              {problem}
            </span>
            <span className="text-muted-foreground">{fix}</span>
          </div>
        ))}
      </div>
      <P>
        Still stuck? Email{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-foreground-strong underline underline-offset-4"
        >
          {SUPPORT_EMAIL}
        </a>{" "}
        with the command you ran and its output.
      </P>
    </Section>
  );
}
