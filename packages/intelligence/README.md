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
npm run discover -w @thinketh/intelligence   # one bounded discovery run (idempotent)
npm run typecheck
```

Copy `.env.example` to `.env` at the repo root to turn on sponsor integrations.

## How the mobile app calls it (for Stefen)

**Base URL**
- Local / same Wi-Fi: `http://<nadani-laptop-ip>:8787`
- Supabase Edge Function (once deployed): `https://<project>.supabase.co/functions/v1/api`

Paths are identical on both.

**Auth**
- `Authorization: Bearer <supabase access token>`: the verified user. An invalid or expired token is a 401.
- `x-thinketh-user-id: demo-user | nadani`: a seeded demo persona (explicit and resettable). Any other id is a 401 unless `THINKETH_TRUST_USER_HEADER=true` (development only).
- No identity at all: the demo persona, while `THINKETH_DEMO_IDENTITIES` is on (the default).
- New users start with no evidence (every concept uncertain), no seeded history and no seeded memories. A `userId` in POST bodies is ignored.

**Types**: the canonical request/response envelopes live in `@thinketh/contracts`
(`packages/contracts/src/index.ts`, section "Canonical API envelopes"). Every
response is validated against those schemas on the server before it is sent,
and `test/api.test.ts` parses every endpoint through them.

**Errors**: `{ "error": { "code": "not_found" | "bad_request" | "unauthorized" | "internal", "message": "…" } }`.
No stack traces are ever returned.

### Integration order

| # | Endpoint | Response type |
|---|---|---|
| 1 | `GET /brief/today` | `TodayResponse` |
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
| – | `GET` / `PUT /profile` | `ProfileResponse`: learner preferences for the verified identity. Preferences are not evidence. |
| – | `POST /demo/reset` | `{ ok: true }`: resets a seeded demo persona for rehearsals. Any other identity gets a 403. |
| – | `POST /admin/discovery/run`, `GET /discovery/runs` | Run the discovery pipeline (admin token); trace recent runs. |
| – | `GET /health` | Adapter `status` (`live` / `degraded` / `unverified` / `fallback`) and last error. `?probe=1` checks sponsors first. |

### Examples (real responses from the seeded demo, trimmed with …)

**`GET /brief/today`** returns `{ brief, developments, sources, concepts, understoodDevelopmentIds, recentTransitions }`:
```json
{
  "brief": {
    "date": "2026-09-25",
    "meaningfulCount": 6, "majorCount": 3, "estimatedMinutes": 11,
    "skippedCount": 143,
    "skippedBreakdown": { "duplicate": 68, "low_signal": 31, "already_understood": 22, "minor_update": 15, "low_confidence": 7 },
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
  ],
  "sources": ["…every source referenced by the developments…"],
  "concepts": ["…all concepts…"],
  "understoodDevelopmentIds": [],
  "recentTransitions": []
}
```
After the diagnostic in the golden loop, `understoodDevelopmentIds` becomes `["dev-persistent-agent-memory"]` and `recentTransitions[0]` is that transition (newest first, primary transitions only).

**`GET /developments/dev-persistent-agent-memory`** returns `{ development, delta, concepts, claims, sources, storylines }`.
`delta.affectedConcepts[0]` is the primary concept. The `delta` maps one-to-one onto the Development Detail sections:
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
    "id": "dq-agent-memory-persistence::dev-persistent-agent-memory",
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

Treat `question.id` as opaque and send it back unchanged (URL-encoded). When selected from a development it carries that development, which is how Today knows what's "understood".

**`POST /diagnostics/:id/answer`**, body `{ "answer": "<exact choice text>" }`.
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

**`GET /knowledge`** returns `{ userId, items: [{ concept, state, level, lastTransition? }], edges, recentTransitions }`. Items are sorted by mastery; `recentTransitions` is newest first ("Just improved" = `after.mastery > before.mastery`).
`level` is `strong | intermediate | developing | weak`. The seeded persona is
strong on Agent Tool Use, intermediate on MCP, developing on Agent Memory and
weak on Evaluator Architectures.

**`GET /knowledge/agent-memory/history`** returns `{ concept, current, level, transitions }`, oldest first. The seeded persona has prior history (a missed question 18 days ago, then reading), so the timeline isn't empty before the demo.

**`POST /ask`**, body `{ "question": "How does agent memory persist across sessions?", "developmentId"?: "…" }`. The answer is layered for trust; empty arrays hide their section:
```json
{
  "question": "How does agent memory persist across sessions?",
  "sourcesSay": ["Agents can now write distilled facts to a persistent memory store and recall them in later sessions, …", "…"],
  "thinkethInfers": ["The practical shift: An agent's memory is a curated store it writes to and selectively reads from, …"],
  "youAlreadyUnderstand": ["A model only sees what is inside its context window; … (strong)"],
  "stillUncertain": ["Sources push back: Persistent memory can entrench mistakes: …"],
  "citedDevelopmentIds": ["dev-persistent-agent-memory"],
  "citedConceptIds": ["agent-memory", "long-running-agents", "retrieval", "context-windows"],
  "memoryUsed": [{ "id": "mem-pref-analogies", "kind": "preference", "content": "Prefers systems analogies …", "createdAt": "…" }]
}
```
`sourcesSay`, `youAlreadyUnderstand` and `stillUncertain` are assembled deterministically (verbatim claims and the knowledge state). Claude only writes `thinkethInfers`.

**`POST /visualize`** and **`POST /make-it-stick`**, body `{ "conceptId"?: "…", "developmentId"?: "…" }`
return a `DiagramSpec` (nodes grouped `before | after | shared`, edges, caption) and a `MemoryAid`.
Agent Memory has hand-authored seeded versions, so the demo path is deterministic.

**`POST /voice/session`**, body `{ "briefDate"?: "…" }`, returns a `VoiceSession`:
```json
{ "sessionId": "voice_…", "mode": "elevenlabs" | "transcript_fallback",
  "conversationToken": "…" | null, "agentId": "…" | null, "expiresAt": "…",
  "dynamicVariables": { "user_name": "Stefen", "brief_date": "2026-09-25", "brief_minutes": 11, "brief_script": "Good morning, Stefen. …" },
  "fallbackScript": ["Good morning, Stefen. You have about 11 minutes. …", "First: …", "…"] }
```
When `conversationToken` is set, call `startSession({ conversationToken, dynamicVariables })`
from `@elevenlabs/react-native`. This needs an Expo **development build**; it
won't run in Expo Go. Otherwise play `fallbackScript`. The agent's prompt/first
message in the ElevenLabs dashboard should reference `{{brief_script}}` and `{{user_name}}`.

## What's real vs fallback

| Role | Live when | Fallback |
|---|---|---|
| Claude (`claude-opus-5`, structured outputs + Zod) | `ANTHROPIC_API_KEY` | deterministic templates / seeded content |
| Backboard (memory) | `BACKBOARD_API_KEY` | in-process memory seeded with persona preferences |
| MongoDB Atlas (corpus + search) | `MONGODB_URI` (+ `VOYAGE_API_KEY` for vectors) | seeded corpus + lexical search |
| Tiger Data (temporal history) | `TIGER_DATABASE_URL` | in-process store (writes always go local too) |
| Supabase (auth, profiles, flags, integration ids) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | demo persona, env-derived flags; profiles in the local store |
| App state (resources, rooms, profiles, runs, corpus) | `MONGODB_URI` (collections `app_*`) | JSON files in `THINKETH_DATA_DIR` (always written as a mirror) |
| Discovery (5 official feeds/APIs) | always (network) | a failed source is recorded; the stored corpus is kept |
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

`src/seed/`: persona "Stefen", 9 concepts (ids aligned with the mobile Mind layout where they overlap), 10 edges, 13 sources, 13 claims, 7
candidate developments (6 shown, 1 filtered out), 1 storyline, 10 diagnostics,
and seeded memories. All sources and publishers are **illustrative demo data**,
not real announcements. Timestamps are relative to server start, so the brief
always reads as "today".

## Sponsor setup

- **Supabase**: `supabase db push` applies `supabase/migrations/…_thinketh_init.sql`: profiles (RLS: own row), feature_flags (read: authenticated), integration_ids (service role only). Deploy the API with `supabase functions deploy api` and set secrets with `supabase secrets set --env-file .env`.
- **Tiger Data**: `npm run seed:tiger --workspace @thinketh/intelligence` applies `infra/tiger.sql` (4 hypertables, plus a `daily_concept_mastery` continuous aggregate) and seeds world-state events.
- **MongoDB Atlas**: `npm run seed:mongo --workspace @thinketh/intelligence` upserts the corpus and creates the Search / Vector Search indexes (see `infra/mongo.md`).
- **Backboard**: set `BACKBOARD_API_KEY` and `BACKBOARD_ASSISTANT_ID`. Without a pinned id, one assistant is created per user and stored in Supabase `integration_ids`. Memory lives on the assistant, so it carries across every thread.
  - Recall (Ask, delta phrasing, Make It Stick) searches the assistant's memories: retrieval only, no writes. Items come back in `memoryUsed` with `source: "backboard"` (`"local"` when on the fallback).
  - Thinketh-authored facts (a detected misconception, a question asked) are written directly with their kind.
  - Each Ask question is also posted to the user's thread with `memory: "Auto"` in the background, so Backboard extracts preferences and topics itself.
  - Backboard never stores mastery numbers. Those stay in the knowledge-state engine.
  - `npm run verify:backboard --workspace @thinketh/intelligence` proves cross-thread recall. Thread A (Auto) states a preference and a misconception. Thread B, a new thread on the same assistant (Readonly), must retrieve both, and `/ask` must return them. Add `-- --fresh` to run against a new, empty assistant. With no `BACKBOARD_ASSISTANT_ID` set, it creates one and prints the id to pin.
  - `GET /health?probe=1` checks Backboard before answering. Each adapter's `status` is `live | degraded | unverified | fallback`.
- **ElevenLabs**: create an agent that uses `{{brief_script}}`, then set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.
