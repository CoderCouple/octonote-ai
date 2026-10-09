// DEVELOPMENT ONLY: points the local dev config at this Mac's current LAN IP.
// Run after switching networks (office ↔ home): `pnpm dev:ip`, or
// `pnpm dev:ip 192.168.1.88` to force an address. Rewrites every private
// LAN IPv4 in the files below to the new one; prints only file names.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

const FILES = [".env", "apps/web/.env.local", "apps/mobile/.env", "supabase/config.toml"];

// 10.x, 172.16–31.x, 192.168.x — never loopback, 0.0.0.0 or Docker-internal hostnames.
const PRIVATE_IP = /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g;

function currentIp() {
  for (const iface of ["en0", "en1"]) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (ip) return ip;
    } catch {}
  }
  for (const addrs of Object.values(networkInterfaces())) {
    const hit = addrs?.find((a) => a.family === "IPv4" && !a.internal && a.address.match(PRIVATE_IP));
    if (hit) return hit.address;
  }
  return null;
}

const ip = process.argv[2] ?? currentIp();
if (!ip?.match(new RegExp(`^${PRIVATE_IP.source}$`))) {
  console.error(`No private LAN IP found${ip ? ` (got ${ip})` : ""}. Pass one: pnpm dev:ip 192.168.x.y`);
  process.exit(1);
}

const root = new URL("../", import.meta.url);
let changed = 0;
for (const file of FILES) {
  const url = new URL(file, root);
  if (!existsSync(url)) {
    console.log(`  skip     ${file} (missing)`);
    continue;
  }
  const before = readFileSync(url, "utf8");
  const after = before.replace(PRIVATE_IP, ip);
  if (after === before) {
    console.log(`  ok       ${file}`);
    continue;
  }
  writeFileSync(url, after);
  changed++;
  console.log(`  updated  ${file}`);
}

console.log(`\nLAN IP is ${ip}.`);
if (changed) {
  console.log(`Restart so the new IP is picked up:
  supabase stop && supabase start
  pnpm --filter @octonote/api dev
  pnpm --filter @octonote/web dev -H 0.0.0.0
  pnpm --filter @octonote/mobile start --lan    then open exp://${ip}:8081 in Expo Go`);
}
