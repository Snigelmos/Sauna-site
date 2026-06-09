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
 * Usage:
 *   node scripts/gen-images.mjs                 # all missing images
 *   node scripts/gen-images.mjs --tier 1        # only tier 1
 *   node scripts/gen-images.mjs --only home-hero,og-default
 *   node scripts/gen-images.mjs --force         # regenerate even if present
 *   node scripts/gen-images.mjs --limit 5
 *   node scripts/gen-images.mjs --model dall-e-3
 *   node scripts/gen-images.mjs --dry           # plan only, no API calls
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadOpenAIKey } from "./lib/env.mjs";
import { images, KINDS, STYLE_SUFFIX, GUARDRAILS } from "./assets/image-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const RAW_DIR = path.join(ROOT, "assets", "generated", "_raw");
const API_URL = "https://api.openai.com/v1/images/generations";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const val = (name, def) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};

const FORCE = flag("--force");
const DRY = flag("--dry");
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

  const key = DRY ? "dry-run" : await loadOpenAIKey();
  if (!key) {
    console.error(
      "No OpenAI key found. Add OPENAI_API_KEY to ./.env (it is git-ignored). See scripts/lib/env.mjs."
    );
    process.exit(1);
  }

  await mkdir(RAW_DIR, { recursive: true });

  let done = 0;
  let made = 0;
  let skipped = 0;
  const failures = [];

  for (const item of queue) {
    if (made >= LIMIT) break;
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

    const prompt = `${item.prompt} ${STYLE_SUFFIX} ${GUARDRAILS}`;
    const quality = QUALITY_OVERRIDE || cfg.quality;

    if (DRY) {
      console.log(`  plan   ${item.id} -> public/${item.out} [${MODEL} ${apiSize(cfg.gen)} ${quality}]`);
      done++;
      continue;
    }

    try {
      console.log(`  gen    ${item.id} ...`);
      const rawBuf = await generate(key, prompt, cfg.gen, quality);
      await writeFile(path.join(RAW_DIR, `${item.id}.png`), rawBuf);
      await postProcess(rawBuf, item, cfg);
      made++;
      done++;
    } catch (err) {
      console.error(`  FAIL   ${item.id}: ${err.message}`);
      failures.push(`${item.id}: ${err.message}`);
    }
  }

  console.log(
    `\nDone. ${made} generated, ${skipped} skipped, ${failures.length} failed (of ${queue.length} selected).`
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
