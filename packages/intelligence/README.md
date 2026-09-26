# @thinketh/intelligence: Thinketh backend

The typed intelligence/API layer behind the golden demo:

> Today → Development → Knowledge Delta → Diagnostic → Knowledge State Update → Mind

It runs with **zero credentials**: each sponsor integration has a deterministic
local fallback, so the whole loop works offline on seeded data. Adding a key
switches that one integration to live.

## Run it

```bash
# once: Node 22.18+ (runs TypeScript natively), then from the repo root
npm install
npm run dev:api            # http://localhost:8787 (also reachable on your LAN IP)
npm test                   # unit + API tests
npm run typecheck
```

Copy `.env.example` to `.env` at the repo root to turn on sponsor integrations.

## How the mobile app calls it (for Stefen)

**Base URL**
- Local / same Wi-Fi: `http://<nadani-laptop-ip>:8787`
- Supabase Edge Function (once deployed): `https://<project>.supabase.co/functions/v1/api`

Paths are identical on both.

**Auth**
- Send `Authorization: Bearer <supabase access token>` when signed in.
- With no token, requests act as the seeded demo persona (`demo-user`).
- For local testing, `x-thinketh-user-id: <any id>` picks a separate user. Every new user starts from the demo persona.

**Types**: import request and response types from `@thinketh/contracts`
(`packages/contracts/src/index.ts`). Every response below is validated against
those schemas on the server before it is sent.

**Errors**: `{ "error": { "code": "not_found" | "bad_request" | "unauthorized" | "internal", "message": "…" } }`.
No stack traces are ever returned.

### Integration order

| # | Endpoint | Response type |
|---|---|---|
| 1 | `GET /brief/today` | `BriefResponse` |
| 2 | `GET /developments/:id` | `DevelopmentDetailResponse` |
| 3 | `POST /diagnostics/select` | `DiagnosticSelectResponse` |
| 4 | `POST /diagnostics/:id/answer` | `DiagnosticAnswerResponse` |
| 5 | `GET /knowledge` | `KnowledgeResponse` |
| 6 | `GET /knowledge/:conceptId/history` | `ConceptHistoryResponse` |
| 7 | `POST /ask` | `AskResponse` |
| 8 | `POST /visualize` | `DiagramSpec` |
| 9 | `POST /make-it-stick` | `MemoryAid` |
| 10 | `POST /voice/session` | `VoiceSession` |
| – | `POST /developments/:id/feedback` | `FeedbackResponse` (Got it / I already knew this / Explain deeper / saved / viewed) |
| – | `GET /config` | `AppConfigResponse`: feature flags. Hide anything that is `false`. |
| – | `POST /demo/reset` | `{ ok: true }`: resets the current user to the seeded persona (for rehearsals). |
| – | `GET /health` | Adapter status (live vs fallback, last error). |

### Examples (real responses from the seeded demo, trimmed with …)

**`GET /brief/today`**
```json
{
  "brief": {
    "date": "2026-09-25",
    "meaningfulCount": 6, "majorCount": 3, "estimatedMinutes": 11,
    "skippedCount": 39,
    "skippedBreakdown": { "duplicate": 21, "low_signal": 17, "already_understood": 1 },
    "heroDevelopmentId": "dev-persistent-agent-memory",
    "developmentIds": ["dev-persistent-agent-memory", "dev-evaluator-layer", "dev-mcp-elicitation", "…"]
  },
  "developments": [
    {
      "id": "dev-persistent-agent-memory",
      "title": "Persistent agent memory changes how long-running agents operate",
      "summaryBullets": ["Agents can now write distilled facts to a memory store and recall them in later sessions.", "…"],
      "happenedAt": "2026-09-25T15:36:47.978Z",
      "significance": 0.92, "novelty": 0.85, "credibility": 0.82, "momentum": 0.8,
      "conceptIds": ["agent-memory", "memory-consolidation", "long-horizon-agents", "context-windows", "retrieval-augmented-generation"],
      "claimIds": ["…"], "sourceIds": ["…"], "storylineIds": ["story-context-to-persistent-agents"]
    }
  ]
}
```

**`GET /developments/dev-persistent-agent-memory`** returns `{ development, delta, concepts, claims, sources, storylines }`.
The `delta` maps one-to-one onto the Development Detail sections:
```json
{
  "whatHappened": ["Agents can now write distilled facts to a memory store and recall them in later sessions.", "…"],
  "whyItMattersToYou": "You follow AI agents, and Agent Memory is one of your least certain areas (mastery 0.42, uncertainty 0.44). It bears directly on your goal: “Build a long-running agent that improves over weeks of use”. It also challenges an assumption you've shown before: that agent memory is just a longer context window.",
  "alreadyKnew": ["Agents act through tools by emitting structured calls and reading back the results.", "A model only sees what is inside its context window; …", "…"],
  "whatChanged": ["…", "Nuance: Persistent memory can entrench mistakes: …"],
  "mentalModelChange": "Before: An agent's memory is its context window: … Now: An agent's memory is a curated store it writes to and selectively reads from, …",
  "affectedConcepts": [{ "conceptId": "agent-memory", "reason": "Your biggest gap here (mastery 0.42, uncertainty 0.44). This development changes it directly." }, "…"]
}
```
The response header `x-thinketh-delta-source: claude | deterministic` says
whether the copy is Claude-phrased yet. The first open always returns
immediately; the Claude phrasing is prepared in the background.

**`POST /diagnostics/select`**, body `{ "developmentId": "dev-persistent-agent-memory" }` (or `{ "conceptId": "…" }`, or `{}`):
```json
{
  "question": {
    "id": "dq-agent-memory-persistence",
    "conceptId": "agent-memory",
    "prompt": "An agent finishes a coding session on Monday. On Tuesday a new session starts with an empty context window. …",
    "type": "multiple_choice",
    "choices": ["Monday's full transcript, …", "Distilled facts and preferences written to a memory store, retrieved when relevant to the new task", "…", "…"],
    "expectedConcepts": ["agent-memory", "context-windows", "memory-consolidation"],
    "rationale": "A transfer question: …",
    "selectionDebug": { "uncertainty": 0.438, "importance": 0.9, "interest": 1, "freshness": 1, "prerequisiteCentrality": 1, "priority": 0.3944 }
  },
  "selection": {
    "explanation": "Chosen because Agent Memory is high-uncertainty and central to topics you're following. It also checks a misconception you've shown before.",
    "candidates": [{ "conceptId": "agent-memory", "conceptName": "Agent Memory", "priority": 0.3944, "…": "…" }, "…"]
  }
}
```

**`POST /diagnostics/dq-agent-memory-persistence/answer`**, body `{ "answer": "1" }`.
The answer can be the 0-based choice index, a letter (`"B"`), or the exact choice text. Short answers take free text.
```json
{
  "answer": { "questionId": "dq-agent-memory-persistence", "userId": "demo-user", "answer": "1", "correctness": 1,
              "feedback": "Right. What persists is a curated store of distilled facts, …" },
  "transition": {
    "id": "kst_…", "userId": "demo-user", "conceptId": "agent-memory",
    "before": { "mastery": 0.419, "confidence": 0.534, "uncertainty": 0.438, "evidenceCount": 4, "misconceptionFlags": ["memory-equals-context-window"], "…": "…" },
    "observation": { "kind": "diagnostic_correct", "weight": 1, "correctness": 1, "sourceRef": "diagnostic:dq-agent-memory-persistence", "…": "…" },
    "after": { "mastery": 0.508, "confidence": 0.674, "uncertainty": 0.289, "evidenceCount": 5, "misconceptionFlags": [], "…": "…" },
    "reason": "Updated because you correctly answered a transfer question about what state persists across sessions. Mastery rose 0.42 → 0.51 and uncertainty fell 0.44 → 0.29. Diagnostic evidence is weighted 1.00, versus 0.15 for “Got it”, because it shows understanding rather than reporting it. It also cleared an earlier misconception: that agent memory is just a longer context window.",
    "propagatedChanges": [{ "conceptId": "context-windows", "deltaMastery": 0.036, "deltaUncertainty": -0.024, "reason": "Context Windows is a prerequisite of Agent Memory, so showing Agent Memory is partial evidence for it." }, "…"],
    "createdAt": "…"
  }
}
```
Show values with 2 decimals (`toFixed(2)`) to match the runbook (0.42 → 0.51).

**`GET /knowledge`** returns `{ userId, items: [{ concept, state, level, lastTransition? }], edges }`, sorted by mastery.
`level` is `strong | intermediate | developing | weak`. The seeded persona is
strong on Agent Tool Use, intermediate on MCP, developing on Agent Memory and
weak on Evaluator Architectures.

**`GET /knowledge/agent-memory/history`** returns `{ concept, current, level, transitions }`, oldest first. The seeded persona has prior history (a missed question 18 days ago, then reading), so the timeline isn't empty before the demo.

**`POST /ask`**, body `{ "question": "How is agent memory different from RAG?", "developmentId"?: "…" }`:
```json
{ "answer": "…", "citations": [{ "sourceId": "src-memory-engineering-post", "title": "Giving long-running agents a memory that survives the session" }],
  "relatedConceptIds": ["agent-memory", "…"], "memoryUsed": [{ "id": "mem-pref-analogies", "kind": "preference", "content": "Prefers systems analogies …", "createdAt": "…" }] }
```

**`POST /visualize`** and **`POST /make-it-stick`**, body `{ "conceptId"?: "…", "developmentId"?: "…" }`
return a `DiagramSpec` (nodes grouped `before | after | shared`, edges, caption) and a `MemoryAid`.
Agent Memory has hand-authored seeded versions, so the demo path is deterministic.

**`POST /voice/session`** returns a `VoiceSession`:
```json
{ "mode": "elevenlabs" | "transcript_fallback",
  "conversationToken": "…", "agentId": "…",
  "dynamicVariables": { "user_name": "Jordan", "brief_date": "2026-09-25", "brief_minutes": 11, "brief_script": "Good morning, Jordan. …" },
  "fallbackTranscript": ["Good morning, Jordan. You have about 11 minutes. …", "First: …", "…"] }
```
With `mode: "elevenlabs"`, call `startSession({ conversationToken, dynamicVariables })`
from `@elevenlabs/react-native`. This needs an Expo **development build**; it
won't run in Expo Go. Otherwise render `fallbackTranscript`. The agent's
prompt/first message in the ElevenLabs dashboard should reference
`{{brief_script}}` and `{{user_name}}`.

## What's real vs fallback

| Role | Live when | Fallback |
|---|---|---|
| Claude (`claude-opus-5`, structured outputs + Zod) | `ANTHROPIC_API_KEY` | deterministic templates / seeded content |
| Backboard (memory) | `BACKBOARD_API_KEY` | in-process memory seeded with persona preferences |
| MongoDB Atlas (corpus + search) | `MONGODB_URI` (+ `VOYAGE_API_KEY` for vectors) | seeded corpus + lexical search |
| Tiger Data (temporal history) | `TIGER_DATABASE_URL` | in-process store (writes always go local too) |
| Supabase (auth, flags, integration ids) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | demo persona, env-derived flags |
| ElevenLabs (voice) | `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` | transcript |

Every sponsor call goes through `adapters/guard.ts`: timeout → error mapping →
JSON log line (`adapter.fallback`) → fallback. `GET /health` shows which
adapters are live and their last error.

## Intelligence model

**Knowledge state** (`src/engine/knowledgeState.ts`, `observations.ts`). A transparent heuristic estimator, not Bayesian inference.

```
U_eff  = min(0.95, U + 0.004 × daysSinceLastObserved)         staleness
Δm     = 0.35 × U_eff × weight × (target − m)
target = correctness                (diagnostics: demonstrated)
       = ceiling                    (reading / self-report: pulls up only, never past it)
U'     = max(0.05, U_eff × (1 − information))
```

| Observation | weight | information | ceiling |
|---|---|---|---|
| diagnostic_correct / _incorrect | 1.0 | 0.34 / 0.30 | none (demonstrated) |
| diagnostic_partial | 0.8 | 0.25 | none |
| misconception_detected | 0.6 | 0.15 | none |
| already_knew | 0.25 | 0.05 | 0.65 |
| got_it | 0.15 | 0.03 | 0.60 |
| explained | 0.10 | 0.02 | 0.55 |
| revisited / saved / viewed | 0.08 / 0.06 / 0.05 | ≤ 0.02 | 0.50 |
| asked_followup | 0.05 | −0.03 (adds uncertainty) | 0.50 |

- `confidence` is the user's self-assessed confidence, kept separate from `mastery` so over- and under-confidence stay visible.
- Demonstrated evidence propagates one hop through the concept graph. Success on a concept counts as partial evidence for its prerequisites (0.5 × edge weight). Failure on a prerequisite weakens the concepts that depend on it. Related, supports and part_of edges pass 0.25 × edge weight. Propagated changes are stored as their own transitions, so each concept's history shows them.
- Every transition carries `before`, `observation`, `after`, `reason`, `propagatedChanges` and a timestamp.

**Diagnostic selection** (`src/engine/selection.ts`)
`priority = uncertainty × importance × interest × freshness × prerequisiteCentrality`.
Each factor is returned in `selectionDebug`, along with the top five candidates and a plain-English explanation.
- freshness is 1.0 inside the development being read; otherwise it decays with a 7-day half-life.
- centrality is weighted graph degree (prerequisite out-edges count 1.5×), normalized to [0.5, 1].
- Within the chosen concept, unanswered questions that probe a known misconception come first. Answer keys never leave the server.

**Delta engine** (`src/engine/delta.ts`). This is deterministic.
- *Already knew*: established claims on background concepts where mastery ≥ 0.6.
- *What changed*: the development's new claims, plus a nuance/contradiction claim.
- *Why it matters*: the concept with the biggest personal gap (importance × interest × (1 − mastery)), plus goals and known misconceptions.

Claude may rephrase the text, but it must keep the same structure and concept
ids (enforced), and it never sees or sets numbers it could change.

**Brief** (`src/engine/brief.ts`). "No new information = no card." A development is dropped as `already_understood` when it has no new claims, or when it is low-novelty and the user is strong on every concept it touches. The rest are ranked by significance × novelty × personal gap.

## Seed data

`src/seed/`: persona "Jordan", 9 concepts, 10 edges, 13 sources, 13 claims, 7
candidate developments (6 shown, 1 filtered out), 1 storyline, 10 diagnostics,
and seeded memories. All sources and publishers are **illustrative demo data**,
not real announcements. Timestamps are relative to server start, so the brief
always reads as "today".

## Sponsor setup

- **Supabase**: `supabase db push` applies `supabase/migrations/…_thinketh_init.sql`: profiles (RLS: own row), feature_flags (read: authenticated), integration_ids (service role only). Deploy the API with `supabase functions deploy api` and set secrets with `supabase secrets set --env-file .env`.
- **Tiger Data**: `npm run seed:tiger --workspace @thinketh/intelligence` applies `infra/tiger.sql` (4 hypertables, plus a `daily_concept_mastery` continuous aggregate) and seeds world-state events.
- **MongoDB Atlas**: `npm run seed:mongo --workspace @thinketh/intelligence` upserts the corpus and creates the Search / Vector Search indexes (see `infra/mongo.md`).
- **Backboard**: set `BACKBOARD_API_KEY`. One assistant is created per user and its id is stored in Supabase `integration_ids` (or pin one with `BACKBOARD_ASSISTANT_ID`). Thinketh writes preferences, misconceptions and questions as memories and recalls them for Ask and delta phrasing.
- **ElevenLabs**: create an agent that uses `{{brief_script}}`, then set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.
