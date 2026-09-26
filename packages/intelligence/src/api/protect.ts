/**
 * Abuse protection for the public demo API (it sits behind a public tunnel):
 * an optional shared app key, per-client rate limits, and request size caps.
 * The app key ships inside the mobile bundle, so it is a gate against
 * scanners and casual misuse of the URL, not a user credential.
 */
import type { Context, MiddlewareHandler } from "hono";

/** Constant-time string comparison for keys and tokens. */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const APP_KEY_HEADER = "x-thinketh-app-key";

/** When `appKey` is set, every route except /health needs it. */
export function requireAppKey(appKey: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (appKey && c.req.path !== "/health" && !safeEqual(c.req.header(APP_KEY_HEADER), appKey)) {
      return c.json({ error: { code: "forbidden", message: "App key required" } }, 403);
    }
    await next();
  };
}

/** The client address as seen through the Cloudflare tunnel (falls back to a shared bucket). */
function clientId(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct";
}

export type RateRule = { name: string; limit: number; windowMs: number; match: (method: string, path: string) => boolean };

/** Routes that spend money (Claude, ElevenLabs) or change demo state get tighter limits. */
export const DEFAULT_RATE_RULES: RateRule[] = [
  { name: "reset", limit: 10, windowMs: 60_000, match: (m, p) => m === "POST" && p === "/demo/reset" },
  {
    name: "generative",
    limit: 30,
    windowMs: 60_000,
    match: (m, p) => m === "POST" && (["/ask", "/visualize", "/make-it-stick", "/voice/session", "/resources"].includes(p) || /^\/resources\/[^/]+\/teach$/.test(p)),
  },
  { name: "all", limit: 300, windowMs: 60_000, match: () => true },
];

/** Fixed-window per-client limits. Each request counts against the first matching rule and "all". */
export function rateLimit(rules: RateRule[] = DEFAULT_RATE_RULES, now: () => number = Date.now): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const path = c.req.path.replace(/^\/api(?=\/)/, "");
    const who = clientId(c);
    const applicable = rules.filter((r) => r.name === "all" || r.match(c.req.method, path)).slice(0, 2);
    for (const rule of applicable) {
      const key = `${rule.name}:${who}`;
      const t = now();
      const entry = hits.get(key);
      if (!entry || t >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: t + rule.windowMs });
        continue;
      }
      entry.count++;
      if (entry.count > rule.limit) {
        c.header("retry-after", String(Math.ceil((entry.resetAt - t) / 1000)));
        return c.json({ error: { code: "rate_limited", message: "Too many requests. Try again shortly." } }, 429);
      }
    }
    if (hits.size > 10_000) {
      const t = now();
      for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k);
    }
    await next();
  };
}

/** Largest JSON body any route accepts (the biggest legitimate one is a short answer). */
export const MAX_BODY_BYTES = 16_000;
/** Longest Ask question; also bounds what reaches Claude and Backboard memory. */
export const MAX_QUESTION_CHARS = 500;
/** Longest diagnostic answer (short answers are a sentence or two). */
export const MAX_ANSWER_CHARS = 2_000;
