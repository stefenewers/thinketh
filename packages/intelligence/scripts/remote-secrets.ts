/**
 * Write the Edge Function secrets file for `supabase secrets set`.
 *
 *   npm run secrets:remote --workspace @thinketh/intelligence
 *   ./supabase/deploy-remote.sh      (Stefen's script: sets these secrets, deploys, verifies)
 *
 * Copies only the keys the deployed API needs from the repo-root .env, and
 * leaves out SUPABASE_*: the Edge runtime injects SUPABASE_URL,
 * SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY itself, and the CLI rejects
 * secret names with that prefix. Prints key names only, never values.
 */
import { readFile, writeFile } from "node:fs/promises";

const REQUIRED = ["BACKBOARD_API_KEY", "BACKBOARD_ASSISTANT_ID", "MONGODB_URI", "TIGER_DATABASE_URL"];
const OPTIONAL = ["MONGODB_DB", "VOYAGE_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_WORKSPACE_ID", "THINKETH_CLAUDE_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "THINKETH_ADMIN_TOKEN"];
/**
 * Judging defaults: demo persona, reset allowed, no strict auth. TIGER_TLS_INSECURE
 * works around Timescale's CA:TRUE certificate being rejected by the Edge runtime
 * (HackGT only; see docs/POST-HACKATHON-CLEANUP.md).
 */
const DEFAULTS: Record<string, string> = {
  THINKETH_DEMO_USER_ID: "demo-user",
  THINKETH_ALLOW_RESET: "true",
  THINKETH_REQUIRE_AUTH: "false",
  TIGER_TLS_INSECURE: "true",
};

const root = new URL("../../../", import.meta.url);
const env = new Map<string, string>();
for (const line of (await readFile(new URL(".env", root), "utf8")).split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && m[2]) env.set(m[1]!, m[2]);
}

const out: string[] = [];
const missing = REQUIRED.filter((k) => !env.has(k));
for (const k of [...REQUIRED, ...OPTIONAL]) if (env.has(k)) out.push(`${k}=${env.get(k)}`);
for (const [k, v] of Object.entries(DEFAULTS)) out.push(`${k}=${env.get(k) ?? v}`);

// Same file supabase/deploy-remote.sh reads.
const target = new URL("supabase/.env.remote", root);
await writeFile(target, out.join("\n") + "\n", { mode: 0o600 });
console.log(`Wrote ${target.pathname.replace(root.pathname, "")} with: ${out.map((l) => l.split("=")[0]).join(", ")}`);
if (missing.length) console.warn(`Missing required keys (those sponsors will run on fallback): ${missing.join(", ")}`);
console.log("Next: ./supabase/deploy-remote.sh");
