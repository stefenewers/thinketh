import type { Development, KnowledgeStateTransition } from "../src/contracts.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adapterHealth, AdapterTimeoutError, guarded, withTimeout } from "../src/adapters/guard.ts";
import { BackboardMemory } from "../src/adapters/memory.ts";
import { buildAdapters } from "../src/adapters/registry.ts";
import { LocalTemporalStore, ResilientTemporalStore, type TigerTemporalStore } from "../src/adapters/temporal.ts";
import type { IntelligenceModel, SemanticStore } from "../src/adapters/types.ts";
import { ElevenLabsVoice } from "../src/adapters/voice.ts";
import { buildSeed, FLAGSHIP_DEVELOPMENT_ID } from "../src/seed/corpus.ts";
import { ThinkethService } from "../src/service.ts";
import { NOW, offlineConfig } from "./helpers.ts";

afterEach(() => vi.unstubAllGlobals());

const boom = () => Promise.reject(new Error("sponsor down"));
const never = () => new Promise<never>(() => {});

describe("guarded", () => {
  it("returns the live value when the sponsor succeeds", async () => {
    expect(await guarded("claude", "t", async () => 1, () => 2, 100)).toEqual({ value: 1, source: "live" });
  });

  it("falls back on error and records it", async () => {
    const r = await guarded("mongo", "t", boom, () => "local", 100);
    expect(r).toEqual({ value: "local", source: "fallback" });
    expect(adapterHealth().mongo?.lastError).toMatch(/sponsor down/);
  });

  it("falls back on timeout", async () => {
    const r = await guarded("tiger", "t", never, () => "local", 20);
    expect(r.source).toBe("fallback");
    await expect(withTimeout(never(), 10, "x")).rejects.toBeInstanceOf(AdapterTimeoutError);
  });

  it("goes straight to the fallback when the adapter isn't configured", async () => {
    expect(await guarded("elevenlabs", "t", undefined, () => "local", 10)).toEqual({ value: "local", source: "fallback" });
  });
});

/** A service whose every sponsor adapter is configured but failing. */
function serviceWithBrokenSponsors() {
  const seed = buildSeed(NOW);
  const config = offlineConfig();
  const adapters = buildAdapters(config, seed);
  const failing = new Proxy({}, { get: (_t, prop) => (prop === "name" ? "claude" : boom) }) as IntelligenceModel;
  const failingSemantic = { name: "mongo", upsertDevelopment: boom, getDevelopment: boom, search: boom } as unknown as SemanticStore;
  const failingTiger = new Proxy({}, { get: () => boom }) as unknown as TigerTemporalStore;
  adapters.model = failing;
  adapters.semantic = failingSemantic;
  adapters.memory = { name: "backboard", recall: boom, remember: boom };
  adapters.voice = { name: "elevenlabs", createSession: boom };
  (adapters as { temporal: ResilientTemporalStore }).temporal = new ResilientTemporalStore(new LocalTemporalStore(), failingTiger, 50);
  return new ThinkethService({ ...config, claudeDeltaPhrasing: true }, seed, adapters, () => NOW);
}

describe("adapter fallbacks keep the golden loop alive", () => {
  it("runs brief -> development -> diagnostic -> transition -> history with every sponsor failing", async () => {
    const service = serviceWithBrokenSponsors();
    const { brief } = await service.brief("demo-user");
    expect(brief.heroDevelopmentId).toBe(FLAGSHIP_DEVELOPMENT_ID);

    const detail = await service.development("demo-user", FLAGSHIP_DEVELOPMENT_ID);
    expect(detail.deltaSource).toBe("deterministic");
    expect(detail.delta.whatChanged.length).toBeGreaterThan(0);

    const { question } = await service.selectDiagnostic("demo-user", { developmentId: FLAGSHIP_DEVELOPMENT_ID });
    const { transition } = await service.answerDiagnostic("demo-user", question.id, "1");
    expect(transition.after.mastery).toBeGreaterThan(transition.before.mastery);

    const history = await service.conceptHistory("demo-user", "agent-memory");
    expect(history.transitions.at(-1)!.id).toBe(transition.id);
  });

  it("Ask, Visualize, Make It Stick and Voice degrade to deterministic output", async () => {
    const service = serviceWithBrokenSponsors();
    const ask = await service.ask("demo-user", { question: "How does agent memory persist across sessions?" });
    expect(ask.sourcesSay.length).toBeGreaterThan(0);
    expect(ask.thinkethInfers.length).toBeGreaterThan(0); // deterministic inference stood in for Claude
    expect(ask.memoryUsed?.length).toBeGreaterThan(0); // local memory stood in for Backboard
    expect((await service.visualize("demo-user", { conceptId: "mcp" })).nodes.length).toBeGreaterThan(0);
    expect((await service.makeItStick("demo-user", { conceptId: "mcp" })).threeStepModel).toHaveLength(3);
    const voice = await service.voiceSession("demo-user");
    expect(voice.mode).toBe("transcript_fallback");
    expect(voice.conversationToken).toBeNull();
    expect(voice.fallbackScript.length).toBeGreaterThan(2);
  });
});

describe("resilient temporal store", () => {
  const t = (id: string, createdAt: string): KnowledgeStateTransition =>
    ({ id, userId: "u", conceptId: "c", createdAt, after: { conceptId: "c", lastObservedAt: createdAt } }) as unknown as KnowledgeStateTransition;

  it("keeps writes locally when Tiger fails and merges reads from both", async () => {
    const local = new LocalTemporalStore();
    const remote = {
      appendTransition: boom,
      getConceptHistory: async () => [t("remote-1", "2026-09-01T00:00:00Z")],
      getLatestStates: async () => [],
      getRecentTransitions: async () => [],
    } as unknown as TigerTemporalStore;
    const store = new ResilientTemporalStore(local, remote, 50);
    await store.appendTransition(t("local-1", "2026-09-02T00:00:00Z"));
    const history = await store.getConceptHistory("u", "c");
    expect(history.map((x) => x.id)).toEqual(["remote-1", "local-1"]);
  });
});

describe("sponsor adapters call the documented endpoints", () => {
  it("Backboard: searches assistant memories with X-API-Key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ memories: [{ id: "m1", content: "Prefers analogies", metadata: { kind: "preference" }, created_at: "2026-09-01T00:00:00Z" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const memory = new BackboardMemory({ apiKey: "k", baseUrl: "https://app.backboard.io/api", assistantId: "asst-1" });
    const items = await memory.recall("u", "memory");
    expect(items).toEqual([{ id: "m1", kind: "preference", content: "Prefers analogies", createdAt: "2026-09-01T00:00:00Z" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.backboard.io/api/assistants/asst-1/memories/search");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("k");
  });

  it("ElevenLabs: exchanges the server key for a conversation token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: "tok", conversation_id: "c1" }));
    vi.stubGlobal("fetch", fetchMock);
    const voice = new ElevenLabsVoice({ apiKey: "xi", agentId: "agent-1" });
    const session = await voice.createSession({ userId: "u", displayName: "Jordan", script: ["hi"], briefDate: "2026-09-26", minutes: 11 });
    expect(session).toMatchObject({ mode: "elevenlabs", conversationToken: "tok", agentId: "agent-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/convai\/conversation\/token\?agent_id=agent-1/);
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
    expect(JSON.stringify(session)).not.toContain("xi"); // the privileged key never leaves the server
  });

  it("Mongo getDevelopment failure falls back to the seeded corpus", async () => {
    const service = serviceWithBrokenSponsors();
    const detail = await service.development("demo-user", FLAGSHIP_DEVELOPMENT_ID);
    expect((detail.development as Development).title).toMatch(/Persistent agent memory/);
  });
});
