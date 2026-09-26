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
     * Muse conducts Playground rooms (server-side only). Without a key, or if a
     * call fails or proposes an invalid action, the deterministic conductor runs.
     */
    muse: {
      apiKey: env("MUSE_API_KEY"),
      baseUrl: (env("MUSE_API_BASE") ?? "https://api.llama.com/compat/v1").replace(/\/+$/, ""),
      model: env("MUSE_MODEL"),
      timeoutMs: Number(env("MUSE_TIMEOUT_MS") ?? 8000),
    },
    port: Number(env("PORT") ?? 8787),
  };
}
