#!/usr/bin/env node
/**
 * scripts/harvest-photos.mjs
 *
 * Pulls ONE representative photo per venue from the venue's OWN site
 * (og:image / twitter:image) and QUALITY-CHECKS it before keeping it:
 *   - reject logo/icon/sprite/placeholder URLs;
 *   - require an image content-type and a sensible byte size (HEAD request);
 *   - prefer landscape (reject square-ish images, which are usually logos)
 *     when og:image:width/height are advertised.
 *
 * The Wikimedia Commons geosearch fallback was REMOVED: it returned random
 * geotagged objects near the coordinates ("completely wrong" photos).
 *
 * We never re-host: `photo` is a remote URL the page links to. Output goes to
 * data/raw/photos.json which merge-saunas.mjs ingests into `photo`/`photoCredit`.
 *
 * Usage:
 *   node scripts/harvest-photos.mjs                 # all venues with a website
 *   node scripts/harvest-photos.mjs --limit 40 --delay 1500
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, fetchText, isAllowed, sleep, USER_AGENT } from "./lib/http.mjs";

const RAW_DIR = path.resolve(ROOT, "data/raw");
const OSM_PATH = path.resolve(RAW_DIR, "osm-saunas.json");
const SAUNAS_PATH = path.resolve(ROOT, "src/data/saunas.json");
const OUT_PATH = path.resolve(RAW_DIR, "photos.json");

const argv = process.argv.slice(2);
const num = (flag, def) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? Number(argv[i + 1]) : def;
};
const LIMIT = num("--limit", Infinity);
const DELAY = num("--delay", 1500);

const BAD_URL_RE = /(logo|logotyp|icon|favicon|sprite|placeholder|default|avatar|share|og-image-default|banner-?ad)/i;
const MIN_BYTES = 15000;

function deaccent(s) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normName(s) {
  return deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function absolutize(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

/** Extract og:image candidates plus any advertised width/height. */
function extractOgImage(html, baseUrl) {
  const metas = html.match(/<meta[^>]+>/gi) ?? [];
  const get = (key) => {
    for (const tag of metas) {
      const prop = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (prop !== key) continue;
      return tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    }
    return null;
  };
  const w = Number(get("og:image:width")) || null;
  const h = Number(get("og:image:height")) || null;
  for (const key of ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"]) {
    const content = get(key);
    if (content) {
      const abs = absolutize(content.trim(), baseUrl);
      if (abs && /^https?:\/\//i.test(abs)) return { url: abs, w, h };
    }
  }
  return null;
}

/** HEAD the image: must be an image content-type and big enough to be a photo. */
async function validateImage(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/") || /svg/.test(ct)) return false;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len < MIN_BYTES) return false;
    return true;
  } catch {
    // Some servers reject HEAD; accept the URL on a network error rather than HEAD-405.
    return true;
  }
}

async function fromWebsite(website) {
  if (!website) return null;
  try {
    if (!(await isAllowed(website))) return null;
  } catch {
    /* allow on robots error */
  }
  const res = await fetchText(website, { timeoutMs: 12000 });
  if (!res.ok || !res.body) return null;
  const cand = extractOgImage(res.body, res.url || website);
  if (!cand) return null;

  // quality checks
  if (BAD_URL_RE.test(cand.url)) return null;
  if (cand.w && cand.h) {
    const ratio = cand.w / cand.h;
    if (ratio < 1.1) return null; // square-ish -> almost always a logo
  }
  if (!(await validateImage(cand.url))) return null;

  let host = website;
  try {
    host = new URL(res.url || website).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  return { photo: cand.url, photoCredit: `Photo: ${host}`, photoSource: res.url || website };
}

async function loadVenues() {
  const venues = [];
  const seen = new Set();
  const add = (v) => {
    const id = v.key || normName(v.name);
    if (seen.has(id)) return;
    seen.add(id);
    venues.push(v);
  };
  try {
    const osm = JSON.parse(await readFile(OSM_PATH, "utf8"));
    for (const r of osm.records ?? []) {
      add({ key: `${r.osmType}/${r.osmId}`, name: r.name, website: r.website });
    }
  } catch {
    /* ignore */
  }
  try {
    const cur = JSON.parse(await readFile(SAUNAS_PATH, "utf8"));
    for (const s of cur) add({ key: s.slug, name: s.name, website: s.website });
  } catch {
    /* ignore */
  }
  return venues;
}

async function main() {
  const venues = await loadVenues();
  const queue = venues.filter((v) => v.website).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`${queue.length} venue(s) with a website to photograph (of ${venues.length}).`);

  const results = [];
  let found = 0;
  for (const v of queue) {
    const hit = await fromWebsite(v.website);
    if (hit) {
      found++;
      results.push({ key: v.key, name: v.name, website: v.website, ...hit });
      console.log(`  ok     ${v.name}`);
    } else {
      console.log(`  skip   ${v.name}`);
    }
    await sleep(DELAY);
  }

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ harvestedAt: new Date().toISOString(), count: results.length, results }, null, 2),
    "utf8"
  );
  console.log(`\nKept ${found}/${queue.length} validated photo(s). Wrote ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
