/**
 * Print Backboard evidence for the sponsor submission / screenshots:
 * the persona assistant's stored memories, a semantic memory search (what
 * Thinketh's /ask recalls), and recall from a brand-new thread.
 *
 *   npm run evidence:backboard --workspace @thinketh/intelligence
 */
import { loadConfig } from "../src/config.ts";

const config = loadConfig();
const { apiKey, baseUrl, assistantId } = config.backboard;
if (!apiKey || !assistantId) {
  console.error("BACKBOARD_API_KEY and BACKBOARD_ASSISTANT_ID must be set (run npm run setup:backboard).");
  process.exit(1);
}
const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<Record<string, unknown>>;
};

console.log(`Assistant ${assistantId} (one stable assistant for the demo persona)\n`);

const list = (await call(`/assistants/${assistantId}/memories?page_size=100`)) as { memories?: Array<{ content: string; metadata?: { kind?: string } }> };
console.log(`Stored memories (${list.memories?.length ?? 0})`);
for (const m of list.memories ?? []) console.log(`  [${m.metadata?.kind ?? "?"}] ${m.content}`);

const query = "How should explanations about agent memory be framed for this learner?";
const search = (await call(`/assistants/${assistantId}/memories/search`, { method: "POST", body: JSON.stringify({ query, limit: 5 }) })) as {
  memories?: Array<{ content: string; score?: number }>;
};
console.log(`\nMemory search: "${query}"`);
for (const m of search.memories ?? []) console.log(`  ${m.score?.toFixed?.(2) ?? "-"}  ${m.content}`);

const thread = (await call(`/assistants/${assistantId}/threads`, { method: "POST", body: "{}" })) as { thread_id: string };
const question = "In two short sentences: how do I prefer things explained, and what have I confused before?";
const reply = (await call(`/threads/${thread.thread_id}/messages`, {
  method: "POST",
  body: JSON.stringify({ content: question, memory: "Readonly", stream: false }),
})) as { content?: string; retrieved_memories?: unknown[] };
console.log(`\nNew thread ${thread.thread_id} (no prior messages), memory: Readonly`);
console.log(`  Q: ${question}`);
console.log(`  A: ${reply.content}`);
console.log(`  retrieved_memories: ${Array.isArray(reply.retrieved_memories) ? reply.retrieved_memories.length : "n/a"}`);
