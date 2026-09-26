/**
 * Seed MongoDB Atlas with the demo corpus and create the search indexes.
 *
 *   MONGODB_URI=... [VOYAGE_API_KEY=...] npm run seed:mongo --workspace @thinketh/intelligence
 *
 * Idempotent: documents are upserted by domain id.
 */
import { corpusChunks, MongoSemanticStore, voyageEmbed } from "../src/adapters/semantic.ts";
import { loadConfig } from "../src/config.ts";
import { buildSeed } from "../src/seed/corpus.ts";

const VOYAGE_DIMENSIONS = 1024;

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
const seed = buildSeed();

async function upsertAll(name: string, docs: Array<{ id: string }>) {
  if (docs.length === 0) return;
  await db.collection(name).bulkWrite(
    docs.map((d) => ({ replaceOne: { filter: { _id: d.id as never }, replacement: { ...d }, upsert: true } })),
  );
  console.log(`  ${name}: ${docs.length}`);
}

console.log(`Seeding ${config.mongo.db}…`);
await upsertAll("concepts", seed.concepts);
await upsertAll(
  "concept_edges",
  seed.edges.map((e) => ({ ...e, id: `${e.fromConceptId}->${e.toConceptId}:${e.type}` })),
);
await upsertAll("sources", seed.sources);
await upsertAll("claims", seed.claims);
await upsertAll("developments", seed.developments);
await upsertAll("storylines", seed.storylines);

const chunks = corpusChunks(seed);
const embeddings = config.voyage.apiKey
  ? await voyageEmbed(config.voyage.apiKey, config.voyage.model, chunks.map((c) => c.text), "document")
  : undefined;
await db.collection("corpus_chunks").bulkWrite(
  chunks.map((c, i) => ({
    replaceOne: {
      filter: { _id: `${c.kind}:${c.refId}` as never },
      replacement: { ...c, ...(embeddings ? { embedding: embeddings[i] } : {}) },
      upsert: true,
    },
  })),
);
console.log(`  corpus_chunks: ${chunks.length}${embeddings ? " (with Voyage embeddings)" : " (no embeddings: set VOYAGE_API_KEY for vector search)"}`);

async function ensureSearchIndex(definition: { name: string; type: "search" | "vectorSearch"; definition: object }) {
  const existing = await db.collection("corpus_chunks").listSearchIndexes(definition.name).toArray();
  if (existing.length > 0) {
    console.log(`  index ${definition.name}: exists`);
    return;
  }
  await db.collection("corpus_chunks").createSearchIndex(definition);
  console.log(`  index ${definition.name}: created (Atlas builds it in the background)`);
}

try {
  await ensureSearchIndex({
    name: config.mongo.searchIndex,
    type: "search",
    definition: { mappings: { dynamic: false, fields: { text: { type: "string" }, kind: { type: "token" } } } },
  });
  if (embeddings) {
    await ensureSearchIndex({
      name: config.mongo.vectorIndex,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "vector", path: "embedding", numDimensions: VOYAGE_DIMENSIONS, similarity: "cosine" },
          { type: "filter", path: "kind" },
        ],
      },
    });
  }
} catch (err) {
  console.warn("Could not create search indexes automatically (requires an Atlas cluster). See infra/mongo.md.", err);
}

console.log("Done.");
process.exit(0);
