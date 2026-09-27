/**
 * Local/dev server. Serves the API at both / and /api (the same paths the
 * Supabase Edge Function exposes under /functions/v1/api).
 *
 *   npm run dev:api        (from the repo root)
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { adapterHealth } from "../adapters/guard.ts";
import { createThinketh } from "../index.ts";
import { logEvent } from "../log.ts";

const { app, config, discovery } = createThinketh();
// Opt-in: THINKETH_DISCOVERY_EVERY_MINUTES > 0 runs the bounded discovery pipeline on this process.
discovery.schedule(config.discovery.everyMinutes);
const root = new Hono().route("/api", app).route("/", app);

serve({ fetch: root.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  const adapters = Object.fromEntries(Object.entries(adapterHealth()).map(([k, v]) => [k, v.configured ? "live" : "fallback"]));
  logEvent("server.started", { url: `http://localhost:${info.port}`, adapters });
});
