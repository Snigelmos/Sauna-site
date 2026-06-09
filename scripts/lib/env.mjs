/**
 * scripts/lib/env.mjs
 *
 * Loads DataForSEO credentials without committing them. Resolution order:
 *   1. process.env (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)
 *   2. ./.env in the project root
 *   3. ~/.seo-pipeline/.env (the shared global pipeline credentials)
 *
 * Accepts a few common key spellings.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const LOGIN_KEYS = ["DATAFORSEO_LOGIN", "DFS_LOGIN", "DATAFORSEO_USER"];
const PASS_KEYS = ["DATAFORSEO_PASSWORD", "DFS_PASSWORD", "DATAFORSEO_PASS"];

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function tryFile(p) {
  try {
    return parseEnv(await readFile(p, "utf8"));
  } catch {
    return {};
  }
}

function firstKey(obj, keys) {
  for (const k of keys) if (obj[k]) return obj[k];
  return null;
}

export async function loadDfsCredentials() {
  const fromProcess = {
    login: firstKey(process.env, LOGIN_KEYS),
    password: firstKey(process.env, PASS_KEYS),
  };
  if (fromProcess.login && fromProcess.password) return fromProcess;

  const projectEnv = await tryFile(path.join(ROOT, ".env"));
  const globalEnv = await tryFile(path.join(os.homedir(), ".seo-pipeline", ".env"));
  const merged = { ...globalEnv, ...projectEnv, ...process.env };

  return {
    login: firstKey(merged, LOGIN_KEYS),
    password: firstKey(merged, PASS_KEYS),
  };
}

const OPENAI_KEYS = ["OPENAI_API_KEY", "OPENAI_KEY"];

/**
 * Resolves the OpenAI API key without committing it. Resolution order:
 *   1. process.env (OPENAI_API_KEY / OPENAI_KEY)
 *   2. ./.env in the project root
 *   3. ~/.seo-pipeline/.env (shared global pipeline credentials)
 *   4. ../Affiliate pages master/.env (the shared affiliate-master key)
 * Returns the key string, or null if none is found.
 */
export async function loadOpenAIKey() {
  const fromProcess = firstKey(process.env, OPENAI_KEYS);
  if (fromProcess) return fromProcess;

  const projectEnv = await tryFile(path.join(ROOT, ".env"));
  const globalEnv = await tryFile(path.join(os.homedir(), ".seo-pipeline", ".env"));
  const masterEnv = await tryFile(path.resolve(ROOT, "..", "Affiliate pages master", ".env"));
  const merged = { ...masterEnv, ...globalEnv, ...projectEnv, ...process.env };

  return firstKey(merged, OPENAI_KEYS);
}
