// Configures the hosted ElevenLabs agent for Thinketh's persistent voice companion: the client
// tools the app handles (from packages/contracts/src/agent.ts, the same list the app registers),
// the general-assistant prompt (./prompt.md), the opening-line override, and the client events
// the app needs. The voice and every TTS setting are left exactly as they are, and verified after.
//
//   node --env-file=.env scripts/voice-agent/configure.ts            # dry run: prints the plan
//   node --env-file=.env scripts/voice-agent/configure.ts --apply    # backs up, applies, verifies
//   node --env-file=.env scripts/voice-agent/configure.ts --restore scripts/voice-agent/.backups/<file>.json
//
// Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID. Backups hold the agent's full config (no keys)
// and are git-ignored.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_TOOLS, type AgentToolSpec } from "../../packages/contracts/src/agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "https://api.elevenlabs.io/v1/convai";
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT = process.env.ELEVENLABS_AGENT_ID;
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESTORE = args.includes("--restore") ? args[args.indexOf("--restore") + 1] : undefined;

/** Session variables the app sends; placeholders let the dashboard's test call run. */
const PLACEHOLDERS = {
  user_name: "Stefen",
  brief_date: "2026-09-26",
  brief_minutes: 6,
  brief_script: "First: Persistent agent memory. What changed is...",
  activity: "assist",
  opening_line: "I'm here. What would you like to look at?",
};
const CLIENT_EVENTS = ["client_tool_call"];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function el(method: string, path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 600)}`);
  return text ? (JSON.parse(text) as Json) : {};
}

function toolConfig(t: AgentToolSpec): Json {
  const properties = Object.fromEntries(
    Object.entries(t.params).map(([k, p]) => [k, { type: p.type, description: p.description, ...(p.enum ? { enum: [...p.enum] } : {}) }]),
  );
  const required = Object.entries(t.params)
    .filter(([, p]) => p.required)
    .map(([k]) => k);
  return {
    type: "client",
    name: t.name,
    description: t.description,
    parameters: { type: "object", properties, required },
    // The app answers every call with a structured result the agent must read before speaking.
    expects_response: true,
    response_timeout_secs: 20,
  };
}

async function listClientTools(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await el("GET", `/tools?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    for (const t of page.tools ?? []) if (t.tool_config?.type === "client") byName.set(t.tool_config.name, t.id);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return byName;
}

const voiceOf = (a: Json) => JSON.stringify(a.conversation_config?.tts ?? {});

async function main() {
  if (!KEY || !AGENT) throw new Error("Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID (node --env-file=.env ...).");
  const before = await el("GET", `/agents/${encodeURIComponent(AGENT)}`);
  const tts = before.conversation_config?.tts ?? {};
  console.log(`Agent "${before.name}": voice ${tts.voice_id} (${tts.model_id}; stability ${tts.stability}, similarity ${tts.similarity_boost}, speed ${tts.speed}). Left unchanged.`);

  if (RESTORE) {
    const saved = JSON.parse(readFileSync(RESTORE, "utf8")) as Json;
    const cc = saved.conversation_config;
    await el("PATCH", `/agents/${encodeURIComponent(AGENT)}`, {
      conversation_config: {
        agent: {
          prompt: { prompt: cc.agent.prompt.prompt, tool_ids: cc.agent.prompt.tool_ids ?? [] },
          dynamic_variables: cc.agent.dynamic_variables,
        },
        conversation: { client_events: cc.conversation.client_events },
      },
      platform_settings: { overrides: saved.platform_settings.overrides },
    });
    const after = await el("GET", `/agents/${encodeURIComponent(AGENT)}`);
    if (voiceOf(after) !== voiceOf(before)) throw new Error("TTS settings changed during restore. Check the dashboard.");
    console.log(`Restored prompt, tools, variables, client events and overrides from ${RESTORE}.`);
    return;
  }

  const prompt = readFileSync(join(HERE, "prompt.md"), "utf8").trim();
  const existing = await listClientTools();
  const cc = before.conversation_config ?? {};
  const events: string[] = cc.conversation?.client_events ?? [];
  const ov = before.platform_settings?.overrides ?? {};

  console.log("\nPlan:");
  for (const t of AGENT_TOOLS) console.log(`  tool ${t.name.padEnd(20)} ${existing.has(t.name) ? "update" : "create"} (client, expects a response)`);
  console.log(`  prompt: general assistant + Catch Me Up activities (${prompt.length} chars; was ${String(cc.agent?.prompt?.prompt ?? "").length})`);
  console.log(`  first message: unchanged (Catch Me Up); the app overrides it for general assistance`);
  console.log(`  allow override: agent.first_message (was ${ov.conversation_config_override?.agent?.first_message ?? false})`);
  console.log(`  client events: + ${CLIENT_EVENTS.filter((e) => !events.includes(e)).join(", ") || "(none needed)"}`);
  console.log(`  dynamic variable placeholders: ${Object.keys(PLACEHOLDERS).join(", ")}`);
  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to back up the agent and apply this.");
    return;
  }

  const backups = join(HERE, ".backups");
  mkdirSync(backups, { recursive: true });
  const backup = join(backups, `${AGENT}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backup, JSON.stringify(before, null, 2));
  console.log(`\nBacked up the current agent to ${backup}`);

  const ids: string[] = [];
  for (const t of AGENT_TOOLS) {
    const id = existing.get(t.name);
    const body = { tool_config: toolConfig(t) };
    const res = id ? await el("PATCH", `/tools/${id}`, body) : await el("POST", "/tools", body);
    ids.push(id ?? res.id);
    console.log(`  ${id ? "updated" : "created"} ${t.name} (${id ?? res.id})`);
  }

  const keepIds: string[] = (cc.agent?.prompt?.tool_ids ?? []).filter((x: string) => !ids.includes(x));
  await el("PATCH", `/agents/${encodeURIComponent(AGENT)}`, {
    conversation_config: {
      agent: {
        prompt: { prompt, tool_ids: [...keepIds, ...ids] },
        dynamic_variables: { dynamic_variable_placeholders: { ...(cc.agent?.dynamic_variables?.dynamic_variable_placeholders ?? {}), ...PLACEHOLDERS } },
      },
      conversation: { client_events: [...new Set([...events, ...CLIENT_EVENTS])] },
    },
    platform_settings: {
      overrides: {
        ...ov,
        conversation_config_override: {
          ...(ov.conversation_config_override ?? {}),
          agent: { ...(ov.conversation_config_override?.agent ?? {}), first_message: true },
        },
      },
    },
  });

  // Verify: the voice is untouched and every tool is attached.
  const after = await el("GET", `/agents/${encodeURIComponent(AGENT)}`);
  const problems: string[] = [];
  if (voiceOf(after) !== voiceOf(before)) problems.push("TTS settings changed");
  const attached: string[] = after.conversation_config?.agent?.prompt?.tool_ids ?? [];
  for (const id of ids) if (!attached.includes(id)) problems.push(`tool ${id} not attached`);
  if ((after.conversation_config?.agent?.prompt?.prompt ?? "").trim() !== prompt) problems.push("prompt not updated");
  if (after.platform_settings?.overrides?.conversation_config_override?.agent?.first_message !== true) problems.push("first_message override not allowed");
  if (!(after.conversation_config?.conversation?.client_events ?? []).includes("client_tool_call")) problems.push("client_tool_call event not enabled");
  const endCall = JSON.stringify(after.conversation_config?.agent?.prompt ?? {}).includes("end_call");
  if (!endCall) problems.push("end_call system tool missing");
  if (problems.length) {
    console.error(`\nApplied, but verification failed: ${problems.join("; ")}.\nRestore with: node --env-file=.env scripts/voice-agent/configure.ts --restore ${backup}`);
    process.exit(1);
  }
  console.log(`\nVerified: voice ${after.conversation_config.tts.voice_id} unchanged, ${ids.length} client tools attached, prompt and overrides applied, end_call kept.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
