/**
 * Auth page frame: the form on the left; on large screens a black panel on the
 * right (always dark, like the mobile splash) showing a live feature demo.
 */
import { ArrowLeft, Bot, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Aura } from "@/app/(marketing)/_components/aura";
import { FeatureCarousel } from "./feature-carousel";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh">
      <div className="flex min-w-0 flex-1 flex-col px-6 py-6 md:px-10">
        <header>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground-strong inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Home
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-12">
          {children}
        </main>

        {/* Small screens: the same tour, below the form so sign-in stays first. */}
        <section className="dark -mx-3 mb-[-12px] overflow-hidden rounded-3xl border lg:hidden">
          <div className="bg-background text-foreground relative px-6 py-10 sm:px-10">
            <Aura />
            <p className="text-muted-foreground relative mb-6 text-sm font-medium">
              What you can do with Octonote AI
            </p>
            <div className="relative">
              <FeatureCarousel />
            </div>
          </div>
        </section>
      </div>

      {/* `dark` scopes the dark tokens to this panel, whatever the app theme. */}
      <aside className="dark relative m-3 hidden w-[46%] max-w-[760px] overflow-hidden rounded-3xl border lg:block">
        <div className="bg-background text-foreground absolute inset-0 flex flex-col justify-center p-12 xl:p-16">
          <Aura />
          <p className="text-foreground-strong relative mb-10 flex items-center gap-1.5 text-lg font-semibold whitespace-nowrap">
            The AI workspace for
            <User aria-hidden className="ml-1 size-4" strokeWidth={2.5} />
            Humans
            <span className="text-foreground-subtle">and</span>
            <Bot aria-hidden className="size-4" strokeWidth={2.5} />
            Agents.
          </p>
          <div className="relative">
            <FeatureCarousel />
          </div>
        </div>
      </aside>
    </div>
  );
}
