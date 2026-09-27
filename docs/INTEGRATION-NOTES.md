# Integration notes: Stefen → Nadani

Written for Nadani and her Claude Code sessions. It explains the changes made on `stefen-integration-mobile` that touch backend-owned or shared code. Read this before editing `packages/contracts` or `packages/intelligence/src/contracts.ts`.

## 2026-09-25: canonical API envelopes moved to `packages/contracts`

This follows JOINT-INTEGRATION-CHECKLIST.md step 2: "Move response envelopes into `packages/contracts`".

### What changed in code you own

`packages/intelligence/src/contracts.ts` was changed in commit `4247387`.
- **Removed:** the envelope and domain definitions that it used to declare itself: `BriefResponse`, `DevelopmentDetailResponse`, `DiagnosticSelectResponse`, `KnowledgeResponse`, `ConceptHistoryResponse`, `AskResponse`, `VoiceSession`, `Storyline`, `MemoryItem`, `SelectionDebug`, `KnowledgeLevel`, and the request schemas.
- **Where they are now:** `packages/contracts/src/api.ts`, **copied unchanged**. The file still does `export * from "@thinketh/contracts"`, so every name your code imports from `../contracts.ts` still resolves, with the same shape.
- **Kept in your file:** `PersonaInterest`, `PersonaProfile`, `ObservationKindSchema`, `ObservationKind`, and `PropagatedChange`. These are backend-only.
- **Verified after the change:** `tsc` is clean, `vitest` passes 56/56, `npm run start` boots, and every route returns 200.

### What changed in `packages/contracts`
- **`src/domain.ts`:** the old `src/index.ts` (the 05-data-contracts.md types), unchanged.
- **`src/api.ts`:** the envelopes above.
- **`src/index.ts`:** re-exports both. Relative imports use a `.ts` extension, because Node type-stripping and Deno both need it. The Deno import map in `supabase/functions/api/deno.json` still points at `index.ts`.
- **Two OPTIONAL fields were added.** Your server doesn't need to send them, and its response validation still passes without them:
  - `BriefResponse.sources?: Source[]`: publisher names on Today.
  - `AskResponse.sections?: { sourcesSay, thinkethInfers, youAlreadyUnderstand, stillUncertain }`: the design spec's trust layering.

### Rules going forward
- **Don't redefine envelopes in `packages/intelligence`.** Change them in `packages/contracts/src/api.ts` through the shared-contract process (SHARED-INTEGRATION-RULES.md): make an isolated commit and tell Stefen.
- **Additive, optional fields are safe.** Renaming, removing, or making a field required will break the mobile app's validation. Every response is Zod-parsed on the phone.

## 2026-09-25: mobile follow-ups after `98b5e28` (optional brief fields)

- **Today prefers your new fields:**
  - It uses `understoodDevelopmentIds` and `recentTransitions` from `GET /brief/today` when present. It still filters them to today, and it still counts only real mastery gains of 0.01 or more.
  - If those fields are missing, it derives the same values from `/knowledge`.
  - The golden check now also asserts that your server's `understoodDevelopmentIds` includes the hero after the correct answer. The check passes 23/23 against the local API.
- **New dev-only demo panel:**
  - It opens with a long press on the Thinketh mark on Today, and calls `POST /demo/reset` and `GET /health`.
  - `/health` is parsed leniently in `apps/mobile/src/api/devtools.ts`, since it isn't part of the product contract. The app relies on each adapter having `configured`, `calls`, and `fallbacks`, plus the optional `lastOkAt`, `lastErrorAt`, and `lastError`.
  - Status is shown as FALLBACK (not configured), LIVE · untested (no calls yet), DEGRADED (the last call fell back), or LIVE.
- **Reset contract used by the panel:** after `POST /demo/reset`, `GET /knowledge/agent-memory/history` → `current` should be about 0.42 mastery and 0.44 uncertainty, with the `memory-equals-context-window` misconception flag. That's verified against the local API.

## 2026-09-27: real identity, server profiles, durable state, discovery, agent-prepared lessons

Branch `stefen-earn-the-promise`. Contract changes are additive (commit `5e20ee0`, plus `PreparedLesson.status: "preparing"` in the backend commit).

### Identity (breaking for anything that relied on arbitrary user headers)
- `Authorization: Bearer <Supabase access token>` → the verified auth user id (`kind: "account"`). A token that fails verification is **401**, never downgraded.
- `x-thinketh-user-id` selects only a **seeded demo persona** (`demo-user`, `nadani`) while `THINKETH_DEMO_IDENTITIES` is on (default). Any other id is **401** unless `THINKETH_TRUST_USER_HEADER=true` (development only).
- No identity → `demo-user` (demo identities on), so the current app and the golden check keep working unchanged.
- `THINKETH_DEMO_ALIAS_PREFIX` (e.g. `audit-`): rehearsal clones of the demo persona with isolated history. `scripts/demo-audit/preflight.mjs` sets it.
- `POST /demo/reset` resets **only** seeded personas and aliases; any other identity gets 403.

### New users start empty
- Every concept starts at the no-evidence prior: mastery 0.20, uncertainty 0.70, and no evidence.
- There is no seeded history and there are no seeded memories.
- Each new user gets their own Backboard assistant; the pinned `BACKBOARD_ASSISTANT_ID` now belongs to `demo-user` only.
- Briefs for accounts use only **discovered** developments, never the illustrative seed corpus.
- Ask and lessons for accounts are grounded only in discovered claims.

### Profiles
- `GET /profile` returns `{ profile | null, identity, editable, coverage }`. `PUT /profile` takes `{ displayName, interests, goals, teaching }`.
- Storage:
  - Verified users go to Supabase `public.profiles`: `display_name`, `interests` (jsonb list of topics), `goals`, and `explanation_preferences` (the teaching choices). No migration was needed.
  - The same profile is also written to the durable store.
- Demo personas keep their fixed profile (PUT returns 403).
- What the profile drives:
  - Brief ordering: each interest maps to concepts.
  - Delta depth: "Concise explanations" keeps two items per section.
  - The default Ask mode.
  - Resource analysis and teaching preferences.
  - The voice script.
- It never changes knowledge state.

### Durable state
- `store/docStore.ts` writes to the MongoDB Atlas collections `app_*`, mirrored to local JSON in `THINKETH_DATA_DIR`. The in-process Maps are caches.
- What is stored:
  - Resources, with their excerpts and lessons, scoped to their owner.
  - Generated and transfer diagnostics.
  - Playground rooms.
  - Operation records.
  - Profiles.
  - The discovered corpus and discovery runs.
- Without Tiger, the local knowledge history is stored too.
- A resource left "processing" by a restart resumes once. After that it fails with "Reading was interrupted. Save it again to retry.", and saving it again retries it in place under the same id.
- `POST /diagnostics/:id/answer` accepts an **`Idempotency-Key`** header: a retry returns the recorded result. The app sends one per submit.
- Playground answers use operation `room:<id>:<questionId>` and run under a per-room lock. Concurrent submissions give one 200 and one 400, and exactly one transition.

### Discovery
- Sources: OpenAI News, Google DeepMind, Hugging Face, the arXiv API, and MCP releases (`src/discovery/sources.ts`).
- How to run it:
  - `npm run discover -w @thinketh/intelligence`
  - `POST /admin/discovery/run` (needs `x-thinketh-admin-token`)
  - `GET /discovery/runs`
- `BriefResponse.pipeline` is new:
  - `mode: "live"` carries the recorded run's accounting. For live briefs, `skippedCount`/`skippedBreakdown` are the run's **source items**, and `developmentsAlreadyUnderstood` is reported separately.
  - `mode: "demo_fixture"` carries the demo's illustrative counts (unchanged numbers, now labeled).
  - `mode: "none"` means no run has happened yet.
- New skip keys: `outdated`, `undated`, `over_budget`.
- `Development.discoveredAt` is new; `happenedAt` stays the publication time.

### Playground
- On `teacher_assigned`, the teacher's agent prepares `teaching.prepared`:
  - `status` is `preparing`, then `prepared` or `unavailable`.
  - Each point cites sources. It also carries `whyRelevant`, `adaptedTo`, and `context` (what the agent was allowed to use).
  - Events: `lesson_prepared` / `lesson_unavailable`, with actor `agent:<teacherId>`.
- `POST /playground/rooms/:id/explain` takes `source: "own" | "agent" | "agent_edited"`, recorded as `teaching.explanationSource`.
- `POST /playground/rooms/:id/share { savedSources }` is the one sharing choice beyond the snapshot. When on, the agent may use the titles, links and summaries of the teacher's saved sources on that concept. It is off by default and emits the `sharing_changed` event.
- `teaching.deliveredAt` is set when the learner's device has the explanation in front of it. That means encountered, not understood; only `transfer.verified` means demonstrated.

## 2026-09-27: agent exchange (Playground)

Branch `stefen-agent-exchange`. Everything below is additive.

- **Room fields:**
  - `exchangeAvailability { available, reason, mode, conceptId, teacherId, learnerId }`: the teaching direction comes from the collaborative delta. It falls back to a shared exploration of a shared gap, or gives a reason why nothing can start.
  - `exchange`: status, messages, actions (who did what: Muse, the planner, Thinketh or Claude), sources read (as an extracted claim, a saved summary, or an earlier takeaway), the takeaway, its check, the saved takeaway id, and the outcome.
  - `plan.items[].attempted`: a teaching whose check wasn't verified is attempted, not done.
- **Routes:**
  - `POST /playground/rooms/:id/exchange` starts it (idempotent).
  - `POST …/exchange/advance { step }` runs one step (stale steps are ignored).
  - `…/exchange/stop`, `…/exchange/close`.
  - `…/exchange/check` asks the learner's own application question; at most two, and they're different.
  - `GET /takeaways?conceptId=` and `GET /takeaways/:id`: owner only.
- **New room events:** `exchange_started`, `retrieval_started`/`_completed`, `agent_message`, `clarification_requested`, `explanation_revised`, `takeaway_checked`, `takeaway_saved`, `exchange_completed`/`_stopped`/`_failed`.
- **Muse:** needs `MUSE_API_KEY` and `MUSE_MODEL`; without them `exchangeAvailability.available` is false. Limits: `THINKETH_EXCHANGE_MAX_MESSAGES` (6), `_MAX_TOOL_CALLS` (12), `_DEADLINE_MS` (300000) and `_CALL_TIMEOUT_MS` (25000).
- **Evidence:** nothing in an exchange observes knowledge state. Only the learner's graded answer to `exchange/check` does.
- **Client:** it must accept a room whose exchange moved on at the same `seq` (`lib/roomSync.ts`); coordinator steps don't emit room events.

## Backend behaviours the mobile app now relies on

If you change any of these, the app needs a matching change:

1. **Propagated transitions keep `observation.sourceRef` starting with `"propagated:"`.** The app uses this to show "Just improved" and count "understood" only for the concept the user actually answered on. Without it, every prerequisite would light up.
2. **`items[].lastTransition` in `GET /knowledge`.** Today's "Your knowledge changed today" and "N of 6 understood" are derived from it. A development counts as understood when there's a direct `diagnostic_correct` transition today on its `conceptIds[0]`. If you'd rather own this, add `understoodDevelopmentIds` to the brief and the app will switch to it.
3. **`knowledgeLevel()` thresholds (0.75 / 0.55 / 0.40)** are mirrored in `apps/mobile/src/lib/knowledge.ts` → `levelOf()`. The app uses it only for transitions, which don't carry a `level`. Elsewhere it uses the server's `level`.
4. **`skippedBreakdown` keys** are mapped to labels. The known keys are `duplicate`, `low_signal`, `already_understood`, `minor_update`, and `low_confidence`. Any other key is shown humanized.
5. **Diagnostic feedback** may start with a short verdict ("Right.", "Not quite."). The app turns it into the heading. Keep it short.
6. **User header:** in demo mode the app sends `x-thinketh-user-id: demo-user`; in personal mode it sends `Authorization: Bearer <Supabase access token>` instead (see 2026-09-27).
7. **`POST /demo/reset`** is used by the golden check. Keep `THINKETH_ALLOW_RESET` on in dev.

## Check your changes against the app

After any backend change that touches responses, run:

```sh
npm run dev:api
API_URL=http://localhost:8787 npm run check:golden -w mobile
```

It runs Today → Development → Diagnostic → Transition → Mind → History through the app's own HTTP client with **no mock fallback**. It validates every response against `packages/contracts` and checks the runbook numbers (0.42→0.51, 0.44→0.29). The last run passed 22/22.

## Open asks for Nadani

- **Optional:** send `sources` in `GET /brief/today`.
- **Optional:** send `sections` in `POST /ask`.
- **Resolved: 143 filtered.** The backend seed now uses the same breakdown as the mobile fixtures (68 duplicate, 31 low signal, 22 already understood, 15 minor, 7 low confidence), so a fallback never changes the number.

Full endpoint-by-endpoint notes are in `docs/MOBILE-API-EXPECTATIONS.md`.
