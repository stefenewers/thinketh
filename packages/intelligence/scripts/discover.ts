/**
 * Run the discovery pipeline once and print what it did.
 *
 *   npm run discover --workspace @thinketh/intelligence
 *
 * Idempotent: items already processed are counted as duplicates, and a run already in progress
 * (in any process sharing the store) is reported and skipped. Uses the same store as the API
 * (MongoDB Atlas when MONGODB_URI is set, mirrored to THINKETH_DATA_DIR).
 */
import { createThinketh } from "../src/index.ts";

const { discovery } = createThinketh();
const outcome = await discovery.run("cli");
if (outcome.status === "skipped") {
  console.log(`Skipped: ${outcome.reason}${outcome.runningRunId ? ` (${outcome.runningRunId})` : ""}`);
} else {
  const r = outcome.run;
  console.log(`\nRun ${r.id}: ${r.status}`);
  for (const s of r.sources) console.log(`  ${s.error ? "FAILED" : "ok    "} ${s.name}: ${s.fetched} items${s.error ? ` (${s.error})` : ""}`);
  const filtered = Object.values(r.filtered).reduce((a, b) => a + (b ?? 0), 0);
  console.log(`  inspected ${r.itemsInspected}, filtered ${filtered} ${JSON.stringify(r.filtered)}`);
  console.log(`  developments stored: ${r.developmentIds.length} (Claude ${r.normalizedBy.claude}, deterministic ${r.normalizedBy.deterministic})`);
  for (const g of r.groups) console.log(`    ${g.developmentId ? "+" : "-"} ${g.title} (${g.itemUrls.length} item${g.itemUrls.length === 1 ? "" : "s"})`);
}
process.exit(outcome.status === "failed" ? 1 : 0);
