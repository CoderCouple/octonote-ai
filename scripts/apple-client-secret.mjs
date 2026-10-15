#!/usr/bin/env node
// Generates the "Sign in with Apple" client secret Supabase needs: an ES256 JWT
// signed with your .p8 key. Apple caps its lifetime at 6 months, so re-run this
// (and `supabase config push`) before it expires.
//
//   node scripts/apple-client-secret.mjs --p8 ~/Downloads/AuthKey_ABC123.p8 \
//     --team TEAMID1234 --key ABC123 --client ai.octonote.signin
//
// Writes APPLE_OAUTH_CLIENT_ID and APPLE_OAUTH_SECRET into .env.hosted (creating or
// replacing those lines) and prints only the expiry date — never the secret.
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
for (const k of ["p8", "team", "key", "client"]) {
  if (!args[k]) {
    console.error(`✗ Missing --${k}. See the usage at the top of this file.`);
    process.exit(1);
  }
}

const SIX_MONTHS = 180 * 24 * 60 * 60; // a little under Apple's 15777000s limit
const now = Math.floor(Date.now() / 1000);
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

const header = { alg: "ES256", kid: args.key, typ: "JWT" };
const payload = {
  iss: args.team,
  iat: now,
  exp: now + SIX_MONTHS,
  aud: "https://appleid.apple.com",
  sub: args.client,
};
const input = `${b64url(header)}.${b64url(payload)}`;
const p8 = readFileSync(args.p8.replace(/^~/, os.homedir()), "utf8");
const signature = sign("sha256", Buffer.from(input), {
  key: createPrivateKey(p8),
  dsaEncoding: "ieee-p1363", // JWT wants raw r||s, not DER
}).toString("base64url");
const jwt = `${input}.${signature}`;

const envPath = args.env ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.hosted");
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const upsert = (name, value) => {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\n?$/, "\n")}${line}\n`;
};
upsert("APPLE_OAUTH_CLIENT_ID", args.client);
upsert("APPLE_OAUTH_SECRET", jwt);
writeFileSync(envPath, env);

const expires = new Date((now + SIX_MONTHS) * 1000).toISOString().slice(0, 10);
console.log(`✓ Wrote APPLE_OAUTH_CLIENT_ID and APPLE_OAUTH_SECRET to .env.hosted`);
console.log(`  Secret expires ${expires} — regenerate and re-run \`supabase config push\` before then.`);
