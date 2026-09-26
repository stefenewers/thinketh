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
  /** Calls answered from the fallback without trying the sponsor (circuit open). */
  skipped?: number;
  /** Circuit breaker: while set and in the future, calls skip straight to the fallback. */
  openUntil?: number;
};

/** After a failure, skip the adapter for this long so one request never waits on it twice. */
export const CIRCUIT_COOLDOWN_MS = 30_000;

/**
 * Failures that retrying cannot fix in this runtime, e.g. Deno's TLS stack rejecting
 * Timescale's certificate (CaUsedAsEndEntity). These keep the circuit open for the
 * life of the instance. Certificate verification itself is never disabled.
 */
const PERMANENT_FAILURE = /certificate|CaUsedAsEndEntity|UnknownIssuer|self[- ]signed/i;

const health = new Map<AdapterName, AdapterHealth>();

export function markConfigured(name: AdapterName, configured: boolean): void {
  const h = health.get(name) ?? { configured, calls: 0, fallbacks: 0 };
  h.configured = configured;
  health.set(name, h);
}

/**
 * live: configured and the most recent call succeeded. degraded: the most
 * recent call failed or the circuit is open (serving fallback). unverified: configured, no calls yet.
 * fallback: not configured.
 */
export type AdapterStatus = "live" | "degraded" | "unverified" | "fallback";

function statusOf(h: AdapterHealth): AdapterStatus {
  if (!h.configured) return "fallback";
  if (isOpen(h)) return "degraded";
  if (!h.lastOkAt && !h.lastErrorAt) return "unverified";
  if (h.lastOkAt && (!h.lastErrorAt || h.lastOkAt >= h.lastErrorAt)) return "live";
  return "degraded";
}

function isOpen(h: AdapterHealth | undefined): boolean {
  return !!h?.openUntil && h.openUntil > Date.now();
}

/** True while the adapter is being skipped. `permanent` limits it to failures retrying cannot fix. */
export function circuitOpen(name: AdapterName, permanent = false): boolean {
  const h = health.get(name);
  return isOpen(h) && (!permanent || h!.openUntil === Infinity);
}

export type AdapterHealthView = Omit<AdapterHealth, "openUntil"> & {
  status: AdapterStatus;
  circuit: "closed" | "open" | "open_permanent";
  retryAt?: string;
};

export function adapterHealth(): Record<string, AdapterHealthView> {
  return Object.fromEntries(
    [...health].map(([name, h]) => {
      const { openUntil, ...rest } = h;
      const circuit = !isOpen(h) ? "closed" : openUntil === Infinity ? "open_permanent" : "open";
      return [
        name,
        { status: statusOf(h), circuit, ...(circuit === "open" ? { retryAt: new Date(openUntil!).toISOString() } : {}), ...rest },
      ];
    }),
  );
}

/** Test helper: close every circuit. */
export function resetCircuits(): void {
  for (const h of health.values()) delete h.openUntil;
}

/** Record one call outcome for an adapter (used by guarded calls and health probes). */
export function recordCall(name: AdapterName, ok: boolean, error?: string, opts: { trip?: boolean } = {}): void {
  const h = health.get(name) ?? { configured: true, calls: 0, fallbacks: 0 };
  h.calls++;
  const now = new Date().toISOString();
  if (ok) {
    h.lastOkAt = now;
    delete h.openUntil;
  } else {
    h.fallbacks++;
    h.lastErrorAt = now;
    if (error) h.lastError = error.slice(0, 300);
    const permanent = !!error && PERMANENT_FAILURE.test(error);
    if (opts.trip === false) {
      health.set(name, h);
      return;
    }
    if (!isOpen(h)) logEvent("adapter.circuit_open", { adapter: name, permanent, error: h.lastError }, "warn");
    h.openUntil = permanent ? Infinity : Date.now() + CIRCUIT_COOLDOWN_MS;
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
  const h = health.get(adapter);
  if (isOpen(h)) {
    h!.skipped = (h!.skipped ?? 0) + 1;
    return { value: await fallback(), source: "fallback" };
  }
  const started = Date.now();
  try {
    const value = await withTimeout(live(), timeoutMs, `${adapter}.${op}`);
    recordCall(adapter, true);
    return { value, source: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A slow Claude generation is a per-task miss, not an outage: fall back without skipping Claude for everyone.
    recordCall(adapter, false, message, { trip: !(adapter === "claude" && err instanceof AdapterTimeoutError) });
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
