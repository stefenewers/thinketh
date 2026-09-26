/**
 * Apply the Tiger Data schema and seed world-state events for the demo corpus.
 *
 *   TIGER_DATABASE_URL=postgres://... npm run seed:tiger --workspace @thinketh/intelligence
 *
 * Knowledge transitions are not seeded here: they are written live as the
 * user interacts, which is the point of the demo.
 */
import { readFile } from "node:fs/promises";
import { TigerTemporalStore } from "../src/adapters/temporal.ts";
import { loadConfig } from "../src/config.ts";
import { buildSeed } from "../src/seed/corpus.ts";

const config = loadConfig();
if (!config.tiger.url) {
  console.error("TIGER_DATABASE_URL is not set.");
  process.exit(1);
}
const sql = await new TigerTemporalStore(config.tiger.url).sql();

const schema = await readFile(new URL("../infra/tiger.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*\n/)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);
for (const statement of statements) {
  await sql.unsafe(statement);
}
console.log(`Applied ${statements.length} schema statements.`);

const seed = buildSeed();
for (const d of seed.developments) {
  await sql`
    insert into world_state_events (id, development_id, kind, significance, payload, created_at)
    values (${`wse-${d.id}`}, ${d.id}, 'development_detected', ${d.significance},
            ${sql.json({ title: d.title, conceptIds: d.conceptIds, novelty: d.novelty } as never)}, ${d.happenedAt})
    on conflict do nothing`;
}
console.log(`Seeded ${seed.developments.length} world_state_events.`);
await sql.end();
