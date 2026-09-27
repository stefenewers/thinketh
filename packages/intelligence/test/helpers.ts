import type { KnowledgeState } from "../src/contracts.ts";
import { loadConfig, type ThinkethConfig } from "../src/config.ts";
import type { Graph } from "../src/engine/knowledgeState.ts";
import { buildSeed } from "../src/seed/corpus.ts";

export const NOW = new Date("2026-09-26T12:00:00.000Z");

/** Config with every sponsor credential stripped, so tests never hit the network. */
export function offlineConfig(): ThinkethConfig {
  const c = loadConfig();
  return {
    ...c,
    anthropic: { ...c.anthropic, apiKey: undefined },
    backboard: { ...c.backboard, apiKey: undefined },
    mongo: { ...c.mongo, uri: undefined },
    voyage: { ...c.voyage, apiKey: undefined },
    tiger: { url: undefined, tlsInsecure: false },
    readerFallback: null,
    supabase: { url: undefined, anonKey: undefined, serviceRoleKey: undefined },
    elevenlabs: { apiKey: undefined, agentId: undefined },
    muse: { ...c.muse, apiKey: undefined },
    dataDir: undefined,
    identity: { demoIdentities: true, trustUserHeader: true },
    discovery: { ...c.discovery, everyMinutes: 0 },
  };
}

export function seedGraph(): { seed: ReturnType<typeof buildSeed>; graph: Graph; states: Map<string, KnowledgeState> } {
  const seed = buildSeed(NOW);
  return {
    seed,
    graph: { concepts: new Map(seed.concepts.map((c) => [c.id, c])), edges: seed.edges },
    states: new Map(seed.baselineStates.map((s) => [s.conceptId, s])),
  };
}

export function stateOf(partial: Partial<KnowledgeState> & { conceptId: string }): KnowledgeState {
  return {
    userId: "u",
    mastery: 0.5,
    confidence: 0.5,
    uncertainty: 0.4,
    evidenceCount: 0,
    lastObservedAt: NOW.toISOString(),
    misconceptionFlags: [],
    ...partial,
  };
}
