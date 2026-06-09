#!/usr/bin/env node
/**
 * scripts/enrich-booking.mjs
 *
 * Finds the REAL, sauna-relevant booking deep-link and price for each venue -
 * not just any "boka" link on the homepage. This fixes two quality bugs:
 *   1. wrong links (e.g. Dyron's homepage "book tennis" link was being picked);
 *   2. wrong/missing prices (homepage scraping grabbed unrelated numbers).
 *
 * Relevance rule: a booking link is only accepted when it has SAUNA CONTEXT -
 * either the anchor text/href mentions bastu/sauna/kallbad, OR it was found on a
 * fetched sauna subpage. A generic /boka link with no sauna context is rejected.
 *
 * Price is only read from a sauna-context page (the venue's sauna subpage, or a
 * website URL that is itself a sauna page), preferring numbers near price words.
 *
 * Polite: robots.txt respected, on-disk cache, rate-limited, real User-Agent.
 *
 * Usage:
 *   node scripts/enrich-booking.mjs                 # reads data/raw/osm-saunas.json
 *   node scripts/enrich-booking.mjs --limit 25 --delay 1500
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, fetchText, isAllowed, sleep } from "./lib/http.mjs";

const BOOKING_PLATFORMS = [
  "bokadirekt.se", "bokadirekt.com", "cliento.com", "bokido.se", "easycashier",
  "matchi.se", "brpsystems", "sirvoy", "bokun.io", "tickster.com", "nortic.se",
  "billetto", "boka.se", "wondr.se", "yabie", "supersaas.se", "voady", "citybreak",
  "goactivebooking", "sportadmin.se",
];
const BOOK_TEXT_RE = /\b(boka(?:\s*(?:nu|tid|bastu|bord|online))?|booking|book\s*now|tidsbokning|köp\s*biljett|köp\s*entré|boka\s*biljett)\b/i;
const BOOK_PATH_RE = /\/(boka|booking|book|biljett|tickets?|tidsbokning)(\/|$|\?|-)/i;
const SAUNA_RE = /\b(bastu|sauna|kallbad|kallbadhus|badhus|vedbastu)\b/i;
const SAUNA_HREF_RE = /(bastu|sauna|kallbad|badhus)/i;
const PRICE_RE = /(\d{2,4})\s?kr\b/gi;
const PRICE_CONTEXT_RE = /(bastu|sauna|vuxen|adult|entré|entre|biljett|pris|drop[- ]?in|enkel)/i;

const argv = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : def;
};
const IN_PATH = path.resolve(process.cwd(), getArg("--in", "data/raw/osm-saunas.json"));
const OUT_PATH = path.resolve(process.cwd(), getArg("--out", "data/raw/booking-enrichment.json"));
const LIMIT = Number(getArg("--limit", "0")) || Infinity;
const DELAY = Number(getArg("--delay", "1200"));

function absUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function sameHost(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/** Pull <a href=...>text</a> pairs out of raw HTML (regex-light parse). */
function extractAnchors(html) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    out.push({ href, text });
    if (out.length > 4000) break;
  }
  return out;
}

/**
 * Score a booking anchor. `pageHasSaunaContext` is true when the anchor came
 * from a sauna subpage, which grants context even if the anchor text is plain.
 * Returns null when there is no booking signal OR no sauna relevance.
 */
function scoreBookingAnchor(a, baseUrl, pageHasSaunaContext) {
  const abs = absUrl(a.href, baseUrl);
  if (!abs) return null;
  const hrefLc = abs.toLowerCase();
  if (/facebook|instagram|linkedin|mailto:|tel:|policy|cookie|villkor|integritet/i.test(hrefLc)) return null;

  const platform = BOOKING_PLATFORMS.find((p) => hrefLc.includes(p));
  const bookText = BOOK_TEXT_RE.test(a.text);
  const bookPath = BOOK_PATH_RE.test(hrefLc);
  const hasBookingSignal = !!platform || bookText || bookPath;
  if (!hasBookingSignal) return null;

  const saunaContext = pageHasSaunaContext || SAUNA_RE.test(a.text) || SAUNA_HREF_RE.test(hrefLc);
  if (!saunaContext) return null; // the key fix: no generic links

  let score = 0;
  if (platform) score += 6;
  if (bookText) score += 4;
  if (bookPath) score += 3;
  if (SAUNA_HREF_RE.test(hrefLc)) score += 3;
  if (SAUNA_RE.test(a.text)) score += 2;
  if (pageHasSaunaContext) score += 2;
  return { url: abs, score, platform: platform ?? null, text: a.text.slice(0, 60) };
}

/** Min plausible "NN kr" price, preferring values near price/sauna words. */
function priceFromPage(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const near = [];
  const any = [];
  let m;
  while ((m = PRICE_RE.exec(text))) {
    const n = Number(m[1]);
    if (n < 30 || n > 5000) continue;
    const ctx = text.slice(Math.max(0, m.index - 80), m.index + 20);
    if (PRICE_CONTEXT_RE.test(ctx)) near.push(n);
    else any.push(n);
    if (near.length + any.length > 80) break;
  }
  if (near.length) return Math.min(...near);
  if (any.length) return Math.min(...any);
  return null;
}

/** Internal sauna subpage links from a homepage's anchors. */
function findSaunaSubpages(anchors, baseUrl) {
  const seen = new Set();
  const pages = [];
  for (const a of anchors) {
    const abs = absUrl(a.href, baseUrl);
    if (!abs || !sameHost(abs, baseUrl)) continue;
    const hrefLc = abs.toLowerCase();
    const isSauna = SAUNA_HREF_RE.test(hrefLc) || SAUNA_RE.test(a.text);
    if (!isSauna) continue;
    const norm = abs.split("#")[0];
    if (seen.has(norm)) continue;
    seen.add(norm);
    pages.push(norm);
    if (pages.length >= 2) break;
  }
  return pages;
}

async function fetchHtml(url) {
  try {
    if (!(await isAllowed(url))) return { ok: false, robots: true };
  } catch {
    /* allow on robots error */
  }
  const res = await fetchText(url, { timeoutMs: 15000, accept: "text/html" });
  return res;
}

async function enrichOne(rec) {
  const site = rec.website;
  const key = rec.osmType ? `${rec.osmType}/${rec.osmId}` : site;
  const result = { key, website: site };

  // If the OSM website is itself a sauna page, treat it as the sauna context page.
  const siteIsSaunaPage = SAUNA_HREF_RE.test(site);

  const home = await fetchHtml(site);
  if (home.robots) {
    result.status = "robots-disallow";
    return result;
  }
  if (!home.ok || !home.body) {
    result.status = "fetch-failed";
    return result;
  }

  const homeAnchors = extractAnchors(home.body);
  let best = null;
  const candidates = homeAnchors
    .map((a) => scoreBookingAnchor(a, home.url, siteIsSaunaPage))
    .filter(Boolean)
    .sort((x, y) => y.score - x.score);
  if (candidates.length) best = candidates[0];

  // If the landing page is itself a sauna page, we can read price here.
  if (siteIsSaunaPage) {
    const p = priceFromPage(home.body);
    if (p != null) {
      result.priceFromHint = p;
      result.priceEvidence = home.url;
    }
  }

  // Follow sauna subpages for a better (context-guaranteed) booking link + price.
  const subpages = siteIsSaunaPage ? [] : findSaunaSubpages(homeAnchors, home.url);
  for (const sub of subpages) {
    const sp = await fetchHtml(sub);
    if (sp.robots) continue;
    if (!sp.ok || !sp.body) continue;
    if (!sp.cached) await sleep(DELAY);

    const subAnchors = extractAnchors(sp.body);
    const subBest = subAnchors
      .map((a) => scoreBookingAnchor(a, sp.url, true))
      .filter(Boolean)
      .sort((x, y) => y.score - x.score)[0];
    if (subBest && (!best || subBest.score >= best.score)) best = subBest;

    if (result.priceFromHint == null) {
      const p = priceFromPage(sp.body);
      if (p != null) {
        result.priceFromHint = p;
        result.priceEvidence = sp.url;
      }
    }
  }

  if (best) {
    result.bookingUrl = best.url;
    result.bookingMethod = "online";
    result.bookingPlatform = best.platform;
    result.bookingEvidence = best.text;
    result.status = "found";
  } else {
    result.status = "no-sauna-booking-link";
  }
  return result;
}

async function main() {
  const file = JSON.parse(await readFile(IN_PATH, "utf8"));
  const records = (file.records ?? file).filter((r) => r.website);
  console.log(`${records.length} candidate(s) with a website in ${path.basename(IN_PATH)}.`);

  const out = [];
  let processed = 0;
  for (const rec of records) {
    if (processed >= LIMIT) break;
    processed++;
    const r = await enrichOne(rec);
    out.push(r);
    const tag = (r.status ?? "?").padEnd(22);
    const extra = [r.bookingUrl ? "-> " + r.bookingUrl : "", r.priceFromHint != null ? `(${r.priceFromHint} kr)` : ""]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${tag} ${rec.name}${extra ? "  " + extra : ""}`);
    if (!r.cached) await sleep(DELAY);
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ enrichedAt: new Date().toISOString(), count: out.length, results: out }, null, 2),
    "utf8"
  );

  const found = out.filter((r) => r.bookingUrl).length;
  const priced = out.filter((r) => r.priceFromHint != null).length;
  console.log(`\nSauna booking links: ${found}/${out.length}. Prices: ${priced}/${out.length}.`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
