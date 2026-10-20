/**
 * Where a sign-up came from: the web app sends the source (e.g. the end of a
 * published page) with the first /me call; it's stored once, on new accounts
 * only, and anything that isn't a plain "kind:slug" is ignored.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schemas";
import { createHarness, type Harness } from "./harness";

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});

const supabaseUser = (id: string, email: string) =>
  ({
    id,
    email,
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  }) as never;

async function refOf(id: string) {
  const [row] = await h.db.select().from(schema.users).where(eq(schema.users.id, id));
  return row?.signupRef ?? null;
}

describe("sign-up source", () => {
  it("is stored on a new account", async () => {
    await h.me.sync(supabaseUser("usr_new1", "new1@example.com"), {
      signupRef: "pub:rate-limiter-x7q2",
    });
    expect(await refOf("usr_new1")).toBe("pub:rate-limiter-x7q2");
  });

  it("is never added to an existing account or changed later", async () => {
    const alice = await h.signIn("alice@example.com");
    await h.me.sync(supabaseUser(alice.id, alice.email), { signupRef: "pub:later" });
    expect(await refOf(alice.id)).toBeNull();

    await h.me.sync(supabaseUser("usr_new2", "new2@example.com"), { signupRef: "pub-header" });
    await h.me.sync(supabaseUser("usr_new2", "new2@example.com"), { signupRef: "pub:other" });
    expect(await refOf("usr_new2")).toBe("pub-header");
  });

  it("ignores anything that isn't a plain source", async () => {
    for (const [i, bad] of ["<script>", "pub:a:b", "PUB", "x".repeat(81), ""].entries()) {
      await h.me.sync(supabaseUser(`usr_bad${i}`, `bad${i}@example.com`), { signupRef: bad });
      expect(await refOf(`usr_bad${i}`)).toBeNull();
    }
  });
});
