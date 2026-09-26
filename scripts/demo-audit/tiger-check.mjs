// Read-only Tiger check: proves knowledge-state transitions for the audit user were written
// to Tiger itself, not only to the API's in-memory store. Never writes or deletes.
//
//   node scripts/demo-audit/tiger-check.mjs --ping
//   node scripts/demo-audit/tiger-check.mjs <userId>
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, readEnv } from "./lib.mjs";

const url = readEnv().TIGER_DATABASE_URL;
if (!url) { console.log(JSON.stringify({ ok: false, reason: "TIGER_DATABASE_URL not set" })); process.exit(0); }
const postgres = createRequire(join(ROOT, "package.json"))("postgres");
const sql = postgres(url, { ssl: "require", max: 1, connect_timeout: 15, idle_timeout: 2 });
try {
  if (process.argv[2] === "--ping") {
    await sql`select 1`;
    console.log("reachable");
  } else {
    const user = process.argv[2];
    const rows = await sql`
      select concept_id, observation_kind, mastery_before, mastery_after, uncertainty_before, uncertainty_after, created_at, left(reason, 140) as reason
      from knowledge_state_transitions where user_id = ${user} order by created_at`;
    console.log(JSON.stringify({ ok: true, user, count: rows.length, rows }, null, 2));
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: String(e?.code ?? e?.message ?? e).slice(0, 160) }));
} finally {
  await sql.end({ timeout: 2 });
}
