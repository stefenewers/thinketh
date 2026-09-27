// Preflight for the demo audit: records the build, checks config without printing secrets,
// starts an isolated API + Expo web (unless already up on the audit ports) and probes every sponsor.
//
//   node scripts/demo-audit/preflight.mjs          # start + check, writes <evidence>/preflight.json
//   node scripts/demo-audit/preflight.mjs --stop   # stop the services this harness started
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { API_PORT, API_URL, HARNESS_DIR, ROOT, WEB_PORT, WEB_URL, api, readEnv, runContext } from "./lib.mjs";

const PIDS = join(HARNESS_DIR, ".pids.json");
const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const listening = (port) => sh(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`).split("\n").filter(Boolean);

if (process.argv.includes("--stop")) {
  const pids = existsSync(PIDS) ? JSON.parse(readFileSync(PIDS, "utf8")) : {};
  for (const [name, pid] of Object.entries(pids)) {
    try { process.kill(-pid); console.log(`stopped ${name} (${pid})`); } catch { console.log(`${name} (${pid}) already stopped`); }
  }
  rmSync(PIDS, { force: true });
  process.exit(0);
}

const { runId, evidenceDir, auditUser } = runContext();
mkdirSync(evidenceDir, { recursive: true });
const env = readEnv();

// What the live path needs. Names only; values never leave this process.
const REQUIRED = ["ANTHROPIC_API_KEY", "MONGODB_URI", "TIGER_DATABASE_URL", "BACKBOARD_API_KEY", "BACKBOARD_ASSISTANT_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "THINKETH_APP_KEY"];
const OPTIONAL = ["MUSE_API_KEY", "MUSE_MODEL", "MUSE_API_BASE", "VOYAGE_API_KEY", "ANTHROPIC_WORKSPACE_ID", "SUPABASE_ANON_KEY"];

const pre = {
  runId,
  auditUser,
  startedAt: new Date().toISOString(),
  git: { sha: sh("git rev-parse HEAD"), short: sh("git rev-parse --short HEAD"), branch: sh("git rev-parse --abbrev-ref HEAD"), dirty: sh("git status --porcelain").split("\n").filter(Boolean).length },
  node: process.version,
  deps: { rootNodeModules: existsSync(join(ROOT, "node_modules")), playwrightCore: existsSync(join(HARNESS_DIR, "node_modules/playwright-core")), chrome: existsSync("/Applications/Google Chrome.app") },
  env: {
    rootEnvFile: existsSync(join(ROOT, ".env")),
    required: Object.fromEntries(REQUIRED.map((k) => [k, !!env[k]])),
    optional: Object.fromEntries(OPTIONAL.map((k) => [k, !!env[k]])),
    // An existing .env.local can be baked into the Expo bundle despite shell overrides.
    mobileEnvLocal: existsSync(join(ROOT, "apps/mobile/.env.local")),
  },
  otherServices: { demoApi8787: listening(8787).length > 0, metro8081: listening(8081).length > 0, note: "left untouched" },
  urls: { api: API_URL, web: WEB_URL },
  started: {},
};

const pids = existsSync(PIDS) ? JSON.parse(readFileSync(PIDS, "utf8")) : {};
if (pre.env.mobileEnvLocal) {
  const local = readFileSync(join(ROOT, "apps/mobile/.env.local"), "utf8");
  const match = local.match(/^EXPO_PUBLIC_API_URL=(.*)$/m);
  const mock = local.match(/^EXPO_PUBLIC_USE_MOCK_API=(.*)$/m)?.[1]?.trim();
  const fallback = local.match(/^EXPO_PUBLIC_API_FALLBACK_TO_MOCK=(.*)$/m)?.[1]?.trim();
  if (match?.[1]?.trim() !== API_URL || mock !== "false" || fallback !== "false") {
    console.error("Audit preflight stopped: apps/mobile/.env.local conflicts with the audit API or mock settings. Run from an isolated checkout configured for the audit URL; shell overrides are not reliable.");
    process.exit(2);
  }
}
// Server logs stay out of docs/ (gitignored): they are for debugging, not for publishing.
const logDir = join(HARNESS_DIR, ".logs", runId);
mkdirSync(logDir, { recursive: true });
const logFile = (name) => openSync(join(logDir, `${name}.log`), "a");
pre.logs = logDir.replace(ROOT + "/", "");

// API: same settings as scripts/demo-api.sh, without the public tunnel.
if (listening(API_PORT).length) pre.started.api = "already running";
else {
  const p = spawn("npm", ["run", "start", "--workspace", "@thinketh/intelligence"], {
    cwd: ROOT, detached: true, stdio: ["ignore", logFile("api"), logFile("api")],
    env: { ...process.env, PORT: String(API_PORT), THINKETH_REQUIRE_AUTH: "false", THINKETH_ALLOW_RESET: "true", THINKETH_DEMO_ALIAS_PREFIX: "audit-" },
  });
  p.unref(); pids.api = p.pid; pre.started.api = "started";
}

// Web: live backend only. USE_MOCK=false and FALLBACK_TO_MOCK=false so a failure shows instead of seeded data.
// --clear matters: Metro can retain an old embedded URL. Preflight above rejects a conflicting
// .env.local, because EXPO_NO_DOTENV and process env alone did not override it in the audit.
if (listening(WEB_PORT).length) pre.started.web = "already running (verify it was started with mock fallback off)";
else {
  const p = spawn("npx", ["expo", "start", "--web", "--clear", "--port", String(WEB_PORT)], {
    cwd: join(ROOT, "apps/mobile"), detached: true, stdio: ["ignore", logFile("web"), logFile("web")],
    env: { ...process.env, CI: "1", BROWSER: "none", EXPO_NO_DOTENV: "1", EXPO_PUBLIC_API_URL: API_URL, EXPO_PUBLIC_USE_MOCK_API: "false", EXPO_PUBLIC_API_FALLBACK_TO_MOCK: "false", EXPO_PUBLIC_THINKETH_APP_KEY: env.THINKETH_APP_KEY ?? "" },
  });
  p.unref(); pids.web = p.pid; pre.started.web = "started";
}
writeFileSync(PIDS, JSON.stringify(pids));
pre.mockFallback = { EXPO_PUBLIC_USE_MOCK_API: "false", EXPO_PUBLIC_API_FALLBACK_TO_MOCK: "false", appliesTo: pre.started.web === "started" ? "this run" : "unknown: web was already running" };

const waitFor = async (fn, secs) => { for (let i = 0; i < secs; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 1000)); } return false; };
pre.apiUp = await waitFor(async () => (await api("/health")).ok, 60);
pre.webUp = await waitFor(async () => { try { return (await fetch(WEB_URL, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; } }, 180);

// One real call per configured sponsor (no secrets in the response).
const probe = await api("/health?probe=1", { timeoutMs: 60000 });
pre.health = { ok: probe.ok, ms: probe.ms, adapters: Object.fromEntries(Object.entries(probe.json?.adapters ?? {}).map(([k, a]) => [k, { status: a.status, configured: a.configured, probe: probe.json?.probe?.[k], lastError: a.lastError?.slice(0, 200) }])) };
const cfg = await api("/config", { user: auditUser });
pre.featureFlags = cfg.json?.flags ?? null;

// Tiger reachable directly (read-only).
pre.tigerDirect = sh(`node ${join(HARNESS_DIR, "tiger-check.mjs")} --ping`) || "unreachable";

writeFileSync(join(evidenceDir, "preflight.json"), JSON.stringify(pre, null, 2));
console.log(JSON.stringify(pre, null, 2));
console.log(`\nevidence: ${evidenceDir}\nexport AUDIT_RUN_ID=${runId}`);
