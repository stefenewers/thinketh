/**
 * One-time Backboard setup for the demo persona (idempotent):
 *  1. create one stable assistant (or reuse BACKBOARD_ASSISTANT_ID) and pin its id in .env,
 *     so memory persists across threads and server restarts
 *  2. seed the persona's learning memories (skipping any already stored)
 *
 *   npm run setup:backboard --workspace @thinketh/intelligence
 */
import { readFile, writeFile } from "node:fs/promises";
import { BackboardMemory } from "../src/adapters/memory.ts";
import { loadConfig } from "../src/config.ts";
import { buildSeed } from "../src/seed/corpus.ts";

const ENV_PATH = new URL("../../../.env", import.meta.url);
const config = loadConfig();
if (!config.backboard.apiKey) {
  console.error("BACKBOARD_API_KEY is not set.");
  process.exit(1);
}

let assistantId = config.backboard.assistantId;
if (!assistantId) {
  const creator = new BackboardMemory({ apiKey: config.backboard.apiKey, baseUrl: config.backboard.baseUrl });
  assistantId = await creator.assistantFor(config.demoUserId);
  const env = await readFile(ENV_PATH, "utf8");
  const line = `BACKBOARD_ASSISTANT_ID=${assistantId}`;
  const next = /^#?\s*BACKBOARD_ASSISTANT_ID=.*$/m.test(env)
    ? env.replace(/^#?\s*BACKBOARD_ASSISTANT_ID=.*$/m, line)
    : env.replace(/^(BACKBOARD_API_KEY=.*)$/m, `$1\n${line}`);
  await writeFile(ENV_PATH, next);
  console.log(`Created assistant ${assistantId} and pinned it in .env`);
} else {
  console.log(`Using pinned assistant ${assistantId}`);
}

const memory = new BackboardMemory({ apiKey: config.backboard.apiKey, baseUrl: config.backboard.baseUrl, assistantId });
const res = await fetch(`${config.backboard.baseUrl}/assistants/${assistantId}/memories?page_size=100`, {
  headers: { "X-API-Key": config.backboard.apiKey },
});
if (!res.ok) throw new Error(`list memories failed: HTTP ${res.status}`);
const existing = new Set(((await res.json()) as { memories?: Array<{ content: string }> }).memories?.map((m) => m.content) ?? []);

const seeds = buildSeed().memories;
let added = 0;
for (const item of seeds) {
  if (existing.has(item.content)) continue;
  await memory.remember(config.demoUserId, item);
  added++;
}
console.log(`Memories: ${added} added, ${seeds.length - added} already present.`);
