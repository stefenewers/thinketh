/**
 * Live check of Grokbot: a real agent exchange (Muse) saves a takeaway, then a real challenge runs
 * (Grokbot on xAI, the defending agent on Muse, grounding checks on Claude when configured).
 *
 *   npm run verify:grokbot --workspace @thinketh/intelligence            # the exchange's own takeaway
 *   npm run verify:grokbot --workspace @thinketh/intelligence -- overbroad  # plus a deliberately overbroad fixture
 *
 * Isolated: a temporary data dir, with MongoDB, Tiger, Backboard and Supabase switched off, so no
 * durable store is touched. Prints the execution trace, the model xAI reported, latency and outcome.
 * Never prints credentials.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { loadConfig } from "../src/config.ts";
import { createThinketh } from "../src/index.ts";
import { listXaiModels } from "../src/playground/exchange/grok.ts";
import { APP_KEY_HEADER } from "../src/api/protect.ts";

process.env.THINKETH_LOG_LEVEL ??= "warn";
const base = loadConfig();
if (!base.xai.apiKey || !base.xai.model) throw new Error("Set XAI_API_KEY and XAI_MODEL in .env first.");
if (!base.muse.apiKey || !base.muse.model) throw new Error("The defending agent needs Muse (MUSE_API_KEY, MUSE_MODEL).");

const models = await listXaiModels({ apiKey: base.xai.apiKey, baseUrl: base.xai.baseUrl });
console.log(`xAI /v1/models: ${models.includes(base.xai.model) ? "lists" : "DOES NOT list"} XAI_MODEL=${base.xai.model}`);
if (!models.includes(base.xai.model)) process.exit(1);

const config = {
  ...base,
  dataDir: mkdtempSync(join(tmpdir(), "thinketh-grokbot-live-")),
  mongo: { ...base.mongo, uri: undefined },
  tiger: { url: undefined, tlsInsecure: false },
  backboard: { ...base.backboard, apiKey: undefined },
  supabase: { url: undefined, anonKey: undefined, serviceRoleKey: undefined },
  identity: { ...base.identity, demoIdentities: true },
  discovery: { ...base.discovery, everyMinutes: 0 },
};
const t = createThinketh({ config });
console.log(`grounding checks: ${config.anthropic.apiKey ? "Claude (live)" : "deterministic"}; agents: Muse (${config.muse.model}); challenger: ${config.xai.model}\n`);

const req = async (method: string, path: string, body?: unknown, user = "demo-user") => {
  const res = await t.app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": user, ...(process.env.THINKETH_APP_KEY ? { [APP_KEY_HEADER]: process.env.THINKETH_APP_KEY } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json()) as PlaygroundRoom & { error?: { message: string } };
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error?.message ?? ""}`);
  return json;
};

async function savedTakeaway(): Promise<PlaygroundRoom> {
  let r = await req("POST", "/playground/rooms", { displayName: "Stefen" });
  r = await req("POST", `/playground/rooms/${r.id}/demo-guest`);
  r = await req("POST", `/playground/rooms/${r.id}/compare`);
  r = await req("POST", `/playground/rooms/${r.id}/exchange`, {});
  const t0 = Date.now();
  for (let i = 0; i < 40 && r.exchange?.status === "running"; i++) r = await req("POST", `/playground/rooms/${r.id}/exchange/advance`, { step: r.exchange.step });
  console.log(`exchange (${r.exchange?.conceptName}): ${r.exchange?.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!r.exchange?.savedTakeawayId) throw new Error(`No takeaway saved: ${r.exchange?.outcome}`);
  return r;
}

/** `--dump <file>`: the real rooms and takeaways at each beat (fixtures for the mobile tests and previews). */
const dumpAt = process.argv.indexOf("--dump");
const dump: Record<string, unknown> = {};

async function challenge(label: string, room: PlaygroundRoom, key: string): Promise<void> {
  const tk = await t.playground.takeaway(room.exchange!.learnerId, room.exchange!.savedTakeawayId!);
  console.log(`\n=== ${label} ===\ntakeaway v${tk.version ?? 1}: ${tk.text}\n  cites: ${tk.sources.map((s) => s.ref).join(", ")}`);
  const t0 = Date.now();
  let r = await req("POST", `/playground/rooms/${room.id}/challenge`, {});
  dump[`${key}_started`] = r;
  for (let i = 0; i < 20 && r.challenge?.status === "running"; i++) {
    const phase = r.challenge.phase;
    if (phase === "defending") dump[`${key}_challenged`] = r;
    const s0 = Date.now();
    r = await req("POST", `/playground/rooms/${room.id}/challenge/advance`, { step: r.challenge.step });
    console.log(`  step ${i}: ${phase.padEnd(10)} ${String(Date.now() - s0).padStart(6)}ms → ${r.challenge!.status}/${r.challenge!.phase}`);
  }
  const ch = r.challenge!;
  console.log(`\nstatus: ${ch.status}${ch.note ? ` (${ch.note})` : ""}`);
  console.log(`model: configured ${ch.challenger.configuredModel}, xAI reported ${ch.challenger.model ?? "(no live call returned)"}`);
  console.log(`grok calls: ${ch.used.grokCalls} (${ch.used.grokMs}ms total); agent calls: ${ch.used.agentCalls}; tool calls: ${ch.used.toolCalls}; repairs: ${ch.used.repairs}; wall: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (ch.finding) console.log(`finding: ${ch.finding.kind} [${ch.finding.sourceRefs.join(", ")}]\n  say: ${ch.finding.say}\n  detail: ${ch.finding.detail}`);
  for (const m of ch.messages) console.log(`  ${m.from === "grokbot" ? "Grokbot" : `${m.from}'s agent`} (${m.kind}) [${m.sourceRefs.join(", ")}]: ${m.text}`);
  for (const c of ch.checks) console.log(`  check ${c.of}: ${c.verdict} by ${c.checkedBy} against [${c.refs.join(", ")}]${c.unsupported.length ? ` unsupported: ${JSON.stringify(c.unsupported)}` : ""}`);
  if (ch.assessment) console.log(`  Grokbot assessment: ${ch.assessment.stance}: ${ch.assessment.text}`);
  if (ch.outcome) console.log(`OUTCOME: ${ch.outcome.headline}: ${ch.outcome.why}${ch.outcome.revisedText ? `\n  v${ch.outcome.toVersion}: ${ch.outcome.revisedText}` : ""}${ch.outcome.declinedRevision ? `\n  declined revision: ${ch.outcome.declinedRevision.text} (${ch.outcome.declinedRevision.reason})` : ""}`);
  const after = await t.playground.takeaway(room.exchange!.learnerId, tk.id);
  dump[`${key}_done`] = r;
  dump[`${key}_takeaway`] = after;
  console.log(`library entry: v${after.version ?? 1}, ${after.history?.length ?? 1} version(s), ${after.challenges?.length ?? 0} challenge(s) recorded`);
}

const knowledgeBefore = JSON.stringify((await t.service.knowledge("demo-user")).items.map((i) => i.state));
const room = await savedTakeaway();
dump.exchange_done = room;
await challenge("Live challenge: the exchange's own takeaway", room, "own");

if (process.argv.includes("overbroad")) {
  // A deliberately overbroad fixture (labeled as such): the same sourced takeaway, with a universal claim added.
  const room2 = await savedTakeaway();
  const tk = await t.playground.takeaway(room2.exchange!.learnerId, room2.exchange!.savedTakeawayId!);
  await t.adapters.store.put("agent_takeaways", tk.id, { ...tk, text: `${tk.text.replace(/\.$/, "")}, in every setting and for every kind of task, without exception.` }, tk.ownerId);
  const r2 = await req("GET", `/playground/rooms/${room2.id}`);
  await challenge("Live challenge: overbroad FIXTURE (text edited to add a universal claim)", r2, "overbroad");
}

const knowledgeAfter = JSON.stringify((await t.service.knowledge("demo-user")).items.map((i) => i.state));
console.log(`\nhuman knowledge state unchanged: ${knowledgeBefore === knowledgeAfter}`);
if (dumpAt > 0) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.argv[dumpAt + 1]!, JSON.stringify(dump, null, 1));
  console.log(`dumped ${Object.keys(dump).length} snapshots to ${process.argv[dumpAt + 1]}`);
}
process.exit(0);
