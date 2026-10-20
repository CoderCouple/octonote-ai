/**
 * The top of octonote.ai/cli: a short product page for the CLI (hero,
 * use cases, install, first command, examples), before the full docs.
 */
import { ArrowRight, Bot, Globe, Terminal, Workflow } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INSTALL } from "../_data/install";
import { CodeBlock } from "./code-block";
import { TerminalWindow } from "./terminal-window";

export function CliHero({ version }: { version: string }) {
  return (
    <section className="mx-auto max-w-4xl pb-16 text-center md:pb-24">
      <p className="text-muted-foreground text-sm font-medium">
        Octonote CLI · v{version}
      </p>
      <h1 className="text-foreground-strong md:text-display-xl mt-4 text-5xl leading-[1.05] font-bold tracking-tight">
        Command your notes.
      </h1>
      <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg md:mt-6 md:text-xl">
        Write, draw, find and publish your notes and canvases from the terminal
        — or let Claude Code and Codex do it for you.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <Button asChild size="lg" className="h-12 gap-2 px-6 text-base">
          <Link href="#install">
            Install the CLI <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="h-12 px-6 text-base"
        >
          <Link href="#docs">Read the docs</Link>
        </Button>
      </div>
      <div className="mx-auto mt-12 max-w-3xl md:mt-16">
        <TerminalWindow
          code={`# Write a note from markdown
octonote note create "Standup" --file standup.md --notebook "Work"

# Draw a diagram from mermaid, and publish it
octonote canvas create "Login flow" --from-mermaid flow.mmd --publish

# Find anything in your workspace
octonote search onboarding`}
        />
      </div>
    </section>
  );
}

const USES = [
  {
    icon: Bot,
    title: "Ask.",
    body: "Claude Code and Codex save your notes and diagrams, then find them again in any later session — with your permissions.",
  },
  {
    icon: Workflow,
    title: "Automate.",
    body: "Append changelogs, build logs and reports from scripts, cron jobs and CI with a token.",
  },
  {
    icon: Globe,
    title: "Publish.",
    body: "Turn a markdown file or a mermaid flowchart into a public page with one flag.",
  },
  {
    icon: Terminal,
    title: "Tinker.",
    body: "Pull a note to a file, edit it in your editor, push it back. JSON whenever you pipe.",
  },
];

export function CliUses() {
  return (
    <section className="border-t py-16 md:py-24">
      <h2 className="text-foreground-strong mx-auto max-w-3xl text-center text-3xl font-bold tracking-tight md:text-5xl">
        A programmatic playground for your notes.
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-14 lg:grid-cols-4">
        {USES.map((u) => (
          <div key={u.title} className="rounded-2xl border p-6 text-left">
            <u.icon className="text-foreground-strong size-5" />
            <h3 className="text-foreground-strong mt-4 text-xl font-semibold">
              {u.title}
            </h3>
            <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
              {u.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const NODE: Record<string, { code: string; note: string }> = {
  macOS: {
    code: "$ brew install node",
    note: "Or the installer from nodejs.org. Any Node 20 or newer works.",
  },
  Windows: {
    code: "$ winget install OpenJS.NodeJS.LTS",
    note: "Or the installer from nodejs.org. Open a new terminal afterwards so npm is on your PATH.",
  },
  Linux: {
    code: "$ sudo apt install nodejs npm",
    note: "Or your distro's package manager, or nvm. Any Node 20 or newer works.",
  },
};

export function CliInstall() {
  return (
    <section id="install" className="scroll-mt-24 border-t py-16 md:py-24">
      <h2 className="text-foreground-strong text-center text-3xl font-bold tracking-tight md:text-5xl">
        Install the Octonote CLI
      </h2>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-center text-lg">
        Three steps, once per computer. Running{" "}
        <code className="font-mono">octonote</code> on its own prints a
        getting-started screen with all of this.
      </p>
      <Tabs
        defaultValue="macOS"
        className="mx-auto mt-10 w-full max-w-3xl items-center"
      >
        <TabsList>
          {Object.keys(NODE).map((os) => (
            <TabsTrigger key={os} value={os} className="px-4">
              {os}
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(NODE).map(([os, node]) => (
          <TabsContent key={os} value={os} className="mt-6 w-full min-w-0">
            <ol className="flex flex-col gap-6 text-left">
              <Step n="01" title="Get Node.js" note={node.note}>
                <CodeBlock code={node.code} />
              </Step>
              <Step
                n="02"
                title="Install the CLI"
                note="No PATH setup needed: npm puts octonote next to node."
              >
                <CodeBlock code={`$ ${INSTALL}`} />
              </Step>
              <Step
                n="03"
                title="Sign in"
                note="Opens octonote.ai in your browser; click Authorize. Agents and CI use a token from Settings instead."
              >
                <CodeBlock code="$ octonote login" />
              </Step>
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function Step({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[4rem_minmax(0,1fr)]">
      <span className="text-muted-foreground font-mono text-2xl font-semibold">
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-foreground-strong text-lg font-semibold">
          {title}
        </h3>
        {children}
        <p className="text-muted-foreground text-sm">{note}</p>
      </div>
    </li>
  );
}

export function CliFirstRun() {
  return (
    <section className="border-t py-16 md:py-24">
      <h2 className="text-foreground-strong text-center text-3xl font-bold tracking-tight md:text-5xl">
        Run your first command
      </h2>
      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 md:mt-14 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border p-6 text-left">
          <h3 className="text-foreground-strong text-xl font-semibold">
            Write a note
          </h3>
          <p className="text-muted-foreground text-[15px]">
            Markdown in, a rich note out, with math, code, tables and mermaid.
            The link comes back so you can open it.
          </p>
          <CodeBlock
            code={`$ printf "# Hello\\n\\nMy first note from the terminal.\\n" \\
    | octonote note create "Hello" --stdin
$ octonote list`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border p-6 text-left">
          <h3 className="text-foreground-strong text-xl font-semibold">
            Hand it to your agent
          </h3>
          <p className="text-muted-foreground text-[15px]">
            One command teaches Claude Code (or Codex). Then just ask:{" "}
            <i>
              “Write up the auth flow in my Architecture notebook, with a
              diagram.”
            </i>
          </p>
          <CodeBlock
            code={`$ octonote setup claude --skill
$ octonote setup codex      # for Codex`}
          />
        </div>
      </div>
    </section>
  );
}

const EXAMPLES: { tab: string; title: string; code: string }[] = [
  {
    tab: "Basics",
    title: "terminal",
    code: `# List your projects, or search by title
octonote list --kind project
octonote search "rate limit"

# Edit a note in your own editor
octonote note pull pag_… -o plan.md
octonote note push plan.md

# Add a line to a running log, then publish
octonote note append pag_… --text "- shipped the CLI page"
octonote publish prj_…`,
  },
  {
    tab: "Agents",
    title: "Claude Code",
    code: `# Teach Claude Code once (Codex: octonote setup codex)
octonote setup claude --skill

# Then just ask. Claude runs, for example:
octonote project create "Cache bug" --note bug.md --canvas-mermaid bug.mmd --notebook Research

# A week later, in a new session:
octonote search "rate limit"
octonote note show pag_…`,
  },
  {
    tab: "Automation",
    title: ".github/workflows/release.yml",
    code: `# Append the changelog to a note on every release
- run: npm i -g ${INSTALL.replace("npm i -g ", "")}
- run: octonote note append pag_… --file CHANGELOG.md
  env:
    OCTONOTE_TOKEN: \${{ secrets.OCTONOTE_TOKEN }}`,
  },
];

export function CliExamples() {
  return (
    <section className="border-t py-16 md:py-24">
      <h2 className="text-foreground-strong text-center text-3xl font-bold tracking-tight md:text-5xl">
        See it in action
      </h2>
      <Tabs
        defaultValue="Basics"
        className="mx-auto mt-10 w-full max-w-4xl items-center"
      >
        <TabsList>
          {EXAMPLES.map((e) => (
            <TabsTrigger key={e.tab} value={e.tab} className="px-4">
              {e.tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {EXAMPLES.map((e) => (
          <TabsContent
            key={e.tab}
            value={e.tab}
            className="mt-6 w-full min-w-0"
          >
            <TerminalWindow title={e.title} code={e.code} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

export function CliCta() {
  return (
    <section className="border-t py-16 text-center md:py-24">
      <h2 className="text-foreground-strong text-3xl font-bold tracking-tight md:text-5xl">
        Get started
      </h2>
      <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
        Free to start. Your notes, your agent's notes, one place.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <Button asChild size="lg" className="h-12 gap-2 px-6 text-base">
          <Link href="/signup">
            Create a free account <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="h-12 px-6 text-base"
        >
          <Link href="#reference">Command reference</Link>
        </Button>
      </div>
    </section>
  );
}
