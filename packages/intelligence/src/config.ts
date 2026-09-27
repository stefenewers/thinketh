/**
 * Environment access that works in Node and Deno (Supabase Edge Functions).
 * Every sponsor integration is optional: a missing key selects the local
 * deterministic fallback for that adapter.
 */
declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

export function env(key: string): string | undefined {
  const fromNode = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (fromNode !== undefined && fromNode !== "") return fromNode;
  if (typeof Deno !== "undefined") {
    const v = Deno.env.get(key);
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

const flag = (key: string, fallback: boolean): boolean => {
  const v = env(key);
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
};

export type ThinkethConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    demoUserId: env("THINKETH_DEMO_USER_ID") ?? "demo-user",
    /** Time zone for the brief's calendar date (HackGT is in Atlanta). */
    timeZone: env("THINKETH_TZ") ?? "America/New_York",
    allowReset: flag("THINKETH_ALLOW_RESET", true),
    /**
     * Durable app state on this host (resources, rooms, profiles, discovery runs), mirrored to
     * MongoDB Atlas when MONGODB_URI is set. "off" keeps it in memory (tests).
     */
    dataDir: env("THINKETH_DATA_DIR") === "off" ? undefined : (env("THINKETH_DATA_DIR") ?? ".thinketh-data"),
    identity: {
      /**
       * Seeded demo personas (demo-user, nadani) may be selected with the x-thinketh-user-id header
       * and are used when a request carries no identity. Off: every request needs a verified session.
       */
      demoIdentities: flag("THINKETH_DEMO_IDENTITIES", true),
      /**
       * DEVELOPMENT ONLY: accept any x-thinketh-user-id as the identity. Never enable on a shared
       * server: a header is not proof of who someone is.
       */
      trustUserHeader: flag("THINKETH_TRUST_USER_HEADER", false),
      /**
       * Rehearsal clones of the demo persona (e.g. "audit-" for scripts/demo-audit): ids with this
       * prefix get the demo persona's seeded Mind with their own isolated, resettable history.
       * Unset by default.
       */
      demoAliasPrefix: env("THINKETH_DEMO_ALIAS_PREFIX"),
    },
    discovery: {
      /** In-process scheduler; 0 = off (run `npm run discover` or POST /admin/discovery/run). */
      everyMinutes: Number(env("THINKETH_DISCOVERY_EVERY_MINUTES") ?? 0),
      maxItemsPerSource: Number(env("THINKETH_DISCOVERY_ITEMS_PER_SOURCE") ?? 8),
      /** Claude normalizations per run: the cost bound. */
      maxDevelopments: Number(env("THINKETH_DISCOVERY_MAX_DEVELOPMENTS") ?? 4),
      /** Items published before this are filtered as outdated. */
      maxAgeDays: Number(env("THINKETH_DISCOVERY_MAX_AGE_DAYS") ?? 21),
      /** Whole-run wall-clock budget. */
      budgetMs: Number(env("THINKETH_DISCOVERY_BUDGET_MS") ?? 180_000),
    },
    /** Claude phrasing of deterministic delta output. Off => deterministic text only. */
    claudeDeltaPhrasing: flag("THINKETH_CLAUDE_DELTA", true),
    anthropic: {
      apiKey: env("ANTHROPIC_API_KEY"),
      /** Required when the key isn't scoped to a workspace (sent as anthropic-workspace-id). */
      workspaceId: env("ANTHROPIC_WORKSPACE_ID"),
      model: env("THINKETH_CLAUDE_MODEL") ?? "claude-opus-5",
      // Measured live: "low" keeps Ask/Visualize/Make it stick at ~4-8s (medium: Visualize >12s).
      effort: (env("THINKETH_CLAUDE_EFFORT") ?? "low") as "low" | "medium" | "high",
      timeoutMs: Number(env("THINKETH_CLAUDE_TIMEOUT_MS") ?? 20000),
      /** Cap for Claude calls a request waits on; the mobile client gives generative calls 15s. */
      requestTimeoutMs: Number(env("THINKETH_CLAUDE_REQUEST_TIMEOUT_MS") ?? 12000),
    },
    backboard: {
      apiKey: env("BACKBOARD_API_KEY"),
      baseUrl: env("BACKBOARD_BASE_URL") ?? "https://app.backboard.io/api",
      /** Optional: reuse one assistant for the demo persona so memory persists across threads. */
      assistantId: env("BACKBOARD_ASSISTANT_ID"),
      /** Optional model for thread messages; Backboard's default when unset. */
      llmProvider: env("BACKBOARD_LLM_PROVIDER"),
      modelName: env("BACKBOARD_MODEL"),
    },
    mongo: {
      uri: env("MONGODB_URI"),
      db: env("MONGODB_DB") ?? "thinketh",
      vectorIndex: env("MONGODB_VECTOR_INDEX") ?? "developments_vector",
      searchIndex: env("MONGODB_SEARCH_INDEX") ?? "corpus_text",
    },
    voyage: {
      apiKey: env("VOYAGE_API_KEY"),
      model: env("VOYAGE_MODEL") ?? "voyage-3.5",
    },
    /**
     * Reader service for script-rendered pages the direct reader can't see (only the URL is sent).
     * Set THINKETH_READER_FALLBACK=off to disable, or to another base URL.
     */
    readerFallback: env("THINKETH_READER_FALLBACK") === "off" ? null : (env("THINKETH_READER_FALLBACK") ?? "https://r.jina.ai/"),
    tiger: {
      url: env("TIGER_DATABASE_URL"),
      /**
       * HACKGT DEMO ONLY: Deno rejects Tiger managed certificate chain; remove this bypass after the event.
       * Off unless explicitly "true"/"1". Affects the Tiger connection only; it stays encrypted.
       */
      tlsInsecure: flag("TIGER_TLS_INSECURE", false),
    },
    supabase: {
      url: env("SUPABASE_URL")?.replace(/\/+$/, ""),
      anonKey: env("SUPABASE_ANON_KEY"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    },
    elevenlabs: {
      apiKey: env("ELEVENLABS_API_KEY"),
      agentId: env("ELEVENLABS_AGENT_ID"),
    },
    /**
     * Muse runs the Playground's agent exchange (server-side only). Without a key and a
     * model there is no agent exchange; the room still compares both Minds.
     */
    muse: {
      apiKey: env("MUSE_API_KEY"),
      baseUrl: (env("MUSE_API_BASE") ?? "https://api.llama.com/compat/v1").replace(/\/+$/, ""),
      model: env("MUSE_MODEL"),
      timeoutMs: Number(env("MUSE_TIMEOUT_MS") ?? 8000),
    },
    /**
     * Agent exchange (Playground): two participants' agents on Muse. Conservative bounds; the
     * exchange stops early when a grounded takeaway is saved.
     */
    exchange: {
      /** Agent messages (explanations, questions, answers, takeaways), not counting tool results. */
      maxMessages: Number(env("THINKETH_EXCHANGE_MAX_MESSAGES") ?? 6),
      maxToolCalls: Number(env("THINKETH_EXCHANGE_MAX_TOOL_CALLS") ?? 12),
      deadlineMs: Number(env("THINKETH_EXCHANGE_DEADLINE_MS") ?? 300_000),
      /** One Muse call; a turn may take up to three (retrieve, then speak). */
      callTimeoutMs: Number(env("THINKETH_EXCHANGE_CALL_TIMEOUT_MS") ?? 25_000),
    },
    /**
     * Grokbot (optional visiting challenger, xAI Responses API). Enabled only when both the key and
     * the model are set: no default model id is assumed. Server-side only.
     */
    xai: {
      apiKey: env("XAI_API_KEY"),
      model: env("XAI_MODEL"),
      baseUrl: (env("XAI_API_BASE") ?? "https://api.x.ai/v1").replace(/\/+$/, ""),
      /** Only sent when set; supported values depend on the model. */
      reasoningEffort: env("XAI_REASONING_EFFORT"),
    },
    challenge: {
      deadlineMs: Number(env("THINKETH_CHALLENGE_DEADLINE_MS") ?? 240_000),
      /** One model call (Grokbot or the defending agent); a turn may take a few. */
      callTimeoutMs: Number(env("THINKETH_CHALLENGE_CALL_TIMEOUT_MS") ?? 45_000),
      maxToolCalls: Number(env("THINKETH_CHALLENGE_MAX_TOOL_CALLS") ?? 18),
    },
    port: Number(env("PORT") ?? 8787),
  };
}
