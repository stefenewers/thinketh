/**
 * Failure boundary for every sponsor call: timeout, error mapping, logging,
 * deterministic fallback. The UI never waits on or fails because of a sponsor.
 */
import { logEvent } from "../log.ts";
import type { AdapterName } from "./types.ts";

export class AdapterTimeoutError extends Error {}

export type AdapterHealth = {
  configured: boolean;
  lastOkAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  calls: number;
  fallbacks: number;
};

const health = new Map<AdapterName, AdapterHealth>();

export function markConfigured(name: AdapterName, configured: boolean): void {
  const h = health.get(name) ?? { configured, calls: 0, fallbacks: 0 };
  h.configured = configured;
  health.set(name, h);
}

/**
 * live: configured and the most recent call succeeded. degraded: the most
 * recent call failed (serving fallback). unverified: configured, no calls yet.
 * fallback: not configured.
 */
export type AdapterStatus = "live" | "degraded" | "unverified" | "fallback";

function statusOf(h: AdapterHealth): AdapterStatus {
  if (!h.configured) return "fallback";
  if (!h.lastOkAt && !h.lastErrorAt) return "unverified";
  if (h.lastOkAt && (!h.lastErrorAt || h.lastOkAt >= h.lastErrorAt)) return "live";
  return "degraded";
}

export function adapterHealth(): Record<string, AdapterHealth & { status: AdapterStatus }> {
  return Object.fromEntries([...health].map(([name, h]) => [name, { status: statusOf(h), ...h }]));
}

function record(name: AdapterName, ok: boolean, error?: string): void {
  const h = health.get(name) ?? { configured: true, calls: 0, fallbacks: 0 };
  h.calls++;
  const now = new Date().toISOString();
  if (ok) h.lastOkAt = now;
  else {
    h.fallbacks++;
    h.lastErrorAt = now;
    if (error) h.lastError = error.slice(0, 300);
  }
  health.set(name, h);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AdapterTimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export type Guarded<T> = { value: T; source: "live" | "fallback" };

/**
 * Run a sponsor operation with a timeout. On any failure, log it and return
 * the fallback instead. Pass `live: undefined` when the adapter is not
 * configured to go straight to the fallback without logging an error.
 */
export async function guarded<T>(
  adapter: AdapterName,
  op: string,
  live: (() => Promise<T>) | undefined,
  fallback: () => T | Promise<T>,
  timeoutMs: number,
): Promise<Guarded<T>> {
  if (!live) return { value: await fallback(), source: "fallback" };
  const started = Date.now();
  try {
    const value = await withTimeout(live(), timeoutMs, `${adapter}.${op}`);
    record(adapter, true);
    return { value, source: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record(adapter, false, message);
    logEvent("adapter.fallback", { adapter, op, ms: Date.now() - started, error: message }, "warn");
    return { value: await fallback(), source: "fallback" };
  }
}

/** Map a non-2xx fetch response to a readable error (never leaks secrets). */
export async function ensureOk(res: Response, label: string): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new Error(`${label} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Keep work alive after the response on Supabase Edge; plain fire-and-forget on Node. */
export function runInBackground(label: string, task: Promise<unknown>): void {
  const safe = task.catch((err) => logEvent("background.error", { label, error: String(err) }, "warn"));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(safe);
}
