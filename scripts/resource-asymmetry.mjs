#!/usr/bin/env node
// Dev utility: which known-safe source produces the clearest REAL asymmetry between the two demo
// Minds? Reads each candidate through the running API as both users (the normal resource pipeline)
// and reports their computed deltas. Nothing here writes or invents values.
//   API=http://localhost:8787 KEY=<app key> node scripts/resource-asymmetry.mjs [url ...]
const API = process.env.API ?? "http://localhost:8787";
const KEY = process.env.KEY ?? "";
const USERS = ["demo-user", "nadani"];
const DEFAULTS = [
  "https://www.anthropic.com/engineering/building-effective-agents",
  "https://claude.com/blog/context-management",
  "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview",
  "https://platform.claude.com/docs/en/build-with-claude/context-windows",
  "https://platform.claude.com/docs/en/build-with-claude/compaction",
  "https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation",
  "https://github.com/letta-ai/letta",
  "https://arxiv.org/abs/2504.19413",
  "https://arxiv.org/abs/2310.01798",
  "https://arxiv.org/abs/2005.11401",
  "https://arxiv.org/abs/2406.12045",
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
const call = async (method, path, user, body) => {
  const res = await fetch(API + path, { method, headers: { "content-type": "application/json", "x-thinketh-app-key": KEY, "x-thinketh-user": user }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return res.json();
};
async function read(url, user) {
  const r = await call("POST", "/resources", user, { url });
  if (!r.id) return { status: "failed", error: r.error?.message ?? "rejected" };
  for (let i = 0; i < 120; i++) {
    const x = await call("GET", `/resources/${r.id}`, user);
    if (x.status !== "processing") return x;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { status: "timeout" };
}
const rows = [];
for (const url of urls) {
  const [a, b] = await Promise.all(USERS.map((u) => read(url, u)));
  const side = (r) => ({ status: r.status, min: r.estimatedUsefulMinutes, ideas: r.newToYou?.length ?? 0, focus: r.newToYou?.[0]?.conceptId ?? r.newToYou?.[0]?.idea ?? "-" });
  const A = side(a), B = side(b);
  const ok = A.status === "ready" && B.status === "ready";
  const dMin = ok ? Math.abs((A.min ?? 0) - (B.min ?? 0)) : 0;
  const dIdeas = ok ? Math.abs(A.ideas - B.ideas) : 0;
  const clear = ok && (dMin >= 2 || dIdeas >= 2 || A.ideas === 0 || B.ideas === 0 || (dMin >= 1 && A.focus !== B.focus));
  rows.push({ url, A, B, dMin, dIdeas, clear });
  console.log(`${clear ? "CLEAR" : "     "} Δmin ${dMin} Δideas ${dIdeas} | Stefen ${A.status} ${A.min}m ${A.ideas} ideas (${A.focus}) | Nadani ${B.status} ${B.min}m ${B.ideas} ideas (${B.focus}) | ${url}`);
}
const best = rows.filter((r) => r.clear).sort((x, y) => y.dMin + y.dIdeas - (x.dMin + x.dIdeas))[0];
console.log(best ? `\nClearest real asymmetry: ${best.url}` : "\nNo candidate met the asymmetry bar; keep the default and rely on focus.");
