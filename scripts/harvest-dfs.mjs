#!/usr/bin/env node
/**
 * scripts/harvest-dfs.mjs
 *
 * OPTIONAL paid harvest via DataForSEO's Google Maps SERP API. This is the
 * compliant way to pull Google Business/Maps data (name, full address, geo,
 * phone, website, rating, reviews count, opening hours, place_id/cid) at scale
 * and STORE it - unlike the Google Places API, DataForSEO lets you keep the
 * returned data, which is what a directory needs.
 *
 * SPEND SAFETY (mirrors the ~/.seo-pipeline conventions):
 *   --dry-run   print the estimated cost and exit; ZERO API calls (default).
 *   --confirm   REQUIRED to make real (billable) calls.
 *   --cap N     hard USD cap; aborts before exceeding it (default 10).
 *   Responses are cached on disk, so re-runs are free.
 *
 * Credentials come from env / .env / ~/.seo-pipeline/.env (see lib/env.mjs).
 *
 * Usage:
 *   node scripts/harvest-dfs.mjs --dry-run
 *   node scripts/harvest-dfs.mjs --confirm --cap 5
 *   node scripts/harvest-dfs.mjs --confirm --keywords "bastu,kallbadhus"
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ROOT, sleep } from "./lib/http.mjs";
import { loadDfsCredentials } from "./lib/env.mjs";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
const OUT_PATH = path.resolve(ROOT, "data/raw/dfs-saunas.json");
const CACHE_DIR = path.resolve(ROOT, "data/raw/.cache/dfs");

// Per-call price estimate for Maps Live Advanced. Override with --price.
// (DataForSEO bills per call; this is a conservative planning figure.)
const DEFAULT_UNIT_COST = 0.02;

// Swedish coverage: keyword x city. Coordinates are "lat,lng,radius(m)".
const DEFAULT_KEYWORDS = ["bastu", "kallbadhus", "badhus", "bastuflotte", "vedeldad bastu"];
const CITIES = [
  { name: "Stockholm", coord: "59.3293,18.0686,40000" },
  { name: "Göteborg", coord: "57.7089,11.9746,40000" },
  { name: "Malmö", coord: "55.6050,13.0038,30000" },
  { name: "Uppsala", coord: "59.8586,17.6389,25000" },
  { name: "Linköping", coord: "58.4109,15.6216,25000" },
  { name: "Örebro", coord: "59.2741,15.2066,25000" },
  { name: "Västerås", coord: "59.6099,16.5448,25000" },
  { name: "Helsingborg", coord: "56.0465,12.6945,25000" },
  { name: "Norrköping", coord: "58.5877,16.1924,25000" },
  { name: "Jönköping", coord: "57.7826,14.1618,25000" },
  { name: "Umeå", coord: "63.8258,20.2630,30000" },
  { name: "Luleå", coord: "65.5848,22.1547,40000" },
  { name: "Sundsvall", coord: "62.3908,17.3069,30000" },
  { name: "Östersund", coord: "63.1792,14.6357,30000" },
  { name: "Visby", coord: "57.6348,18.2948,30000" },
  { name: "Åre", coord: "63.3990,13.0810,40000" },
];

const argv = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : def;
};
const CONFIRM = argv.includes("--confirm");
const DRY = !CONFIRM || argv.includes("--dry-run");
const CAP = Number(getArg("--cap", "10"));
const UNIT_COST = Number(getArg("--price", String(DEFAULT_UNIT_COST)));
const KEYWORDS = (getArg("--keywords") || DEFAULT_KEYWORDS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

function tasks() {
  const out = [];
  for (const kw of KEYWORDS) {
    for (const city of CITIES) {
      out.push({ keyword: kw, city: city.name, location_coordinate: city.coord });
    }
  }
  return out;
}

function cacheFile(task) {
  const key = createHash("sha1").update(JSON.stringify(task)).digest("hex").slice(0, 20);
  return path.join(CACHE_DIR, key + ".json");
}

async function readTaskCache(task) {
  try {
    return JSON.parse(await readFile(cacheFile(task), "utf8"));
  } catch {
    return null;
  }
}

function normalizeItem(item, task) {
  if (!item || !item.title) return null;
  const ai = item.address_info ?? {};
  return {
    source: "dataforseo",
    cid: item.cid ? String(item.cid) : undefined,
    placeId: item.place_id,
    name: item.title,
    lat: item.latitude,
    lng: item.longitude,
    website: item.url || undefined,
    phone: item.phone || undefined,
    address: ai.address || item.address || undefined,
    city: ai.city || undefined,
    region: ai.region || undefined,
    postcode: ai.zip || undefined,
    category: item.category || undefined,
    categories: item.additional_categories || undefined,
    rating: item.rating?.value,
    reviewsCount: item.rating?.votes_count,
    priceLevel: item.price_level || undefined,
    openingHours: item.work_time?.work_hours || undefined,
    queryKeyword: task.keyword,
    queryCity: task.city,
  };
}

async function callApi(task, auth) {
  const body = JSON.stringify([
    {
      keyword: task.keyword,
      language_code: "sv",
      location_coordinate: task.location_coordinate,
      depth: 100,
    },
  ]);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`);
  const json = await res.json();
  const result = json?.tasks?.[0]?.result?.[0];
  const items = result?.items ?? [];
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile(task), JSON.stringify({ fetchedAt: new Date().toISOString(), items }), "utf8");
  return items;
}

async function main() {
  const allTasks = tasks();

  // Account for cache: cached tasks cost nothing.
  const cachedFlags = await Promise.all(allTasks.map((t) => readTaskCache(t)));
  const uncached = allTasks.filter((_, i) => !cachedFlags[i]);
  const estCost = uncached.length * UNIT_COST;

  console.log(`DataForSEO Google Maps harvest`);
  console.log(`  keywords : ${KEYWORDS.join(", ")}`);
  console.log(`  cities   : ${CITIES.length}`);
  console.log(`  tasks    : ${allTasks.length} (${uncached.length} uncached, ${allTasks.length - uncached.length} cached)`);
  console.log(`  est. cost: $${estCost.toFixed(2)} at $${UNIT_COST}/call (cap $${CAP})`);

  if (DRY) {
    console.log(`\nDRY RUN - no API calls made. Re-run with --confirm to harvest.`);
    if (estCost > CAP) console.log(`NOTE: estimate exceeds cap; raise --cap or reduce scope.`);
    return;
  }
  if (estCost > CAP) {
    console.error(`\nAborting: estimated $${estCost.toFixed(2)} exceeds cap $${CAP}. Raise --cap or narrow scope.`);
    process.exit(1);
  }

  const { login, password } = await loadDfsCredentials();
  if (!login || !password) {
    console.error("Missing DataForSEO credentials (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD in .env or ~/.seo-pipeline/.env).");
    process.exit(1);
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const records = [];
  let spent = 0;
  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i];
    let items = cachedFlags[i]?.items;
    if (!items) {
      if (spent + UNIT_COST > CAP) {
        console.warn(`Reached cap; stopping. Processed ${i}/${allTasks.length} tasks.`);
        break;
      }
      try {
        items = await callApi(task, auth);
        spent += UNIT_COST;
      } catch (err) {
        console.warn(`  ! ${task.keyword} @ ${task.city} failed: ${err}`);
        items = [];
      }
      await sleep(400);
    }
    for (const it of items) {
      const rec = normalizeItem(it, task);
      if (rec) records.push(rec);
    }
    console.log(`  ${task.keyword} @ ${task.city}: ${items.length} item(s)`);
  }

  // de-dupe by cid/place_id within DFS output
  const seen = new Set();
  const deduped = [];
  for (const r of records) {
    const key = r.cid || r.placeId || `${r.name}|${r.lat},${r.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ harvestedAt: new Date().toISOString(), spentEstimate: spent, count: deduped.length, records: deduped }, null, 2),
    "utf8"
  );
  console.log(`\nWrote ${deduped.length} unique record(s) to ${path.relative(ROOT, OUT_PATH)} (est. spend $${spent.toFixed(2)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
