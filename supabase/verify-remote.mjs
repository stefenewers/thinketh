// Verifies the deployed API: sponsor health, diagnostic-answer latency, and a Tiger write/read round trip.
//   node supabase/verify-remote.mjs [API_URL]
const base = process.argv[2] ?? "https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api";
const CLIENT_TIMEOUT_MS = 8000; // apps/mobile/src/api/http.ts

async function call(method, path, body) {
  const started = performance.now();
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(process.env.THINKETH_APP_KEY ? { "x-thinketh-app-key": process.env.THINKETH_APP_KEY } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json();
  return { status: res.status, ms: Math.round(performance.now() - started), json };
}

const tigerCount = (probe) => Number(/(\d+) transitions stored/.exec(probe?.tiger?.detail ?? "")?.[1] ?? NaN);
let failed = false;
const check = (ok, label) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
};

console.log(`target: ${base}\n\n/health?probe=true`);
const before = await call("GET", "/health?probe=true");
for (const [name, a] of Object.entries(before.json.adapters)) {
  const detail = before.json.probe?.[name]?.detail ?? a.lastError ?? "";
  console.log(`  ${name.padEnd(11)} ${a.status.padEnd(10)} ${String(detail).slice(0, 110)}`);
}

console.log("\nDiagnostic answer timing");
await call("POST", "/demo/reset");
// Reset clears this user's Tiger rows, so count from here.
const afterReset = await call("GET", "/health?probe=true");
const brief = await call("GET", "/brief/today");
const heroId = brief.json.brief.heroDevelopmentId;
await call("GET", `/developments/${heroId}`);
const picked = await call("POST", "/diagnostics/select", { developmentId: heroId });
const q = picked.json.question;
const answer = q.choices.find((c) => /^(Distilled facts|Memory that persists)/.test(c)) ?? q.choices[0];
const answered = await call("POST", `/diagnostics/${q.id}/answer`, { answer });
const t = answered.json.transition;
console.log(`  select ${picked.ms} ms, answer ${answered.ms} ms  (${q.id}: mastery ${t?.before.mastery.toFixed(2)} -> ${t?.after.mastery.toFixed(2)})`);
check(answered.status === 200 && answered.ms < CLIENT_TIMEOUT_MS, `answer returned in ${answered.ms} ms (< ${CLIENT_TIMEOUT_MS} ms client timeout)`);

console.log("\nTiger write/read from the deployed API");
const after = await call("GET", "/health?probe=true");
const [n0, n1] = [tigerCount(afterReset.json.probe), tigerCount(after.json.probe)];
console.log(`  transitions in Tiger: before ${n0}, after ${n1}`);
check(after.json.adapters.tiger?.status === "live", "Tiger reports live");
check(n1 > n0, "the answer's transition was written to Tiger and read back (count went up)");
const history = await call("GET", `/knowledge/${t?.conceptId}/history`);
check((history.json.transitions ?? []).some((x) => x.id === t?.id), "answer's transition appears in concept history");

console.log(failed ? "\nRemote verification FAILED" : "\nRemote verification passed");
process.exit(failed ? 1 : 0);
