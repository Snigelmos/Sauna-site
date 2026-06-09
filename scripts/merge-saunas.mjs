#!/usr/bin/env node
/**
 * scripts/merge-saunas.mjs
 *
 * The brain of the pipeline. Reads every raw harvest in data/raw/*.json plus
 * the booking enrichment, then:
 *   1. preserves the human-curated entries already in src/data/saunas.json
 *      (anything whose source starts with "Pilotdata" is locked - never
 *      overwritten or dropped);
 *   2. dedupes harvested candidates across sources (Google cid/place_id first,
 *      else normalized-name + geo within ~150 m);
 *   3. strictly classifies type and DROPS non-sauna venues (generic gyms /
 *      hotels without a bath signal) - ambiguous ones go to a needs-review
 *      file instead of being published;
 *   4. normalizes survivors to the Sauna shape (slug, region, amenities,
 *      booking, provenance), geocoding address-only rows via Nominatim;
 *   5. prints a report and only writes src/data/saunas.json with --write.
 *
 * Usage:
 *   node scripts/merge-saunas.mjs            # report only (no file changes)
 *   node scripts/merge-saunas.mjs --write    # write src/data/saunas.json
 *   node scripts/merge-saunas.mjs --geocode  # allow Nominatim lookups (slow, polite)
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, fetchText, sleep } from "./lib/http.mjs";
import { parseOsmHours, parseDfsHours } from "./lib/hours.mjs";

const RAW_DIR = path.resolve(ROOT, "data/raw");
const SAUNAS_PATH = path.resolve(ROOT, "src/data/saunas.json");
const REVIEW_PATH = path.resolve(RAW_DIR, "needs-review.json");
const STALE_PATH = path.resolve(RAW_DIR, "stale.json");
const CANDIDATES_PATH = path.resolve(RAW_DIR, "candidates.json");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const GEOCODE = argv.includes("--geocode");
const TODAY = new Date().toISOString().slice(0, 10);

const REGION_BY_CITY = {
  Stockholm: "Stockholms län",
  Nacka: "Stockholms län",
  Uppsala: "Uppsala län",
  Göteborg: "Västra Götalands län",
  Malmö: "Skåne län",
  Helsingborg: "Skåne län",
  Lund: "Skåne län",
  Linköping: "Östergötlands län",
  Norrköping: "Östergötlands län",
  Örebro: "Örebro län",
  Västerås: "Västmanlands län",
  Jönköping: "Jönköpings län",
  Umeå: "Västerbottens län",
  Luleå: "Norrbottens län",
  Sundsvall: "Västernorrlands län",
  Östersund: "Jämtlands län",
  Visby: "Gotlands län",
  Åre: "Jämtlands län",
};

// ---- text + geo helpers ----------------------------------------------------
function deaccent(s) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normName(s) {
  return deaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function slugify(s) {
  return deaccent(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function haversine(a, b) {
  if (a.lat == null || b.lat == null) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---- classification --------------------------------------------------------
// NB: do NOT list "24/7" here - it appears in opening_hours and was falsely
// flagging legit always-open saunas. Gym chains are still caught by the words.
const EXCLUDE_RE = /\b(gym|fitness|crossfit|sats|nordic wellness|hotell|hotel|hostel|vandrarhem|camping)\b/i;
const SAUNA_SIGNAL_RE = /\b(bastu|sauna|kallbad|kallbadhus|badhus|bad|spa|simhall|äventyrsbad|warmbadhus)\b/i;

function classify(rec) {
  const hay = `${rec.name} ${rec.category ?? ""} ${(rec.categories ?? []).join(" ")} ${Object.values(rec.tags ?? {}).join(" ")}`;
  const n = rec.name.toLowerCase();
  const tags = rec.tags ?? {};

  let type = null;
  if (/kallbad|kallbadhus|cold bath/i.test(hay)) type = "kallbadhus";
  else if (/flotte|flytande|raft|floating/i.test(hay)) type = "flytande";
  else if (/uthyrning|hyr |rental|hyrbastu/i.test(hay)) type = "uthyrning";
  else if (/hotell|hotel|resort/i.test(hay)) type = "hotell";
  else if (/spa|badhus|warmbadhus|simhall|äventyrsbad|day spa/i.test(hay)) type = "spa";
  else if (tags.leisure === "sauna" || tags.amenity === "sauna" || /\bbastu\b|\bsauna\b/i.test(n)) type = "allman";
  else if (tags.amenity === "public_bath") type = "spa";

  const hasSaunaSignal = SAUNA_SIGNAL_RE.test(hay) || tags.leisure === "sauna" || tags.amenity === "sauna" || tags.amenity === "public_bath" || tags.sauna === "yes";
  const looksExcluded = EXCLUDE_RE.test(hay);

  if (!hasSaunaSignal) return { decision: "drop", reason: "no sauna/bath signal" };
  if (looksExcluded && type !== "kallbadhus" && type !== "spa" && type !== "allman") {
    // e.g. a gym/hotel that merely mentions sauna - needs a human look
    return { decision: "review", reason: "gym/hotel - verify it is a real sauna experience", type: type ?? "spa" };
  }
  if (!type) return { decision: "review", reason: "unclassified", type: "allman" };
  return { decision: "keep", type };
}

const TYPE_TAGLINE = {
  allman: "Public sauna",
  kallbadhus: "Cold bath house with sauna",
  spa: "Spa and bath with sauna",
  uthyrning: "Sauna for private rental",
  flytande: "Floating sauna",
  hotell: "Hotel sauna",
};

function deriveAmenities(rec) {
  const tags = rec.tags ?? {};
  const hay = `${rec.name} ${rec.category ?? ""} ${Object.values(tags).join(" ")}`.toLowerCase();
  const a = {};
  const yes = (v) => v === "yes" || v === "designated" || v === "limited";
  // water / bathing
  if (/havsbad|strand|\bhav\b|\bsea\b|kust/.test(hay)) a.seaAccess = true;
  if (/sjö|insjö|lake/.test(hay)) a.lakeAccess = true;
  if (
    tags.leisure === "bathing_place" ||
    tags.leisure === "swimming_area" ||
    tags.natural === "beach" ||
    /badplats|simhall|äventyrsbad|swimming/.test(hay)
  )
    a.bathing = true;
  if (a.seaAccess || a.lakeAccess) a.bathing = true;
  if (/kallbad|isvak|cold plunge|vinterbad/.test(hay)) a.coldPlunge = true;
  if (/vedeldad|vedbastu|wood[- ]?fired/.test(hay)) a.woodFired = true;
  // facilities from explicit OSM tags (only when stated)
  if (yes(tags.toilets) || tags.amenity === "toilets") a.toilets = true;
  if (yes(tags.shower)) a.showers = true;
  if (yes(tags.wheelchair)) a.wheelchair = true;
  if (yes(tags.parking) || /parkering|\bparking\b/.test(hay)) a.parking = true;
  if (/café|cafe|restaurang|kiosk|restaurant/.test(hay)) a.cafe = true;
  // fee
  if (tags.fee === "no" || /gratis|kostnadsfri|\bfree\b/.test(hay)) a.freeEntry = true;
  return a;
}

// ---- hours / ratings / confidence -----------------------------------------
function buildHours(rec) {
  const oh = rec.openingHours;
  let parsed = null;
  if (typeof oh === "string" && oh) parsed = parseOsmHours(oh);
  else if (oh && typeof oh === "object") parsed = parseDfsHours(oh);
  // also try the raw OSM tag directly
  if (!parsed && rec.tags?.opening_hours) parsed = parseOsmHours(rec.tags.opening_hours);
  return parsed; // { spec, human } | null
}

function googleReviewsUrl(rec) {
  if (rec.cid) return `https://www.google.com/maps?cid=${rec.cid}`;
  const q = encodeURIComponent(`${rec.name} ${rec.city ?? "Sweden"}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** A website URL that is itself a sauna/booking deep-link (not a bare homepage). */
function isDeepBookingUrl(url) {
  if (!url) return false;
  let p;
  try {
    p = new URL(url);
  } catch {
    return false;
  }
  if (p.pathname === "/" || p.pathname === "") return false;
  return /(bastu|sauna|boka|booking|book|biljett|tidsbokning)/i.test(p.pathname + p.search);
}

/** Why an entry failed the publish gate (for the candidates review file). */
function gateGap(entry) {
  const gaps = [];
  if (!entry.website) gaps.push("no website");
  if (!entry.bookingUrl && entry.priceFrom == null && !(entry.hours && entry.hours.length) && entry.googleRating == null)
    gaps.push("no booking/price/hours/rating signal");
  if (entry.city === "Unknown location") gaps.push("unknown city");
  return gaps;
}

/** Rough 0-1 data-confidence score from breadth of sources + completeness. */
function confidence(rec, { hours, bookingUrl, rating } = {}) {
  let c = 0.3;
  if ((rec.sources?.length ?? 1) > 1) c += 0.15;
  if (rec.website) c += 0.1;
  if (rec.phone) c += 0.1;
  if (bookingUrl) c += 0.1;
  if (rating != null) c += 0.1;
  if (hours) c += 0.1;
  if (rec.city) c += 0.05;
  return Math.min(1, Math.round(c * 100) / 100);
}

// ---- geocoding (Nominatim, polite: <= 1 req/s) -----------------------------
async function geocode(rec) {
  const q = [rec.address, rec.postcode, rec.city, "Sverige"].filter(Boolean).join(", ");
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=se&q=${encodeURIComponent(q)}`;
  const res = await fetchText(url, { accept: "application/json" });
  if (!res.cached) await sleep(1100);
  if (!res.ok) return null;
  try {
    const arr = JSON.parse(res.body);
    if (arr[0]) return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
  } catch {
    /* ignore */
  }
  return null;
}

/** Tidy a place label: drop "X kommun" / "X distrikt" administrative suffixes. */
function cleanCity(name) {
  if (!name) return name;
  return name
    .replace(/\s+(kommun|distrikt|socken|församling)\s*$/i, "")
    .replace(/\s+Municipality\s*$/i, "")
    .trim();
}

/** Reverse-geocode a city/region from coordinates when OSM had no addr:city. */
async function reverseCity(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetchText(url, { accept: "application/json" });
  if (!res.cached) await sleep(1100);
  if (!res.ok) return null;
  try {
    const a = JSON.parse(res.body).address ?? {};
    // Prefer real settlement names; municipality/county only as a last resort.
    const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality;
    const region = a.county || a.state;
    return { city: cleanCity(city), region };
  } catch {
    return null;
  }
}

// ---- load raw + curated ----------------------------------------------------
async function loadRaw() {
  // Machine-output files we must NOT re-ingest as venue candidates.
  const OUTPUT_FILES = new Set(["needs-review.json", "candidates.json", "stale.json"]);
  let files = [];
  try {
    files = (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json") && !OUTPUT_FILES.has(f));
  } catch {
    return { candidates: [], enrichment: new Map(), photos: new Map() };
  }
  const candidates = [];
  const enrichment = new Map();
  const photos = new Map();
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(await readFile(path.join(RAW_DIR, f), "utf8"));
    } catch {
      continue;
    }
    if (f === "booking-enrichment.json") {
      for (const r of data.results ?? []) {
        if (r.bookingUrl) enrichment.set(r.key, r);
        if (r.website) enrichment.set((r.website || "").toLowerCase(), r);
      }
      continue;
    }
    if (f === "photos.json") {
      for (const r of data.results ?? []) {
        if (!r.photo) continue;
        if (r.key) photos.set(r.key, r);
        if (r.website) photos.set((r.website || "").toLowerCase(), r);
        if (r.name) photos.set(normName(r.name), r);
      }
      continue;
    }
    for (const rec of data.records ?? []) candidates.push(rec);
  }
  return { candidates, enrichment, photos };
}

async function loadCurated() {
  try {
    const arr = JSON.parse(await readFile(SAUNAS_PATH, "utf8"));
    return arr;
  } catch {
    return [];
  }
}

// ---- dedupe ----------------------------------------------------------------
function dedupe(candidates) {
  const groups = [];
  const byCid = new Map();
  for (const rec of candidates) {
    const cid = rec.cid || rec.placeId;
    if (cid && byCid.has(cid)) {
      byCid.get(cid).push(rec);
      continue;
    }
    // geo+name match against existing groups
    let placed = false;
    for (const g of groups) {
      const head = g[0];
      if (
        normName(head.name) === normName(rec.name) &&
        haversine(head, rec) < 200
      ) {
        g.push(rec);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const g = [rec];
      groups.push(g);
      if (cid) byCid.set(cid, g);
    }
  }
  return groups;
}

function mergeGroup(group) {
  // prefer DataForSEO for contact/geo/rating; OSM for tags; directory for url
  const pick = (field) => {
    const dfs = group.find((g) => g.source === "dataforseo" && g[field] != null);
    if (dfs) return dfs[field];
    const any = group.find((g) => g[field] != null);
    return any ? any[field] : undefined;
  };
  const tags = Object.assign({}, ...group.map((g) => g.tags ?? {}));
  return {
    name: pick("name"),
    lat: pick("lat"),
    lng: pick("lng"),
    website: pick("website"),
    phone: pick("phone"),
    email: pick("email"),
    address: pick("address"),
    city: pick("city"),
    region: pick("region"),
    postcode: pick("postcode"),
    category: pick("category"),
    categories: pick("categories"),
    rating: pick("rating"),
    reviewsCount: pick("reviewsCount"),
    openingHours: pick("openingHours"),
    osmType: pick("osmType"),
    osmId: pick("osmId"),
    cid: pick("cid"),
    sourceUrl: pick("sourceUrl"),
    sources: [...new Set(group.map((g) => g.source))],
    tags,
  };
}

// ---- main ------------------------------------------------------------------
async function main() {
  const curated = await loadCurated();
  // Protect human-curated entries (Pilotdata + anything not machine-harvested).
  // Previously-harvested rows (source starts with "Harvest:") are NOT protected:
  // they are regenerated from raw each run, which keeps re-runs idempotent.
  const protectedEntries = curated.filter((s) => !(s.source ?? "").startsWith("Harvest:"));
  const lockedSlugs = new Set(protectedEntries.map((s) => s.slug));
  console.log(`Protected (curated) entries: ${protectedEntries.length}`);

  const { candidates, enrichment, photos } = await loadRaw();
  console.log(`Raw harvested candidates: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log("No raw candidates found in data/raw/. Run a harvester first (harvest-osm.mjs).");
  }

  const groups = dedupe(candidates);
  console.log(`After dedupe: ${groups.length} unique candidate venue(s)`);

  const published = [];
  const candidatesOut = [];
  const review = [];
  let dropped = 0;
  const usedSlugs = new Set(lockedSlugs);

  for (const group of groups) {
    const rec = mergeGroup(group);
    const cls = classify(rec);
    if (cls.decision === "drop") {
      dropped++;
      continue;
    }

    // geocode if missing coordinates
    if ((rec.lat == null || rec.lng == null) && GEOCODE) {
      const g = await geocode(rec);
      if (g) {
        rec.lat = g.lat;
        rec.lng = g.lng;
      }
    }
    if (rec.lat == null || rec.lng == null) {
      review.push({ ...rec, _reason: "missing coordinates" });
      continue;
    }

    // backfill city/region from coordinates when missing
    if (!rec.city && GEOCODE) {
      const rev = await reverseCity(rec.lat, rec.lng);
      if (rev?.city) rec.city = rev.city;
      if (!rec.region && rev?.region) rec.region = rev.region;
    }

    // skip if it duplicates a protected curated entry (same name within 250m)
    const dupCurated = protectedEntries.find(
      (c) => normName(c.name) === normName(rec.name) && haversine(c, rec) < 250
    );
    if (dupCurated) continue;

    if (cls.decision === "review") {
      review.push({ ...rec, _reason: cls.reason, _suggestedType: cls.type });
      continue;
    }

    // build slug (unique)
    let slug = slugify(rec.name);
    if (rec.city && (usedSlugs.has(slug) || !slug)) slug = slugify(`${rec.name}-${rec.city}`);
    let s = slug;
    let i = 2;
    while (usedSlugs.has(s)) s = `${slug}-${i++}`;
    slug = s;
    usedSlugs.add(slug);

    const enr =
      enrichment.get(rec.osmType ? `${rec.osmType}/${rec.osmId}` : "") ||
      enrichment.get((rec.website || "").toLowerCase());
    const pho =
      photos.get(rec.osmType ? `${rec.osmType}/${rec.osmId}` : "") ||
      photos.get((rec.website || "").toLowerCase()) ||
      photos.get(normName(rec.name));

    const city = cleanCity(rec.city) || "Unknown location";
    const region = rec.region || REGION_BY_CITY[city] || "";
    const typeLabel = TYPE_TAGLINE[cls.type] ?? "Sauna";

    const hours = buildHours(rec);
    // Booking link only when sauna-relevant: prefer the enrichment's vetted
    // deep-link, else accept the OSM website if it is itself a sauna/booking page.
    const bookingUrl = enr?.bookingUrl || (isDeepBookingUrl(rec.website) ? rec.website : undefined);
    const priceFrom = typeof enr?.priceFromHint === "number" ? enr.priceFromHint : undefined;
    const rating = typeof rec.rating === "number" ? rec.rating : undefined;
    const amenities = deriveAmenities(rec);

    const amenityList = [];
    if (amenities.seaAccess) amenityList.push("sea bathing");
    else if (amenities.lakeAccess) amenityList.push("lake bathing");
    else if (amenities.bathing) amenityList.push("swimming");
    if (amenities.coldPlunge) amenityList.push("a cold plunge");
    if (amenities.woodFired) amenityList.push("a wood-fired sauna");
    if (amenities.cafe) amenityList.push("a café");
    const amenitySentence = amenityList.length
      ? ` On site you'll find ${amenityList.slice(0, 3).join(", ")}.`
      : "";

    const entry = {
      slug,
      name: rec.name,
      type: cls.type,
      tagline: `${typeLabel} in ${city}.`,
      description: `${rec.name} is a ${typeLabel.toLowerCase()} in ${city}.${amenitySentence} Check current opening hours, prices and booking directly with ${rec.name}.`,
      address: rec.address || city,
      city,
      region,
      country: "Sweden",
      lat: rec.lat,
      lng: rec.lng,
      ...(rec.website ? { website: rec.website } : {}),
      ...(rec.phone ? { phone: rec.phone } : {}),
      ...(rec.email ? { email: rec.email } : {}),
      bookable: !!bookingUrl,
      bookingMethod: bookingUrl ? "online" : "drop-in",
      ...(bookingUrl ? { bookingUrl } : {}),
      priceModel: "per-person",
      ...(priceFrom != null ? { priceFrom } : {}),
      currency: "SEK",
      amenities,
      openingHours: hours?.human ?? [],
      ...(hours?.spec ? { hours: hours.spec } : {}),
      instructions: [],
      ...(rating != null ? { googleRating: rating } : {}),
      ...(rating != null && rec.reviewsCount != null ? { googleReviewsCount: rec.reviewsCount } : {}),
      ...(rating != null ? { googleReviewsUrl: googleReviewsUrl(rec) } : {}),
      ...(pho?.photo ? { photo: pho.photo } : {}),
      ...(pho?.photoCredit ? { photoCredit: pho.photoCredit } : {}),
      verified: false,
      confidence: confidence(rec, { hours, bookingUrl, rating }),
      source: rec.sources?.includes("dataforseo")
        ? "Harvest: Google Maps via DataForSEO"
        : rec.sources?.some((x) => x?.startsWith("directory:"))
          ? `Harvest: ${rec.sources.find((x) => x.startsWith("directory:"))}`
          : "Harvest: OpenStreetMap (ODbL)",
      ...(rec.sourceUrl ? { sourceUrl: rec.sourceUrl } : {}),
      lastVerified: TODAY,
    };

    // QUALITY GATE: only publish venues that clear the bar; the rest become
    // unpublished candidates for manual promotion.
    const hasSignal =
      !!bookingUrl || entry.priceFrom != null || (entry.hours && entry.hours.length > 0) || entry.googleRating != null;
    if (entry.website && hasSignal && entry.city !== "Unknown location") {
      published.push(entry);
    } else {
      candidatesOut.push({ ...entry, _missing: gateGap(entry) });
    }
  }

  // stale flag: entries not re-verified in a while should be re-checked
  const STALE_DAYS = 180;
  const staleCutoff = Date.now() - STALE_DAYS * 86400000;
  const stale = [...protectedEntries, ...published]
    .filter((s) => {
      const t = Date.parse(s.lastVerified);
      return Number.isFinite(t) && t < staleCutoff;
    })
    .map((s) => ({ slug: s.slug, name: s.name, city: s.city, lastVerified: s.lastVerified }));

  // report
  console.log("\n--- Merge report ---");
  console.log(`  PUBLISH (passed bar) : ${published.length}`);
  console.log(`  candidates (held)    : ${candidatesOut.length}`);
  console.log(`  needs review         : ${review.length}`);
  console.log(`  dropped (non-sauna)  : ${dropped}`);
  console.log(`  curated/protected    : ${protectedEntries.length}`);
  console.log(`  stale (>${STALE_DAYS}d re-check): ${stale.length}`);

  await writeFile(REVIEW_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), count: review.length, records: review }, null, 2), "utf8");
  await writeFile(CANDIDATES_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), count: candidatesOut.length, note: "Held back by the quality gate. To publish one, copy it into a curated source and set verified:true.", records: candidatesOut }, null, 2), "utf8");
  await writeFile(STALE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), staleDays: STALE_DAYS, count: stale.length, records: stale }, null, 2), "utf8");
  console.log(`  candidates written   -> ${path.relative(ROOT, CANDIDATES_PATH)}`);

  const final = [
    ...protectedEntries.map((e) => ({ ...e, verified: e.verified ?? true })),
    ...published,
  ].sort(
    (a, b) => (a.city || "").localeCompare(b.city || "", "sv") || a.name.localeCompare(b.name, "sv")
  );

  if (WRITE) {
    await writeFile(SAUNAS_PATH, JSON.stringify(final, null, 2) + "\n", "utf8");
    console.log(`\nWROTE ${final.length} published entr(y/ies) to ${path.relative(ROOT, SAUNAS_PATH)} (${protectedEntries.length} protected + ${published.length} harvested).`);
  } else {
    console.log(`\nReport only. Re-run with --write to publish ${published.length} harvested entr(y/ies) to src/data/saunas.json.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
