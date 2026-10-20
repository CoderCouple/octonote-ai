#!/usr/bin/env node
/**
 * Student Pro for universities worldwide: turns Hipo's university-domains-list
 * (MIT licence, ~10k universities in ~200 countries) into SQL rows for
 * `student_email_suffixes`, with each school's name, country, state/province
 * and website. Safe to re-run when the list updates: rows from the list are
 * refreshed, rows added by hand are never touched.
 *
 *   node scripts/university-domains-sql.mjs > /tmp/unis.sql
 *   set -a; . ./.env.hosted; set +a; psql "$DATABASE_URL" -f /tmp/unis.sql
 *
 * Pass a local copy of the JSON as the first argument to skip the download.
 */
import { readFileSync } from "node:fs";

const URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
/** Webmail and other shared domains that must never grant student Pro. */
const NEVER =
  /^(gmail\.com|googlemail\.com|icloud\.com|aol\.com|proton\.me|protonmail\.com|qq\.com|163\.com|126\.com|mail\.ru|web\.de|(yahoo|hotmail|outlook|live|yandex|gmx)\.[a-z.]+)$/;

const list = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : await (await fetch(URL)).json();

const rows = new Map();
for (const uni of list) {
  for (const raw of uni.domains ?? []) {
    const domain = raw.trim().toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (NEVER.test(domain)) continue;
    // `.edu` is already one row; skip its thousands of subdomains.
    if (domain.endsWith(".edu")) continue;
    if (rows.has(domain)) continue;
    const code = String(uni.alpha_two_code ?? "").toUpperCase();
    rows.set(domain, {
      university: uni.name?.trim() || null,
      countryCode: /^[A-Z]{2}$/.test(code) ? code : null,
      country: uni.country?.trim() || null,
      region: uni["state-province"]?.trim() || null,
      website: uni.web_pages?.[0]?.trim() || null,
    });
  }
}

const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const values = [...rows].map(
  ([d, r]) =>
    `(${q(d)}, 'hipo', ${q(r.university)}, ${q(r.countryCode)}, ${q(r.country)}, ${q(r.region)}, ${q(r.website)})`,
);
// The first import (2026-10-20) stored "Name (Country)" as the label; such
// rows are claimed as list rows and the label cleared. Anything else that
// isn't from the list was added by hand and is left alone.
const legacy = `EXCLUDED.university || ' (' || EXCLUDED.country || ')'`;
console.log("BEGIN;");
for (let i = 0; i < values.length; i += 1000) {
  console.log(`INSERT INTO student_email_suffixes (suffix, source, university, country_code, country, region, website) VALUES
${values.slice(i, i + 1000).join(",\n")}
ON CONFLICT (suffix) DO UPDATE SET
  source = 'hipo',
  university = EXCLUDED.university,
  country_code = EXCLUDED.country_code,
  country = EXCLUDED.country,
  region = EXCLUDED.region,
  website = EXCLUDED.website,
  label = CASE WHEN student_email_suffixes.label = ${legacy} THEN NULL ELSE student_email_suffixes.label END,
  updated_at = now()
WHERE student_email_suffixes.source = 'hipo' OR student_email_suffixes.label = ${legacy};`);
}
console.log("COMMIT;");
console.error(`${rows.size} university domains`);
