import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { rateLimit, safeEqual, type RateRule } from "../src/api/protect.ts";
import { createThinketh } from "../src/index.ts";
import { NOW, offlineConfig } from "./helpers.ts";

afterEach(() => vi.unstubAllEnvs());

const app = () => createThinketh({ config: offlineConfig(), now: () => NOW }).app;
const json = { "content-type": "application/json" };

describe("app key", () => {
  it("is required on every route except /health when THINKETH_APP_KEY is set", async () => {
    vi.stubEnv("THINKETH_APP_KEY", "k-123");
    const a = app();
    expect((await a.request("/brief/today")).status).toBe(403);
    expect((await a.request("/brief/today", { headers: { "x-thinketh-app-key": "wrong" } })).status).toBe(403);
    expect((await a.request("/brief/today", { headers: { "x-thinketh-app-key": "k-123" } })).status).toBe(200);
    expect((await a.request("/health")).status).toBe(200);
  });

  it("is not required when unset (local development and tests)", async () => {
    vi.stubEnv("THINKETH_APP_KEY", "");
    expect((await app().request("/brief/today")).status).toBe(200);
  });
});

describe("input limits", () => {
  it("rejects oversized bodies and overlong questions before they reach Claude or memory", async () => {
    const a = app();
    const huge = await a.request("/ask", { method: "POST", headers: json, body: JSON.stringify({ question: "x".repeat(20_000) }) });
    expect(huge.status).toBe(400);
    const long = await a.request("/ask", { method: "POST", headers: json, body: JSON.stringify({ question: "q".repeat(501) }) });
    expect(long.status).toBe(400);
    expect(((await long.json()) as { error: { message: string } }).error.message).toMatch(/500 characters/);
  });
});

describe("rate limits", () => {
  const rules: RateRule[] = [
    { name: "generative", limit: 2, windowMs: 60_000, match: (m, p) => m === "POST" && p === "/x" },
    { name: "all", limit: 100, windowMs: 60_000, match: () => true },
  ];

  it("returns 429 per client once a route's limit is spent, and resets after the window", async () => {
    let t = 0;
    const h = new Hono().use("*", rateLimit(rules, () => t)).post("/x", (c) => c.text("ok"));
    const hit = (ip: string) => h.request("/x", { method: "POST", headers: { "cf-connecting-ip": ip } });
    expect((await hit("1.1.1.1")).status).toBe(200);
    expect((await hit("1.1.1.1")).status).toBe(200);
    const limited = await hit("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await hit("2.2.2.2")).status).toBe(200); // other clients unaffected
    t = 60_000;
    expect((await hit("1.1.1.1")).status).toBe(200);
  });

  it("limits demo reset on the real app", async () => {
    const a = app();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await a.request("/demo/reset", { method: "POST", headers: json })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
  });
});
