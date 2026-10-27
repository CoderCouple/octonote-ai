/**
 * Shared layout of /claude and /chatgpt: Octonote used from a chat assistant
 * through the MCP server. The chat is built, not a screenshot, and neutral —
 * it doesn't imitate either app's interface.
 */
import { ArrowUpRight, Check, ExternalLink, Focus, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSISTANT_POINTS, ASSISTANT_PROMPTS, MCP_URL, PROOF, type Assistant } from "../_data/assistants";
import { ClosingCta, Faqs, Points } from "./content-page";
import { CopyField } from "./copy-field";

export function AssistantLanding({ assistant, faqs }: { assistant: Assistant; faqs: { q: string; a: string }[] }) {
  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <header className="mx-auto max-w-4xl text-center">
        <p className="text-muted-foreground text-lg font-medium">{assistant.eyebrow}</p>
        <h1 className="text-foreground-strong mt-5 text-4xl leading-[1.1] font-bold md:text-6xl">{assistant.heroTitle}</h1>
        <p className="text-muted-foreground mx-auto mt-8 max-w-3xl text-xl md:text-2xl">{assistant.intro}</p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <CopyField value={MCP_URL} label="Connector URL" />
          <Button asChild variant="outline" size="lg" className="h-12 gap-2 rounded-lg px-5">
            <a href={assistant.openUrl} target="_blank" rel="noreferrer">
              {assistant.openLabel}
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      <ChatMock name={assistant.name} />

      <Points title={`What ${assistant.name} can do in Octonote`} points={ASSISTANT_POINTS} />

      <section className="mx-auto mt-28 max-w-6xl">
        <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">Connect in a minute</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {assistant.steps.map((s, i) => (
            <li key={s.title} className="bg-card rounded-2xl border p-6">
              <span className="bg-muted text-foreground-strong grid size-8 place-items-center rounded-full text-sm font-semibold">
                {i + 1}
              </span>
              <h3 className="text-foreground-strong mt-4 text-xl font-semibold">{s.title}</h3>
              <p className="text-muted-foreground mt-2 text-lg">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex justify-center">
          <CopyField value={MCP_URL} label="Connector URL" />
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-4xl">
        <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">Things to ask</h2>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {ASSISTANT_PROMPTS.map((p) => (
            <li key={p} className="bg-card text-foreground flex gap-3 rounded-xl border px-4 py-3.5 text-base">
              <Sparkles className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span>“{p}”</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto mt-28 max-w-4xl">
        <a
          href={PROOF.href}
          className="bg-card hover:border-foreground-subtle group flex flex-col gap-3 rounded-2xl border p-8 transition-colors md:p-10"
        >
          <span className="text-muted-foreground text-sm font-medium">Made with Octonote</span>
          <span className="text-foreground-strong text-2xl font-bold md:text-3xl">{PROOF.title}</span>
          <span className="text-muted-foreground text-lg">{PROOF.body}</span>
          <span className="text-muted-foreground group-hover:text-foreground-strong mt-2 flex items-center gap-1 text-base font-medium">
            Read the guide <ArrowUpRight className="size-4" />
          </span>
        </a>
      </section>

      <Faqs faqs={faqs} />
      <ClosingCta title={`Give ${assistant.name} somewhere to keep things.`} />
    </div>
  );
}

/** A neutral chat: the ask, the tool call, and the project it made. */
function ChatMock({ name }: { name: string }) {
  return (
    <div className="mx-auto mt-20 max-w-3xl">
      <div className="bg-card rounded-2xl border p-4 shadow-sm md:p-6">
        <div className="flex justify-end">
          <p className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-base">
            Explain how sign-in works in this repo as a project, with a diagram.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <span className="text-muted-foreground text-sm font-medium">{name}</span>
          <div className="text-muted-foreground flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
            <Wrench className="size-3.5" />
            <span>
              Octonote · <code className="font-mono">create_project</code>
            </span>
            <Check className="size-3.5" />
          </div>
          <p className="text-foreground text-base">
            Done. I made <b>Sign-in flow</b>: a write-up of each step next to a diagram of the flow.
          </p>

          <div className="bg-background overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md">
                <Focus className="size-3.5" strokeWidth={2.25} />
              </span>
              <span className="text-foreground-strong text-sm font-semibold">Sign-in flow</span>
              <span className="text-muted-foreground ml-auto text-xs">Project · note + canvas</span>
            </div>
            <div className="grid sm:grid-cols-2">
              <div className="space-y-2 border-b p-4 sm:border-r sm:border-b-0">
                <p className="text-foreground-strong text-sm font-semibold">How sign-in works</p>
                <div className="bg-muted h-2 w-11/12 rounded" />
                <div className="bg-muted h-2 w-4/5 rounded" />
                <div className="bg-muted h-2 w-9/12 rounded" />
                <p className="text-foreground-strong pt-2 text-sm font-semibold">Sessions</p>
                <div className="bg-muted h-2 w-10/12 rounded" />
                <div className="bg-muted h-2 w-7/12 rounded" />
              </div>
              <MiniFlow />
            </div>
          </div>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            octonote.ai/p/… <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** The canvas side of the card: a tiny flowchart in the design tokens' colours. */
function MiniFlow() {
  const box = "fill-[var(--color-background)] stroke-[var(--color-foreground-subtle)]";
  const text = "fill-[var(--color-foreground-strong)] text-[10px]";
  return (
    <svg viewBox="0 0 260 150" className="h-40 w-full p-3" role="img" aria-label="A small flowchart: user, login, check password, dashboard or error">
      <defs>
        <marker id="mini-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="fill-[var(--color-foreground-subtle)]" />
        </marker>
      </defs>
      <g className="stroke-[var(--color-foreground-subtle)]" strokeWidth="1.2" markerEnd="url(#mini-arrow)">
        <line x1="58" y1="30" x2="92" y2="30" />
        <line x1="148" y1="30" x2="178" y2="30" />
        <line x1="205" y1="42" x2="205" y2="70" />
        <line x1="190" y1="100" x2="150" y2="118" />
        <line x1="220" y1="100" x2="222" y2="116" />
      </g>
      <rect x="8" y="16" width="50" height="28" rx="14" className={box} />
      <text x="33" y="34" textAnchor="middle" className={text}>User</text>
      <rect x="92" y="16" width="56" height="28" rx="6" className={box} />
      <text x="120" y="34" textAnchor="middle" className={text}>Login</text>
      <rect x="178" y="16" width="56" height="28" rx="6" className={box} />
      <text x="206" y="34" textAnchor="middle" className={text}>API</text>
      <path d="M205 70 L235 85 L205 100 L175 85 Z" className={box} />
      <text x="205" y="88" textAnchor="middle" className={text}>OK?</text>
      <rect x="92" y="114" width="60" height="26" rx="6" className={box} />
      <text x="122" y="131" textAnchor="middle" className={text}>Dashboard</text>
      <rect x="196" y="116" width="52" height="26" rx="6" className={box} />
      <text x="222" y="133" textAnchor="middle" className={text}>Error</text>
    </svg>
  );
}
