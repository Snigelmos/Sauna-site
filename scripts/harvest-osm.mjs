#!/usr/bin/env node
/**
 * scripts/harvest-osm.mjs
 *
 * FREE base harvest. Queries the OpenStreetMap Overpass API for sauna / bath
 * venues across Sweden and writes normalized candidate records to
 * data/raw/osm-saunas.json for the merge step to consume.
 *
 * OSM data is ODbL-licensed: it is free to use and store, but attribution is
 * required ("(c) OpenStreetMap contributors"). The site footer/methodology
 * must credit OSM.
 *
 * No API key needed. We send a descriptive User-Agent and a generous timeout,
 * and we retry once against a mirror if the main endpoint is busy (429/504).
 *
 * Usage:
 *   node scripts/harvest-osm.mjs                 # write data/raw/osm-saunas.json
 *   node scripts/harvest-osm.mjs --out path.json
 *   node scripts/harvest-osm.mjs --print         # also print a short summary
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const USER_AGENT =
  "bastukartan-harvester/1.0 (sauna finder pilot; contact: hello@thehomerecovery.com)";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Tags that indicate a real sauna / bath experience (strict-ish; the merge
// step does the final inclusion decision).
const QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="SE"][admin_level=2]->.se;
(
  nwr["leisure"="sauna"](area.se);
  nwr["amenity"="public_bath"](area.se);
  nwr["amenity"="sauna"](area.se);
  nwr["leisure"="bathing_place"]["sauna"="yes"](area.se);
  nwr["bath:type"~"sauna"](area.se);
);
out center tags;
`;

const argv = process.argv.slice(2);
const outArg = (() => {
  const i = argv.indexOf("--out");
  return i !== -1 ? argv[i + 1] : null;
})();
const PRINT = argv.includes("--print");
const OUT_PATH = outArg
  ? path.resolve(process.cwd(), outArg)
  : path.resolve(ROOT, "data/raw/osm-saunas.json");

function pick(tags, ...keys) {
  for (const k of keys) {
    if (tags[k] != null && String(tags[k]).trim() !== "") return String(tags[k]).trim();
  }
  return undefined;
}

function normalizeRecord(el) {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;

  const name = pick(tags, "name", "official_name", "alt_name");
  if (!name) return null; // unnamed nodes are useless for a directory

  const street = [pick(tags, "addr:street"), pick(tags, "addr:housenumber")]
    .filter(Boolean)
    .join(" ");

  return {
    source: "osm",
    osmType: el.type,
    osmId: el.id,
    name,
    lat,
    lng,
    website: pick(tags, "website", "contact:website", "url"),
    phone: pick(tags, "phone", "contact:phone", "contact:mobile"),
    email: pick(tags, "email", "contact:email"),
    address: street || undefined,
    city: pick(tags, "addr:city", "addr:place"),
    postcode: pick(tags, "addr:postcode"),
    openingHours: pick(tags, "opening_hours"),
    // raw tags kept so the merge step can classify type / amenities
    tags,
  };
}

async function runQuery() {
  let lastErr;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "data=" + encodeURIComponent(QUERY),
      });
      if (!res.ok) {
        lastErr = new Error(`${endpoint} -> HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      return json.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("All Overpass endpoints failed");
}

async function main() {
  console.log("Querying OpenStreetMap Overpass for Swedish saunas/baths...");
  const elements = await runQuery();
  console.log(`Overpass returned ${elements.length} raw element(s).`);

  const records = [];
  const seen = new Set();
  for (const el of elements) {
    const rec = normalizeRecord(el);
    if (!rec) continue;
    const key = `${rec.osmType}/${rec.osmId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(rec);
  }

  records.sort((a, b) => a.name.localeCompare(b.name, "sv"));

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify(
      { harvestedAt: new Date().toISOString(), source: "OpenStreetMap (ODbL)", count: records.length, records },
      null,
      2
    ),
    "utf8"
  );
  console.log(`Wrote ${records.length} named candidate(s) to ${path.relative(ROOT, OUT_PATH)}`);

  if (PRINT) {
    const withWeb = records.filter((r) => r.website).length;
    const byCity = records.reduce((acc, r) => {
      const c = r.city ?? "(okänd stad)";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`\n${withWeb}/${records.length} have a website.`);
    console.log("Top cities:");
    Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([c, n]) => console.log(`  ${String(n).padStart(3)}  ${c}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
