/**
 * Composition root: config -> seed -> adapters -> service -> HTTP app.
 * Used by the Node server, the Supabase Edge Function and the tests.
 */
import { buildAdapters } from "./adapters/registry.ts";
import { createApp } from "./api/app.ts";
import { loadConfig, type ThinkethConfig } from "./config.ts";
import { buildSeed } from "./seed/corpus.ts";
import { ThinkethService } from "./service.ts";

export function createThinketh(overrides: { config?: ThinkethConfig; now?: () => Date } = {}) {
  const config = overrides.config ?? loadConfig();
  const seed = buildSeed(overrides.now?.() ?? new Date());
  const adapters = buildAdapters(config, seed);
  const service = new ThinkethService(config, seed, adapters, overrides.now);
  const app = createApp({ service, config, supabase: adapters.supabase });
  return { config, seed, adapters, service, app };
}

export { ThinkethService } from "./service.ts";
export { buildSeed, FLAGSHIP_DEVELOPMENT_ID } from "./seed/corpus.ts";
