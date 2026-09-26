/**
 * Print Tiger Data evidence for the sponsor submission / screenshots:
 * hypertables, the continuous aggregate, and a user's concept history read
 * straight from Tiger ("version control for human understanding").
 *
 *   npm run evidence:tiger --workspace @thinketh/intelligence [-- <userId> <conceptId>]
 */
import { TigerTemporalStore } from "../src/adapters/temporal.ts";
import { loadConfig } from "../src/config.ts";

const [userId = "demo-user", conceptId = "agent-memory"] = process.argv.slice(2);
const config = loadConfig();
if (!config.tiger.url) {
  console.error("TIGER_DATABASE_URL is not set.");
  process.exit(1);
}
const sql = await new TigerTemporalStore(config.tiger.url).sql();

const [version] = await sql`select (select extversion from pg_extension where extname = 'timescaledb') as ts`;
console.log(`TimescaleDB ${version?.ts}\n`);

console.log("Hypertables");
for (const r of await sql`
  select h.hypertable_name, h.num_chunks, d.column_name
  from timescaledb_information.hypertables h
  join timescaledb_information.dimensions d using (hypertable_schema, hypertable_name)
  order by 1`) {
  console.log(`  ${String(r.hypertable_name).padEnd(28)} partitioned by ${r.column_name}, ${r.num_chunks} chunk(s)`);
}

console.log("\nRow counts");
const [c] = await sql`select
  (select count(*) from knowledge_observations)::int as observations,
  (select count(*) from knowledge_state_transitions)::int as transitions,
  (select count(*) from world_state_events)::int as world_events,
  (select count(*) from interaction_events)::int as interactions`;
console.log(`  ${JSON.stringify(c)}`);

console.log(`\nKnowledge history for ${userId} / ${conceptId} (oldest first)`);
for (const r of await sql`
  select created_at, observation_kind, mastery_before, mastery_after, uncertainty_before, uncertainty_after, reason
  from knowledge_state_transitions
  where user_id = ${userId} and concept_id = ${conceptId}
  order by created_at`) {
  console.log(
    `  ${new Date(r.created_at).toISOString()}  ${String(r.observation_kind).padEnd(20)} mastery ${r.mastery_before} -> ${r.mastery_after}   uncertainty ${r.uncertainty_before} -> ${r.uncertainty_after}`,
  );
  console.log(`    ${r.reason}`);
}

await sql`call refresh_continuous_aggregate('daily_concept_mastery', null, null)`;
console.log(`\nContinuous aggregate daily_concept_mastery for ${userId}`);
for (const r of await sql`
  select day, concept_id, mastery, uncertainty, transitions
  from daily_concept_mastery where user_id = ${userId} order by day desc, concept_id limit 12`) {
  console.log(`  ${new Date(r.day).toISOString().slice(0, 10)}  ${String(r.concept_id).padEnd(22)} mastery ${r.mastery}  uncertainty ${r.uncertainty}  (${r.transitions} transitions)`);
}
await sql.end();
