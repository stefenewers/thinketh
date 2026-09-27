/**
 * Composition root: config -> seed -> adapters -> service -> HTTP app.
 * Used by the Node server, the Supabase Edge Function and the tests.
 */
import { buildAdapters } from "./adapters/registry.ts";
import { createApp } from "./api/app.ts";
import { loadConfig, type ThinkethConfig } from "./config.ts";
import { buildSeed } from "./seed/corpus.ts";
import { ThinkethService } from "./service.ts";
import { createConductor } from "./playground/conductor.ts";
import { PollingOnly, SupabaseBroadcast } from "./playground/realtime.ts";
import { PlaygroundService } from "./playground/room.ts";
import { DiscoveryRunner } from "./discovery/run.ts";
import { MuseChat } from "./playground/exchange/muse.ts";
import { GrokChallenger } from "./playground/exchange/grok.ts";

export function createThinketh(overrides: { config?: ThinkethConfig; now?: () => Date } = {}) {
  const config = overrides.config ?? loadConfig();
  const seed = buildSeed(overrides.now?.() ?? new Date());
  const adapters = buildAdapters(config, seed);
  const service = new ThinkethService(config, seed, adapters, overrides.now);
  const { url, serviceRoleKey, anonKey } = config.supabase;
  const realtime = url && serviceRoleKey ? new SupabaseBroadcast(url, serviceRoleKey) : new PollingOnly();
  const exchangeModel = config.muse.apiKey && config.muse.model ? new MuseChat({ apiKey: config.muse.apiKey, baseUrl: config.muse.baseUrl, model: config.muse.model }) : undefined;
  const playground = new PlaygroundService(service, createConductor(config.muse), realtime, adapters.store, overrides.now, url && anonKey ? { url, key: anonKey } : undefined, {
    model: exchangeModel,
    grader: { live: adapters.model, fallback: adapters.fallbackModel },
    limits: config.exchange,
  }, {
    grok: config.xai.apiKey && config.xai.model ? new GrokChallenger({ apiKey: config.xai.apiKey, baseUrl: config.xai.baseUrl, model: config.xai.model, ...(config.xai.reasoningEffort ? { reasoningEffort: config.xai.reasoningEffort } : {}) }) : undefined,
    limits: config.challenge,
  });
  const discovery = new DiscoveryRunner({ service, store: adapters.store, config, ...(overrides.now ? { now: overrides.now } : {}) });
  const app = createApp({ service, config, supabase: adapters.supabase, playground, discovery });
  return { config, seed, adapters, service, playground, discovery, app };
}

export { ThinkethService } from "./service.ts";
export { buildSeed, FLAGSHIP_DEVELOPMENT_ID } from "./seed/corpus.ts";
