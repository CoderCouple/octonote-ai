/**
 * Shared fixtures for the canvas suite:
 * - `session`  the dev user's tokens (signed in once by global-setup)
 * - `api`      an API client; everything it creates is deleted after the test
 * - `enter`    opens an app path signed in, through the mobile handoff route
 *              `/embed/enter?to=<path>#at=…&rt=…` (tokens in the fragment)
 * - console guard: every page in the test's browser context is watched for
 *   page errors, console errors and API 5xx responses; the test fails on any
 *   that aren't on the known-noise list below.
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { Api } from "./api";
import { readSession, type Session } from "./auth";
import { API_URL } from "./env";

/**
 * Known noise. Keep each entry justified; anything else fails the test.
 */
const ALLOWED_CONSOLE: RegExp[] = [
  // React dev-mode hydration/HMR chatter from `next dev`.
  /Download the React DevTools/,
  /\[HMR\]|\[Fast Refresh\]/,
  // Browser logs every failed resource load as a console error; HTTP failures
  // are judged separately below (5xx fail; 4xx are often expected, e.g. a
  // signed-out visitor probing an unpublished page).
  /Failed to load resource: the server responded with a status of 4\d\d/,
];

export interface ConsoleProblems {
  errors: string[];
  allowed: RegExp[];
  /** Adds patterns allowed for the current test only (e.g. an expected 404 page). */
  allow(pattern: RegExp): void;
}

/**
 * `next dev` draws its dev-tools badge (a <nextjs-portal>) and the TanStack
 * Query devtools button (dev only) over the bottom-left
 * corner, where the canvas has Undo/Redo. Hide it; errors are still caught by
 * the console guard.
 */
const HIDE_DEV_OVERLAY = `(() => {
  const add = () => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal, .tsqd-parent-container { display: none !important; }";
    document.documentElement.appendChild(s);
  };
  if (document.documentElement) add(); else document.addEventListener("DOMContentLoaded", add);
})();`;

function watch(context: BrowserContext, sink: string[], allowed: RegExp[]): void {
  void context.addInitScript(HIDE_DEV_OVERLAY);
  const attach = (page: Page) => {
    page.on("pageerror", (e) => sink.push(`pageerror on ${page.url()}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (ALLOWED_CONSOLE.some((r) => r.test(text)) || allowed.some((r) => r.test(text))) return;
      sink.push(`console.error on ${page.url()}: ${text.slice(0, 400)}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500 && !allowed.some((re) => re.test(r.url())))
        sink.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    });
  };
  context.pages().forEach(attach);
  context.on("page", attach);
}

type Fixtures = {
  session: Session;
  api: Api;
  consoleProblems: ConsoleProblems;
  enter: (path: string, page?: Page) => Promise<Page>;
  /** Opens a new signed-out browser context (own console guard). */
  anonContext: (options?: Parameters<import("@playwright/test").Browser["newContext"]>[0]) => Promise<BrowserContext>;
};

export const test = base.extend<Fixtures>({
  session: async ({}, use) => {
    await use(readSession());
  },

  api: async ({ session }, use, testInfo) => {
    const api = new Api(session.accessToken, session.workspaceId);
    await use(api);
    const problems = await api.cleanup();
    if (problems.length) testInfo.annotations.push({ type: "cleanup", description: problems.join("\n") });
  },

  consoleProblems: [
    async ({ context }, use) => {
      const errors: string[] = [];
      const allowed: RegExp[] = [];
      watch(context, errors, allowed);
      await use({ errors, allowed, allow: (p) => void allowed.push(p) });
      expect(errors, "unexpected page/console errors").toEqual([]);
    },
    { auto: true },
  ],

  enter: async ({ page, session }, use) => {
    await use(async (path, target = page) => {
      const url = `/embed/enter?to=${encodeURIComponent(path)}#at=${session.accessToken}&rt=${session.refreshToken}`;
      await target.goto(url);
      await target.waitForURL((u) => u.pathname === path.split("?")[0], { timeout: 60_000 });
      return target;
    });
  },

  anonContext: async ({ browser, consoleProblems }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const ctx = await browser.newContext(options);
      // Share the test's sink so signed-out pages are guarded too.
      watch(ctx, consoleProblems.errors, consoleProblems.allowed);
      contexts.push(ctx);
      return ctx;
    });
    for (const c of contexts) await c.close();
  },
});

export { expect };
export { API_URL };

/** Title prefix for everything the suite creates. */
export const e2eTitle = (what: string) => `E2E ${what} ${Date.now().toString(36)}`;
