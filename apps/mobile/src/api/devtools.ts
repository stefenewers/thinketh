// Dev-only helpers for the demo panel. /health is an operational endpoint, not
// part of the product contract, so its shape is parsed leniently here.
import { z } from "zod";
import { API_URL, USE_MOCK_API } from "./index";

const AdapterHealthSchema = z.object({
  configured: z.boolean(),
  calls: z.number(),
  fallbacks: z.number(),
  lastOkAt: z.string().optional(),
  lastErrorAt: z.string().optional(),
  lastError: z.string().optional(),
});
const HealthSchema = z.object({ ok: z.boolean(), adapters: z.record(z.string(), AdapterHealthSchema) });

export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;
export type AdapterStatus = "LIVE" | "LIVE · untested" | "DEGRADED" | "FALLBACK";

export function adapterStatus(h: AdapterHealth): AdapterStatus {
  if (!h.configured) return "FALLBACK";
  if (h.calls === 0) return "LIVE · untested";
  // Configured, but the most recent call fell back.
  if (h.lastErrorAt && (!h.lastOkAt || h.lastErrorAt > h.lastOkAt)) return "DEGRADED";
  return "LIVE";
}

export async function fetchHealth(): Promise<z.infer<typeof HealthSchema> | null> {
  if (USE_MOCK_API || !API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/health`, { signal: controller.signal });
    return HealthSchema.parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
