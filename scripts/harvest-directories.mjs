#!/usr/bin/env node
/**
 * scripts/harvest-directories.mjs
 *
 * Discovery harvest from EXISTING Swedish sauna/bath directory sites. Many
 * such directories already aggregate venues - this pulls factual business data
 * (name, address, coordinates, phone, website) from them to seed our own list,
 * which the merge step then dedupes against OSM/DataForSEO and we verify.
 *
 * LEGAL / ETHICAL STANCE:
 *   - We extract FACTS (name, address, geo, phone, url). Facts are not
 *     copyrightable; the curated presentation is theirs, so we never copy
 *     descriptions/photos/reviews - only the factual fields - and we record
 *     the source URL for provenance.
 *   - We prefer each page's own schema.org JSON-LD (data they publish for
 *     machines) over scraping rendered DOM.
 *   - We respect robots.txt, rate-limit, cache, and send a descriptive UA.
 *   - Treat output as DISCOVERY leads to verify, not ground truth.
 *
 * Sources live in scripts/sources.directories.json (each must be manually
 * enabled after you verify its robots.txt + URL pattern).
 *
 * Strategies:
 *   sitemap  - read a sitemap.xml, keep URLs matching urlPattern, fetch each,
 *              extract JSON-LD business nodes.
 *   listing  - fetch listingUrls, extract venue links matching linkPattern,
 *              fetch each, extract JSON-LD business nodes.
 *
 * Usage:
 *   node scripts/harvest-directories.mjs --list           # show configured sources
 *   node scripts/harvest-directories.mjs --source badkartan --max 50
 *   node scripts/harvest-directories.mjs                  # run all enabled sources
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, fetchText, isAllowed, sleep } from "./lib/http.mjs";

const CONFIG_PATH = path.resolve(ROOT, "scripts/sources.directories.json");
const OUT_PATH = path.resolve(ROOT, "data/raw/directory-saunas.json");

const BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "HealthAndBeautyBusiness",
  "DaySpa",
  "SportsActivityLocation",
  "HealthClub",
  "Place",
  "TouristAttraction",
  "Resort",
  "Hotel",
]);

const argv = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : def;
};
const LIST = argv.includes("--list");
const SOURCE = getArg("--source");
const MAX = Number(getArg("--max", "0")) || Infinity;
const DELAY = Number(getArg("--delay", "1200"));

function flatten(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, out));
    return out;
  }
  out.push(node);
  if (node["@graph"]) flatten(node["@graph"], out);
  return out;
}

function typeMatches(t) {
  if (!t) return false;
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x) => BUSINESS_TYPES.has(x));
}

/** Extract business records from a page's JSON-LD. */
function extractJsonLd(html, pageUrl) {
  const records = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of flatten(data)) {
      if (!typeMatches(node["@type"])) continue;
      const geo = node.geo ?? {};
      const addr = node.address ?? {};
      const lat = Number(geo.latitude);
      const lng = Number(geo.longitude);
      const name = typeof node.name === "string" ? node.name.trim() : null;
      if (!name) continue;
      records.push({
        name,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        website: typeof node.url === "string" ? node.url : undefined,
        phone: typeof node.telephone === "string" ? node.telephone : undefined,
        address:
          typeof addr.streetAddress === "string" ? addr.streetAddress : undefined,
        city: typeof addr.addressLocality === "string" ? addr.addressLocality : undefined,
        postcode: typeof addr.postalCode === "string" ? addr.postalCode : undefined,
        sourceUrl: pageUrl,
      });
    }
  }
  return records;
}

function matchLinks(html, baseUrl, pattern) {
  const re = new RegExp(pattern, "i");
  const out = new Set();
  const aRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = aRe.exec(html))) {
    let abs;
    try {
      abs = new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
    if (re.test(abs)) out.add(abs.split("#")[0]);
  }
  return [...out];
}

function extractSitemapUrls(xml, pattern) {
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  const filter = pattern ? new RegExp(pattern, "i") : null;
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    const url = m[1];
    if (!filter || filter.test(url)) out.push(url);
  }
  return out;
}

async function collectVenueUrls(source) {
  if (source.strategy === "sitemap") {
    const res = await fetchText(source.sitemap, { accept: "application/xml" });
    if (!res.ok) {
      console.warn(`  ! could not fetch sitemap ${source.sitemap} (HTTP ${res.status})`);
      return [];
    }
    return extractSitemapUrls(res.body, source.urlPattern);
  }
  if (source.strategy === "listing") {
    const urls = new Set();
    for (const listUrl of source.listingUrls ?? []) {
      if (!(await isAllowed(listUrl))) continue;
      const res = await fetchText(listUrl, { accept: "text/html" });
      if (!res.ok) continue;
      matchLinks(res.body, res.url, source.linkPattern).forEach((u) => urls.add(u));
      await sleep(DELAY);
    }
    return [...urls];
  }
  console.warn(`  ! unknown strategy "${source.strategy}" for ${source.id}`);
  return [];
}

async function harvestSource(source) {
  console.log(`\nSource: ${source.name} (${source.id}) [${source.strategy}]`);
  let urls = await collectVenueUrls(source);
  if (source.keywordFilter) {
    const kw = new RegExp(source.keywordFilter, "i");
    urls = urls.filter((u) => kw.test(u));
  }
  console.log(`  ${urls.length} candidate page(s).`);
  if (urls.length > MAX) urls = urls.slice(0, MAX);

  const records = [];
  for (const url of urls) {
    if (!(await isAllowed(url))) continue;
    const res = await fetchText(url, { accept: "text/html" });
    if (!res.ok) continue;
    const found = extractJsonLd(res.body, res.url).map((r) => ({
      source: `directory:${source.id}`,
      ...r,
    }));
    records.push(...found);
    if (!res.cached) await sleep(DELAY);
  }
  console.log(`  extracted ${records.length} business record(s) from JSON-LD.`);
  return records;
}

async function main() {
  let config;
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    console.error(`Missing or invalid ${path.relative(ROOT, CONFIG_PATH)}`);
    process.exit(1);
  }
  const sources = config.sources ?? [];

  if (LIST) {
    console.log("Configured directory sources:");
    sources.forEach((s) =>
      console.log(`  ${s.enabled ? "[on] " : "[off]"} ${s.id.padEnd(18)} ${s.name} (${s.strategy})`)
    );
    return;
  }

  let active = sources.filter((s) => (SOURCE ? s.id === SOURCE : s.enabled));
  if (active.length === 0) {
    console.log(
      "No active sources. Enable one in scripts/sources.directories.json (set \"enabled\": true after verifying robots.txt + URL pattern), or pass --source <id>."
    );
    console.log("Run with --list to see configured sources.");
    return;
  }

  const all = [];
  for (const source of active) {
    try {
      all.push(...(await harvestSource(source)));
    } catch (err) {
      console.warn(`  ! ${source.id} failed: ${err}`);
    }
  }

  // de-dupe within this harvest by name+website
  const seen = new Set();
  const records = [];
  for (const r of all) {
    const key = `${(r.name || "").toLowerCase()}|${(r.website || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(r);
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ harvestedAt: new Date().toISOString(), count: records.length, records }, null, 2),
    "utf8"
  );
  console.log(`\nWrote ${records.length} unique record(s) to ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
