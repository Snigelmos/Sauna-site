#!/usr/bin/env node
/**
 * scripts/gen-images.mjs
 *
 * Generates the site's photoreal imagery with OpenAI's image API and
 * post-processes each result with sharp into an optimized web asset.
 *
 * Pipeline:
 *   manifest -> OpenAI (gpt-image-1, base64) -> raw PNG (assets/generated/_raw)
 *            -> sharp crop/resize -> public/images/...
 *
 * The OpenAI key is loaded via scripts/lib/env.mjs (never hardcoded). Outputs
 * are idempotent: an existing destination is skipped unless --force.
 *
 * Budget guardrail:
 *   This script calls the OpenAI image API directly. To prevent runaway spend it
 *   estimates the cost of the run up front, enforces a shared daily $ cap, and
 *   refuses to call the API without --yes. The cap + live ledger live in
 *   ~/.seo-pipeline/ and are shared with every other folder/script (e.g. the
 *   Pinterest content API), so $1/day is enforced across ALL chats and folders.
 *
 * Usage:
 *   node scripts/gen-images.mjs --dry           # plan + cost estimate, no API calls
 *   node scripts/gen-images.mjs --yes           # actually generate (required to spend)
 *   node scripts/gen-images.mjs --tier 1 --yes  # only tier 1
 *   node scripts/gen-images.mjs --only home-hero,og-default --yes
 *   node scripts/gen-images.mjs --force --yes   # regenerate even if present
 *   node scripts/gen-images.mjs --limit 5 --yes
 *   node scripts/gen-images.mjs --quality low --yes
 *   node scripts/gen-images.mjs --budget 0.50 --yes   # override the daily cap (default $1)
 *   node scripts/gen-images.mjs --model dall-e-3 --yes
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadOpenAIKey } from "./lib/env.mjs";
import { images, KINDS, STYLE_SUFFIX, GUARDRAILS } from "./assets/image-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const RAW_DIR = path.join(ROOT, "assets", "generated", "_raw");
const API_URL = "https://api.openai.com/v1/images/generations";

// Shared, cross-folder budget guardrail. Every spend path (this script, the
// Affiliate content API, etc.) reads the same daily cap and writes the same
// ledger so $X/day is enforced across ALL chats and folders, not per-project.
const BUDGET_DIR = path.join(os.homedir(), ".seo-pipeline");
const BUDGET_PATH = path.join(BUDGET_DIR, "budget.json");
const LEDGER_PATH = path.join(BUDGET_DIR, ".spend_ledger.json");

// Approx OpenAI image pricing (USD per generated image). Used ONLY for the
// pre-flight budget estimate; the real charge is whatever OpenAI bills.
// gpt-image-1 is token-based ($40 / 1M output image tokens); these are the
// effective per-image costs at each size/quality. dall-e-3 is flat-rate.
const PRICING = {
  "gpt-image-1": {
    "1024x1024": { low: 0.011, medium: 0.042, high: 0.167 },
    "1536x1024": { low: 0.016, medium: 0.063, high: 0.25 },
    "1024x1536": { low: 0.016, medium: 0.063, high: 0.25 },
  },
  "dall-e-3": {
    "1024x1024": { standard: 0.04, hd: 0.08 },
    "1792x1024": { standard: 0.08, hd: 0.12 },
    "1024x1792": { standard: 0.08, hd: 0.12 },
  },
};

// Conservative fallback if a size/quality combo isn't in the table above.
const FALLBACK_PRICE = 0.25;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const val = (name, def) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};

const FORCE = flag("--force");
const DRY = flag("--dry");
const CONFIRM = flag("--yes") || flag("-y");
const BUDGET_OVERRIDE = Number(val("--budget", "")) || null;
const MODEL = val("--model", "gpt-image-1");
const QUALITY_OVERRIDE = val("--quality", null);
const TIER = val("--tier", null);
const LIMIT = Number(val("--limit", "0")) || Infinity;
const ONLY = (val("--only", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function exists(p) {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

// dall-e-3 supports a different set of sizes than gpt-image-1.
function apiSize(genSize) {
  if (MODEL === "dall-e-3") {
    if (genSize === "1536x1024") return "1792x1024";
    if (genSize === "1024x1536") return "1024x1792";
    return "1024x1024";
  }
  return genSize;
}

// Estimated USD cost of a single image at this size/quality, for budgeting.
function estimateCost(size, quality) {
  const sizes = PRICING[MODEL];
  if (!sizes) return FALLBACK_PRICE;
  const tiers = sizes[size];
  if (!tiers) return FALLBACK_PRICE;
  let q = quality;
  // dall-e-3 has no low/medium/high; map onto standard/hd.
  if (MODEL === "dall-e-3") q = quality === "high" ? "hd" : "standard";
  return tiers[q] ?? FALLBACK_PRICE;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

// Resolve the daily cap: explicit --budget wins, else the shared global config,
// else a conservative $1.
async function resolveBudget() {
  if (BUDGET_OVERRIDE) return BUDGET_OVERRIDE;
  try {
    const cfg = JSON.parse(await readFile(BUDGET_PATH, "utf8"));
    const cap = Number(cfg?.daily_usd_cap);
    if (cap > 0) return cap;
  } catch {
    /* no shared config -> fall through */
  }
  return 1;
}

// The shared ledger is a flat { "YYYY-MM-DD": usdSpent } map, written by every
// spend path (Node + Python) so the daily total is global across folders.
async function readSpentToday() {
  try {
    const j = JSON.parse(await readFile(LEDGER_PATH, "utf8"));
    const v = Number(j?.[TODAY()]);
    return { ledger: j && typeof j === "object" ? j : {}, spent: v > 0 ? v : 0 };
  } catch {
    return { ledger: {}, spent: 0 };
  }
}

async function recordSpend(ledger, totalToday) {
  try {
    ledger[TODAY()] = Math.round(totalToday * 1e4) / 1e4;
    await mkdir(BUDGET_DIR, { recursive: true });
    await writeFile(LEDGER_PATH, JSON.stringify(ledger));
  } catch (err) {
    console.error(`  (warning: could not update shared spend ledger: ${err.message})`);
  }
}

async function generate(key, prompt, genSize, quality) {
  const body = {
    model: MODEL,
    prompt,
    size: apiSize(genSize),
    n: 1,
  };
  // gpt-image-1 always returns base64 and rejects response_format; dall-e-* needs it.
  if (MODEL.startsWith("dall-e")) body.response_format = "b64_json";
  else body.quality = quality;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = JSON.parse(text);
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data in response.");
    return Buffer.from(b64, "base64");
  } finally {
    clearTimeout(timer);
  }
}

async function postProcess(rawBuf, item, cfg) {
  const { w, h } = cfg.final;
  for (const format of cfg.format) {
    const outRel = format === cfg.format[0] ? item.out : item.out.replace(/\.[^.]+$/, `.${format}`);
    const outAbs = path.join(PUBLIC_DIR, outRel);
    await mkdir(path.dirname(outAbs), { recursive: true });
    let pipe = sharp(rawBuf).resize(w, h, { fit: "cover", position: "centre" });
    if (format === "webp") pipe = pipe.webp({ quality: 82 });
    else if (format === "png") pipe = pipe.png({ compressionLevel: 9 });
    else if (format === "jpg" || format === "jpeg") pipe = pipe.jpeg({ quality: 84, mozjpeg: true });
    await pipe.toFile(outAbs);
    console.log(`    wrote public/${outRel}`);
  }
}

async function main() {
  let queue = images;
  if (TIER) queue = queue.filter((i) => String(i.tier) === String(TIER));
  if (ONLY.length) queue = queue.filter((i) => ONLY.includes(i.id));

  // ---- Build the plan (what we would actually generate) + cost estimate -----
  const plan = [];
  let skipped = 0;
  const failures = [];

  for (const item of queue) {
    if (plan.length >= LIMIT) break;
    const cfg = KINDS[item.kind];
    if (!cfg) {
      failures.push(`${item.id}: unknown kind "${item.kind}"`);
      continue;
    }
    const outAbs = path.join(PUBLIC_DIR, item.out);
    if (!FORCE && (await exists(outAbs))) {
      skipped++;
      console.log(`  skip   ${item.id} (exists)`);
      continue;
    }
    const size = apiSize(cfg.gen);
    const quality = QUALITY_OVERRIDE || cfg.quality;
    const cost = estimateCost(size, quality);
    plan.push({ item, cfg, size, quality, cost });
    console.log(
      `  plan   ${item.id} -> public/${item.out} [${MODEL} ${size} ${quality}]  ~$${cost.toFixed(3)}`
    );
  }

  const estTotal = plan.reduce((s, p) => s + p.cost, 0);

  // ---- Shared cross-folder budget guardrail ---------------------------------
  const BUDGET = await resolveBudget();
  const { ledger, spent: spentToday } = await readSpentToday();
  const remaining = Math.max(0, BUDGET - spentToday);
  console.log(
    `\nShared budget: $${BUDGET.toFixed(2)}/day (all folders) | already spent today: $${spentToday.toFixed(
      3
    )} | remaining: $${remaining.toFixed(3)}`
  );
  console.log(`Estimated cost of this run: ~$${estTotal.toFixed(3)} (${plan.length} image(s)).`);

  if (DRY) {
    console.log("\nDry run: no API calls made, no spend.");
    return;
  }

  if (plan.length === 0) {
    console.log("\nNothing to generate. Done.");
    if (failures.length) {
      console.error("\nFailures:\n - " + failures.join("\n - "));
      process.exit(1);
    }
    return;
  }

  if (estTotal > remaining + 1e-9) {
    console.error(
      `\nABORT: estimated $${estTotal.toFixed(3)} exceeds remaining daily budget $${remaining.toFixed(
        3
      )}.\n` +
        `Options: lower quality (--quality low), generate fewer (--limit N / --only ...),\n` +
        `raise the cap (--budget X), or wait until tomorrow. No charges were made.`
    );
    process.exit(1);
  }

  if (!CONFIRM) {
    console.error(
      `\nNo charges made. This would cost ~$${estTotal.toFixed(3)}.\n` +
        `Re-run with --yes to confirm and generate (or --dry to re-estimate).`
    );
    process.exit(1);
  }

  const key = await loadOpenAIKey();
  if (!key) {
    console.error(
      "No OpenAI key found. Add OPENAI_API_KEY to ./.env (it is git-ignored). See scripts/lib/env.mjs."
    );
    process.exit(1);
  }

  await mkdir(RAW_DIR, { recursive: true });

  // ---- Generate, charging the shared ledger after each success --------------
  let made = 0;
  let spent = spentToday;

  for (const { item, cfg, size, quality, cost } of plan) {
    // Re-check the shared cap before every call in case earlier images cost more.
    if (spent + cost > BUDGET + 1e-9) {
      console.error(
        `  STOP   shared daily budget $${BUDGET.toFixed(2)} reached ($${spent.toFixed(
          3
        )} spent). Skipping the rest.`
      );
      break;
    }
    const prompt = `${item.prompt} ${STYLE_SUFFIX} ${GUARDRAILS}`;
    try {
      console.log(`  gen    ${item.id} ...`);
      const rawBuf = await generate(key, prompt, cfg.gen, quality);
      await writeFile(path.join(RAW_DIR, `${item.id}.png`), rawBuf);
      await postProcess(rawBuf, item, cfg);
      made++;
      spent += cost;
      await recordSpend(ledger, spent);
    } catch (err) {
      console.error(`  FAIL   ${item.id}: ${err.message}`);
      failures.push(`${item.id}: ${err.message}`);
    }
  }

  console.log(
    `\nDone. ${made} generated, ${skipped} skipped, ${failures.length} failed (of ${queue.length} selected).` +
      `\nEstimated spend this run: ~$${(spent - spentToday).toFixed(3)} | shared today total: ~$${spent.toFixed(
        3
      )} of $${BUDGET.toFixed(2)} cap.`
  );
  if (failures.length) {
    console.error("\nFailures:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
