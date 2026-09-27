/**
 * Builds adapters from configuration. Any missing credential selects the
 * local deterministic implementation for that role.
 */
import type { ThinkethConfig } from "../config.ts";
import type { SeedCorpus } from "../seed/types.ts";
import { markConfigured } from "./guard.ts";
import { BackboardMemory, LocalMemory } from "./memory.ts";
import { ClaudeModel } from "./model/claude.ts";
import { DeterministicModel } from "./model/deterministic.ts";
import { LocalSemanticStore, MongoSemanticStore } from "./semantic.ts";
import { SupabaseBackend } from "./supabase.ts";
import { LocalTemporalStore, ResilientTemporalStore, TigerTemporalStore } from "./temporal.ts";
import type { IntelligenceModel, MemoryProvider, SemanticStore, VoiceProvider } from "./types.ts";
import { FileDocStore, MemoryDocStore, MongoDocStore, ResilientDocStore, type DocStore } from "../store/docStore.ts";
import { ElevenLabsVoice, TranscriptVoice } from "./voice.ts";

export type Adapters = {
  model: IntelligenceModel | undefined;
  fallbackModel: DeterministicModel;
  memory: MemoryProvider | undefined;
  localMemory: LocalMemory;
  semantic: SemanticStore | undefined;
  localSemantic: LocalSemanticStore;
  temporal: ResilientTemporalStore;
  voice: VoiceProvider | undefined;
  transcriptVoice: TranscriptVoice;
  supabase: SupabaseBackend | undefined;
  /** Durable app state (resources, rooms, profiles, operations, discovered corpus). */
  store: DocStore;
};

export function buildAdapters(config: ThinkethConfig, seed: SeedCorpus): Adapters {
  const supabase =
    config.supabase.url && config.supabase.serviceRoleKey
      ? new SupabaseBackend({
          url: config.supabase.url,
          serviceRoleKey: config.supabase.serviceRoleKey,
          ...(config.supabase.anonKey ? { anonKey: config.supabase.anonKey } : {}),
        })
      : undefined;

  const model = config.anthropic.apiKey
    ? new ClaudeModel({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        effort: config.anthropic.effort,
        timeoutMs: config.anthropic.timeoutMs,
        ...(config.anthropic.workspaceId ? { workspaceId: config.anthropic.workspaceId } : {}),
      })
    : undefined;

  const memory = config.backboard.apiKey
    ? new BackboardMemory({
        apiKey: config.backboard.apiKey,
        baseUrl: config.backboard.baseUrl,
        ...(config.backboard.assistantId ? { assistantId: config.backboard.assistantId, pinnedUserId: config.demoUserId } : {}),
        ...(config.backboard.llmProvider ? { llmProvider: config.backboard.llmProvider } : {}),
        ...(config.backboard.modelName ? { modelName: config.backboard.modelName } : {}),
        ...(supabase
          ? {
              lookupAssistant: (userId: string) => supabase.getIntegrationId(userId, "backboard_assistant"),
              saveAssistant: (userId: string, id: string) => supabase.setIntegrationId(userId, "backboard_assistant", id),
            }
          : {}),
      })
    : undefined;

  const semantic = config.mongo.uri
    ? new MongoSemanticStore({
        uri: config.mongo.uri,
        db: config.mongo.db,
        vectorIndex: config.mongo.vectorIndex,
        searchIndex: config.mongo.searchIndex,
        ...(config.voyage.apiKey ? { voyage: { apiKey: config.voyage.apiKey, model: config.voyage.model } } : {}),
      })
    : undefined;

  const local = config.dataDir ? new FileDocStore(config.dataDir) : new MemoryDocStore();
  const store: DocStore = semantic ? new ResilientDocStore(local, new MongoDocStore(() => semantic.db())) : local;

  const temporal = new ResilientTemporalStore(
    // With Tiger, local is a cache that covers outages; without it, local is the (durable) record.
    new LocalTemporalStore(config.tiger.url ? undefined : store),
    config.tiger.url ? new TigerTemporalStore(config.tiger.url, { tlsInsecure: config.tiger.tlsInsecure }) : undefined,
  );

  const voice =
    config.elevenlabs.apiKey && config.elevenlabs.agentId
      ? new ElevenLabsVoice({ apiKey: config.elevenlabs.apiKey, agentId: config.elevenlabs.agentId })
      : undefined;

  markConfigured("claude", !!model);
  markConfigured("backboard", !!memory);
  markConfigured("mongo", !!semantic);
  markConfigured("tiger", !!config.tiger.url);
  markConfigured("elevenlabs", !!voice);
  markConfigured("supabase", !!supabase);

  return {
    model,
    fallbackModel: new DeterministicModel({ diagrams: seed.diagrams, visualizations: seed.visualizations, memoryAids: seed.memoryAids }),
    memory,
    localMemory: new LocalMemory(seed.memories, [config.demoUserId]),
    semantic,
    localSemantic: new LocalSemanticStore(seed),
    temporal,
    voice,
    transcriptVoice: new TranscriptVoice(),
    supabase,
    store,
  };
}
