/**
 * scripts/lib/http.mjs
 *
 * Shared polite-fetch helpers for the harvest pipeline:
 *   - descriptive User-Agent
 *   - per-host robots.txt check (cached)
 *   - on-disk response cache (so re-runs are free and we stop hammering hosts)
 *   - rate-limited fetch with timeout + one retry
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.resolve(ROOT, "data/raw/.cache");

export const USER_AGENT =
  "bastukartan-harvester/1.0 (sauna finder pilot; contact: hello@homesaunaguide.com)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheKey(url) {
  return createHash("sha1").update(url).digest("hex").slice(0, 20);
}

async function readCache(url) {
  try {
    const raw = await readFile(path.join(CACHE_DIR, cacheKey(url) + ".json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(url, entry) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, cacheKey(url) + ".json"), JSON.stringify(entry), "utf8");
}

/**
 * Fetch text with timeout + one retry. Returns { ok, status, url(final), body }.
 * Uses the on-disk cache unless { fresh: true }.
 */
export async function fetchText(url, { timeoutMs = 15000, fresh = false, accept } = {}) {
  if (!fresh) {
    const cached = await readCache(url);
    if (cached) return { ...cached, cached: true };
  }
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...(accept ? { Accept: accept } : {}) },
        redirect: "follow",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await res.text();
      const entry = { ok: res.ok, status: res.status, url: res.url || url, body };
      if (res.ok) await writeCache(url, entry);
      return entry;
    } catch (err) {
      clearTimeout(t);
      last = err;
      await sleep(500);
    }
  }
  return { ok: false, status: 0, url, body: "", error: String(last) };
}

// ---- robots.txt (minimal, per-host, cached in-memory) ----------------------
const robotsCache = new Map();

function parseRobots(txt) {
  // Collect Disallow rules under User-agent: * (and our agent). Good enough for
  // a polite directory crawl - we only check whether a path is disallowed.
  const lines = txt.split(/\r?\n/);
  const groups = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (current && current.rules.length === 0) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      }
    } else if (current) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

export async function isAllowed(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const origin = u.origin;
  if (!robotsCache.has(origin)) {
    const res = await fetchText(origin + "/robots.txt", { timeoutMs: 8000 });
    robotsCache.set(origin, res.ok ? parseRobots(res.body) : []);
  }
  const groups = robotsCache.get(origin);
  const ua = "bastukartan-harvester";
  const applicable =
    groups.find((g) => g.agents.includes(ua)) ?? groups.find((g) => g.agents.includes("*"));
  if (!applicable) return true;
  const pathName = u.pathname || "/";
  // longest-match wins between allow/disallow
  let decision = true;
  let bestLen = -1;
  for (const rule of applicable.rules) {
    if (!rule.path) continue;
    if (pathName.startsWith(rule.path) && rule.path.length > bestLen) {
      bestLen = rule.path.length;
      decision = rule.type === "allow";
    }
  }
  return decision;
}
