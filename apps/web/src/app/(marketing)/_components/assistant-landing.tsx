/**
 * Shared layout of /claude and /chatgpt: Octonote used from a chat assistant
 * through the MCP server. The demo video is a built animation with a neutral
 * chat window — it doesn't imitate either app's interface.
 */
import { ArrowUpRight, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSISTANT_POINTS, ASSISTANT_PROMPTS, MCP_URL, PROOF, type Assistant } from "../_data/assistants";
import { ClosingCta, Faqs, Points } from "./content-page";
import { CopyField } from "./copy-field";
import { DemoVideo } from "./demo-video";

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

      <div className="mx-auto mt-20 max-w-5xl">
        <DemoVideo label={`Demo: asking ${assistant.name} to write a note, draw a canvas and publish it with Octonote`} />
      </div>

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
