/**
 * Proves Thinketh's Backboard memory persists across separate threads.
 *
 *   npm run verify:backboard --workspace @thinketh/intelligence            # uses BACKBOARD_ASSISTANT_ID
 *   npm run verify:backboard --workspace @thinketh/intelligence -- --fresh # new assistant, blank memory
 *
 * Thread A (memory "Auto") states a preference and a past misconception.
 * Thread B is a brand-new thread on the same assistant (memory "Readonly");
 * its retrieved memories must contain both. Then the real Thinketh `/ask`
 * route must return them in `memoryUsed` with source "backboard", and
 * `/health` must report Backboard as live. Exits 1 if any check fails.
 */
import { BackboardMemory } from "../src/adapters/memory.ts";
import { loadConfig } from "../src/config.ts";
import { createThinketh } from "../src/index.ts";

const THREAD_A = [
  "I prefer systems analogies when learning technical concepts.",
  "I previously confused persistent agent memory with a longer context window.",
];
const THREAD_B = "Can you explain persistent agent memory to me?";
const PREFERENCE = /analog/i;
const MISCONCEPTION = /context window/i;

const config = loadConfig();
const { apiKey, baseUrl, llmProvider, modelName } = config.backboard;
if (!apiKey) {
  console.error("BACKBOARD_API_KEY is not set (put it in the repo-root .env).");
  process.exit(1);
}
const bb = new BackboardMemory({
  apiKey,
  baseUrl,
  ...(llmProvider ? { llmProvider } : {}),
  ...(modelName ? { modelName } : {}),
});

let failed = false;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
};
const show = (label: string, value: unknown) => console.log(`  ${label}: ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);

// ---------------------------------------------------------------------------
const fresh = process.argv.includes("--fresh") || !config.backboard.assistantId;
const assistantId = fresh ? await bb.createAssistant(`thinketh-verify-${new Date().toISOString()}`) : config.backboard.assistantId!;
console.log(`\nAssistant ${assistantId} (${fresh ? "created now, empty memory" : "BACKBOARD_ASSISTANT_ID"})`);
if (!config.backboard.assistantId) console.log(`  To pin it for the app, add to .env:  BACKBOARD_ASSISTANT_ID=${assistantId}`);
const before = await bb.searchMemories(assistantId, "context window misconception and analogy preference", 10);
show("memories matching before thread A", before.length);

// ---------------------------------------------------------------------------
console.log("\nThread A  (memory: Auto)");
const threadA = await bb.createThread(assistantId);
show("thread", threadA);
for (const text of THREAD_A) {
  const r = await bb.sendMessage(threadA, text, "Auto");
  show("user", text);
  show("assistant", r.content.slice(0, 200));
  if (r.memoryOperationId) show("memory write", `${r.memoryOperationId} -> ${await bb.waitForMemoryOperation(r.memoryOperationId)}`);
}
const stored = await bb.searchMemories(assistantId, "learning preferences and misconceptions", 10);
show("assistant memories now", stored.map((m) => m.content));
check(stored.some((m) => PREFERENCE.test(m.content)), "Backboard stored the systems-analogy preference");
check(stored.some((m) => MISCONCEPTION.test(m.content)), "Backboard stored the context-window misconception");

// ---------------------------------------------------------------------------
console.log("\nThread B  (new thread, same assistant, memory: Readonly)");
const threadB = await bb.createThread(assistantId);
show("thread", threadB);
check(threadB !== threadA, "thread B is a different thread from thread A");
const b = await bb.sendMessage(threadB, THREAD_B, "Readonly");
show("user", THREAD_B);
show("retrieved_memories", b.retrievedMemories);
show("assistant", b.content);
check(b.retrievedMemories.some((m) => PREFERENCE.test(m.memory)), "thread B recalled the preference from thread A");
check(b.retrievedMemories.some((m) => MISCONCEPTION.test(m.memory)), "thread B recalled the misconception from thread A");
console.log(`  info  reply uses an analogy: ${PREFERENCE.test(b.content) || /like a|think of/i.test(b.content) ? "yes" : "not detected"}; mentions context window: ${MISCONCEPTION.test(b.content) ? "yes" : "no"}`);

// ---------------------------------------------------------------------------
console.log("\nThinketh POST /ask  (same assistant, through the real app and adapters)");
const { app } = createThinketh({ config: { ...config, backboard: { ...config.backboard, assistantId } } });
const res = await app.request("/ask", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "How does agent memory persist across sessions?" }),
});
const ask = (await res.json()) as { memoryUsed: { kind: string; content: string; source?: string }[] };
show("memoryUsed", ask.memoryUsed);
check(ask.memoryUsed.length > 0 && ask.memoryUsed.every((m) => m.source === "backboard"), "memoryUsed comes from Backboard");
check(ask.memoryUsed.some((m) => PREFERENCE.test(m.content)) && ask.memoryUsed.some((m) => MISCONCEPTION.test(m.content)), "memoryUsed contains the preference and misconception");

const health = (await (await app.request("/health?probe=1")).json()) as { adapters: Record<string, { status: string; lastError?: string }> };
show("/health backboard", health.adapters.backboard);
check(health.adapters.backboard?.status === "live", "/health reports Backboard live");

console.log(failed ? "\nBackboard verification FAILED\n" : "\nBackboard verification passed: memory persisted across threads\n");
process.exit(failed ? 1 : 0);
