// Shared helpers for the demo-audit harness. No secrets are ever printed or written:
// env values are read only to pass them to child processes and HTTP headers.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HARNESS_DIR, "../..");

// Separate ports so the audit never touches a running demo API (:8787) or phone Metro (:8081).
export const API_PORT = Number(process.env.AUDIT_API_PORT ?? 8797);
export const WEB_PORT = Number(process.env.AUDIT_WEB_PORT ?? 8091);
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export function readEnv(file = join(ROOT, ".env")) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] !== "") out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Run id (UTC timestamp) and the audit user every request is rewritten to. */
export function runContext() {
  const runId = process.env.AUDIT_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const evidenceDir = join(ROOT, "docs/demo-audit/evidence", runId);
  return { runId, evidenceDir, auditUser: process.env.AUDIT_USER ?? `audit-${runId.toLowerCase()}` };
}

export async function api(path, { method = "GET", body, user, timeoutMs = 30000 } = {}) {
  const env = readEnv();
  const headers = { "Content-Type": "application/json" };
  if (env.THINKETH_APP_KEY) headers["x-thinketh-app-key"] = env.THINKETH_APP_KEY;
  if (user) headers["x-thinketh-user-id"] = user;
  const started = Date.now();
  try {
    const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, ms: Date.now() - started, json };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String(e?.message ?? e) };
  }
}

/** Per-adapter call/fallback counters, so each step can say which sponsors it reached and whether they fell back. */
export async function adapterCounters() {
  const h = await api("/health");
  const out = {};
  for (const [name, a] of Object.entries(h.json?.adapters ?? {})) out[name] = { status: a.status, calls: a.calls ?? 0, fallbacks: a.fallbacks ?? 0, lastError: a.lastError?.slice(0, 160) };
  return out;
}

export function diffCounters(before, after) {
  const out = {};
  for (const [name, a] of Object.entries(after)) {
    const b = before[name] ?? { calls: 0, fallbacks: 0 };
    const calls = a.calls - b.calls;
    const fallbacks = a.fallbacks - b.fallbacks;
    if (calls || fallbacks) out[name] = { calls, fallbacks, status: a.status, ...(fallbacks && a.lastError ? { lastError: a.lastError } : {}) };
  }
  return out;
}
