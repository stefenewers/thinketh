/**
 * Print MongoDB Atlas evidence for the sponsor submission / screenshots:
 * the corpus collections, the Atlas Search index, and a live $search query
 * (the same retrieval path POST /ask uses).
 *
 *   npm run evidence:mongo --workspace @thinketh/intelligence [-- "<query>"]
 */
import { MongoSemanticStore } from "../src/adapters/semantic.ts";
import { loadConfig } from "../src/config.ts";

const query = process.argv[2] ?? "How is persistent agent memory different from retrieval?";
const config = loadConfig();
if (!config.mongo.uri) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}
const store = new MongoSemanticStore({
  uri: config.mongo.uri,
  db: config.mongo.db,
  vectorIndex: config.mongo.vectorIndex,
  searchIndex: config.mongo.searchIndex,
});
const db = await store.db();
const info = await db.admin().command({ buildInfo: 1 });
console.log(`MongoDB ${info.version}, database "${db.databaseName}"\n`);

console.log("Collections");
for (const name of ["developments", "sources", "claims", "concepts", "concept_edges", "storylines", "corpus_chunks"]) {
  console.log(`  ${name.padEnd(14)} ${await db.collection(name).countDocuments()} documents`);
}

console.log("\nSearch indexes on corpus_chunks");
type SearchIndexInfo = { name: string; type?: string; status?: string; queryable?: boolean };
for (const idx of (await db.collection("corpus_chunks").listSearchIndexes().toArray()) as SearchIndexInfo[]) {
  console.log(`  ${idx.name} (${idx.type ?? "search"}): ${idx.status}${idx.queryable ? ", queryable" : ""}`);
}

console.log(`\n$search: "${query}"`);
const hits = await db
  .collection("corpus_chunks")
  .aggregate([
    { $search: { index: config.mongo.searchIndex, text: { query, path: "text" } } },
    { $limit: 5 },
    { $project: { _id: 0, kind: 1, refId: 1, text: 1, score: { $meta: "searchScore" } } },
  ])
  .toArray();
for (const h of hits) console.log(`  ${Number(h.score).toFixed(2)}  ${String(h.kind).padEnd(11)} ${String(h.refId).padEnd(38)} ${String(h.text).slice(0, 70)}…`);
process.exit(0);
