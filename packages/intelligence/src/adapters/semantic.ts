/**
 * SemanticStore: developments, sources, claims, concepts, storylines.
 *
 * Mongo layout (see infra/mongo.md):
 *   developments | sources | claims | concepts | storylines   canonical docs, _id = domain id
 *   corpus_chunks   { _id: "<kind>:<id>", kind, refId, text, embedding? }
 *     - Atlas Vector Search index on `embedding` (filter: kind)  -> used when VOYAGE_API_KEY is set
 *     - Atlas Search index on `text`                             -> used otherwise
 */
import type { Claim, Concept, Development, Source, Storyline } from "../contracts.ts";
import { DevelopmentSchema } from "../contracts.ts";
import { ensureOk } from "./guard.ts";
import { lexicalScore } from "./model/deterministic.ts";
import type { SearchKind, SemanticSearchQuery, SemanticSearchResult, SemanticStore } from "./types.ts";

export type CorpusSnapshot = {
  developments: Development[];
  sources: Source[];
  claims: Claim[];
  concepts: Concept[];
  storylines: Storyline[];
};

export type Chunk = { kind: SearchKind; refId: string; text: string };

export function corpusChunks(corpus: CorpusSnapshot): Chunk[] {
  return [
    ...corpus.developments.map((d) => ({ kind: "development" as const, refId: d.id, text: `${d.title}. ${d.summaryBullets.join(" ")}` })),
    ...corpus.claims.map((c) => ({ kind: "claim" as const, refId: c.id, text: c.text })),
    ...corpus.concepts.map((c) => ({ kind: "concept" as const, refId: c.id, text: `${c.name}. ${c.description}` })),
    ...corpus.sources.map((s) => ({ kind: "source" as const, refId: s.id, text: s.title })),
  ];
}

export class LocalSemanticStore implements SemanticStore {
  readonly name = "local" as const;
  private readonly developments = new Map<string, Development>();
  private readonly corpus: CorpusSnapshot;

  constructor(corpus: CorpusSnapshot) {
    this.corpus = corpus;
    for (const d of corpus.developments) this.developments.set(d.id, d);
  }

  async upsertDevelopment(input: Development): Promise<void> {
    this.developments.set(input.id, input);
  }

  async getDevelopment(id: string): Promise<Development | null> {
    return this.developments.get(id) ?? null;
  }

  async search(query: SemanticSearchQuery): Promise<SemanticSearchResult[]> {
    const kinds = new Set(query.kinds ?? ["development", "claim", "concept", "source"]);
    const snapshot = { ...this.corpus, developments: [...this.developments.values()] };
    return corpusChunks(snapshot)
      .filter((c) => kinds.has(c.kind))
      .map((c) => ({ kind: c.kind, id: c.refId, text: c.text, score: lexicalScore(query.text, c.text) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 8);
  }
}

/** Voyage AI embeddings (REST). Used for both corpus seeding and query embedding. */
export async function voyageEmbed(apiKey: string, model: string, input: string[], inputType: "query" | "document"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input, model, input_type: inputType }),
  });
  await ensureOk(res, "voyage embeddings");
  const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return body.data.map((d) => d.embedding);
}

type MongoDb = import("mongodb").Db;

type MongoOptions = {
  uri: string;
  db: string;
  vectorIndex: string;
  searchIndex: string;
  voyage?: { apiKey: string; model: string };
};

export class MongoSemanticStore implements SemanticStore {
  readonly name = "mongo" as const;
  private dbPromise: Promise<MongoDb> | undefined;
  private readonly opts: MongoOptions;

  constructor(opts: MongoOptions) {
    this.opts = opts;
  }

  db(): Promise<MongoDb> {
    this.dbPromise ??= (async () => {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(this.opts.uri, { serverSelectionTimeoutMS: 4000, appName: "thinketh" });
      await client.connect();
      return client.db(this.opts.db);
    })().catch((err) => {
      this.dbPromise = undefined; // allow a retry on the next call
      throw err;
    });
    return this.dbPromise;
  }

  async upsertDevelopment(input: Development): Promise<void> {
    const db = await this.db();
    await db.collection("developments").replaceOne({ _id: input.id as never }, { ...input }, { upsert: true });
    const text = `${input.title}. ${input.summaryBullets.join(" ")}`;
    const embedding = this.opts.voyage
      ? (await voyageEmbed(this.opts.voyage.apiKey, this.opts.voyage.model, [text], "document"))[0]
      : undefined;
    await db
      .collection("corpus_chunks")
      .replaceOne(
        { _id: `development:${input.id}` as never },
        { kind: "development", refId: input.id, text, ...(embedding ? { embedding } : {}) },
        { upsert: true },
      );
  }

  async getDevelopment(id: string): Promise<Development | null> {
    const db = await this.db();
    const doc = await db.collection("developments").findOne({ _id: id as never });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return DevelopmentSchema.parse(rest);
  }

  async search(query: SemanticSearchQuery): Promise<SemanticSearchResult[]> {
    const db = await this.db();
    const limit = query.limit ?? 8;
    const kinds = query.kinds;
    let pipeline: object[];
    if (this.opts.voyage) {
      const [vector] = await voyageEmbed(this.opts.voyage.apiKey, this.opts.voyage.model, [query.text], "query");
      pipeline = [
        {
          $vectorSearch: {
            index: this.opts.vectorIndex,
            path: "embedding",
            queryVector: vector,
            numCandidates: limit * 10,
            limit,
            ...(kinds ? { filter: { kind: { $in: kinds } } } : {}),
          },
        },
        { $project: { kind: 1, refId: 1, text: 1, score: { $meta: "vectorSearchScore" } } },
      ];
    } else {
      pipeline = [
        { $search: { index: this.opts.searchIndex, text: { query: query.text, path: "text" } } },
        ...(kinds ? [{ $match: { kind: { $in: kinds } } }] : []),
        { $limit: limit },
        { $project: { kind: 1, refId: 1, text: 1, score: { $meta: "searchScore" } } },
      ];
    }
    const docs = await db.collection("corpus_chunks").aggregate(pipeline).toArray();
    return docs.map((d) => ({ kind: d.kind as SearchKind, id: String(d.refId), text: String(d.text), score: Number(d.score) }));
  }
}
