# Sponsor integration evidence

The authoritative live status comes from the running backend:

```sh
curl "http://localhost:8787/health?probe=true"
```

`probe=true` makes one cheap real call to each configured service. `live` means the call succeeded, `error` means credentials exist but the call failed, and `not_configured` means the backend is using its local fallback.

## Status (2026-09-25, local backend on latest main)

| Service | Status | Proof |
|---|---|---|
| Tiger Data | **live** | Probe: `6 transitions stored (348ms)`. Golden loop writes and reads Tiger (below). |
| MongoDB Atlas | **live** | Probe: `7 developments stored (493ms)`. `/ask` retrieves through Atlas Search: 26 calls, 0 fallbacks during the golden loop. |
| Backboard | not configured | Needs `BACKBOARD_API_KEY` |
| Claude | not configured | Needs `ANTHROPIC_API_KEY` |
| ElevenLabs | not configured | Needs `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` |
| Supabase | not configured | Needs a project (`SUPABASE_URL`, keys) for remote deploy |

The mobile golden check passes against the real backend with Tiger and Mongo live:
`API_URL=http://localhost:8787 npm run check:golden -w mobile` → all checks passed.

## Tiger Data: version control for human understanding

Reproduce with `npm run evidence:tiger --workspace @thinketh/intelligence`.

```text
TimescaleDB 2.30.1
Hypertables
  interaction_events           partitioned by created_at
  knowledge_observations       partitioned by created_at
  knowledge_state_transitions  partitioned by created_at
  world_state_events           partitioned by created_at

Knowledge history for demo-user / agent-memory (oldest first)
  2026-09-26T02:02:09Z  diagnostic_correct  mastery 0.419 -> 0.508  uncertainty 0.438 -> 0.289
    Updated because you correctly answered a transfer question about what state persists across
    sessions. Mastery rose 0.42 → 0.51 and uncertainty fell 0.44 → 0.29. Diagnostic evidence is
    weighted 1.00, versus 0.15 for “Got it”, because it shows understanding rather than reporting it.
    It also cleared an earlier misconception: that agent memory is just a longer context window.

Continuous aggregate daily_concept_mastery for demo-user
  2026-09-26  agent-memory     mastery 0.508  uncertainty 0.289
  2026-09-26  context-windows  mastery 0.816  uncertainty 0.156   (propagated: prerequisite of Agent Memory)
  …
```

What this shows:
- **Every answer is an append-only fact.** One diagnostic answer wrote 6 transitions: the answered concept plus 5 propagated updates. Each one stores before, after and a reason.
- **History survives restarts.** A freshly started server with empty memory returned Agent Memory's current mastery (0.508) and today's transition, read from Tiger. This is what makes the stateless Edge Function deploy work.
- **Time-series rollups.** The `daily_concept_mastery` continuous aggregate gives the "how my understanding changed" curve per concept per day.
- **Failure-safe.** Writes always go to the local store first. If Tiger is slow or down, the demo continues and `/health` shows the error.

Screenshots to capture for Devpost: the Tiger Cloud console showing the four hypertables, and the output of the evidence script above.

## MongoDB Atlas: the semantic corpus

Reproduce with `npm run evidence:mongo --workspace @thinketh/intelligence`.

```text
MongoDB 8.0.32, database "thinketh"
Collections
  developments   7    sources 13    claims 13    concepts 9    concept_edges 10    storylines 1
  corpus_chunks  42   (retrieval collection: one chunk per development, claim, concept and source)
Search indexes on corpus_chunks
  corpus_text (search): READY, queryable

$search: "How is persistent agent memory different from retrieval?"
  2.90  development  dev-persistent-agent-memory   Persistent agent memory changes how long-running agents operate…
  1.98  development  dev-memory-benchmarks         Retrieval benchmarks stop predicting memory performance…
  1.92  source       src-memory-vs-rag-benchmark   Retrieval scores no longer predict memory performance…
  1.81  source       src-memory-critique           When agents remember the wrong thing: error entrenchment…
  1.75  claim        clm-memory-scoped-recall      Recall is scoped: the agent retrieves only memories relevant…
```

What this shows:
- **Atlas holds the world-state corpus**: developments, sources, claims, concepts and their graph edges. Tiger holds how the user's understanding changes over time, so each store has a distinct job.
- **Ask retrieves through Atlas Search.** `POST /ask` runs this `$search` and expands hits into claims. Those claims become the verbatim "sources say" layer of the answer.
- **Development detail reads from Atlas**, falling back to the seeded corpus if Atlas is unreachable.
- **Vector search is ready to switch on.** With `VOYAGE_API_KEY` set, the seed script stores embeddings and creates the `developments_vector` index, and `/ask` then uses `$vectorSearch`. It's optional; text search is live now.

Screenshots to capture: Atlas → Collections (the `thinketh` database) and Atlas Search → `corpus_text`, plus the output above.

## To do

- Backboard: stable assistant, a stored preference and misconception, recall from a second thread
- Remote deploy: Supabase project + CLI, then the golden loop over the public URL
- ElevenLabs: `/voice/session` returning `mode: "elevenlabs"`
- Claude: `x-thinketh-delta-source: claude` on `/developments/:id`
