# MongoDB Atlas setup

`npm run seed:mongo` upserts the demo corpus and creates the search indexes on
an Atlas cluster. If index creation fails (e.g. insufficient role), create them
in the Atlas UI on `thinketh.corpus_chunks`:

**Atlas Search**, name `corpus_text`:

```json
{ "mappings": { "dynamic": false, "fields": { "text": { "type": "string" }, "kind": { "type": "token" } } } }
```

**Atlas Vector Search**, name `developments_vector` (only needed with `VOYAGE_API_KEY`):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" },
    { "type": "filter", "path": "kind" }
  ]
}
```

Collections: `developments`, `sources`, `claims`, `concepts`, `concept_edges`,
`storylines` (canonical docs, `_id` = domain id) and `corpus_chunks`
(`{ _id: "<kind>:<id>", kind, refId, text, embedding? }`) for retrieval.

Retrieval order used by `/ask`: `$vectorSearch` (Voyage embeddings) → `$search`
(text) → local lexical fallback.
