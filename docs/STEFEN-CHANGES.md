# Stefen: recent changes (sync point with Nadani)

Branch: `stefen-demo-readiness`, merged into `main`. This lists what changed on my side since PR #4, so we can compare it with Nadani's branch and see what's still missing.

## 1. Mobile demo readiness (commit `6ce9867`)
- Dev-only demo controls in the app. They're hidden in production builds.
- The knowledge-transition numbers (previous state → resulting state) are shown more prominently.
- The app now uses server-side progress when the backend returns it, and falls back to local state otherwise.

## 2. Backboard: live persistent memory (`packages/intelligence`)
- **Stable assistant.** Memory lives on one Backboard assistant, so it carries across threads. `BACKBOARD_ASSISTANT_ID` pins it for the demo persona. Without a pinned id, the adapter creates one assistant per user and stores its id in Supabase `integration_ids`.
- **Recall** (`src/adapters/memory.ts`) only reads; it never writes. It runs two searches: one for the query, and a standing one for "explanation preferences and misconceptions". It removes duplicates and puts preferences first. Backboard's extracted memories carry no Thinketh kind, so `inferMemoryKind()` infers one from the text.
- **Remember** writes facts that Thinketh produces (a detected misconception, a question asked), tagged with their kind.
- **Observe** (new, optional on `MemoryProvider`): each Ask question is also posted to the user's Backboard thread with memory `"Auto"`, so Backboard extracts preferences and topics itself. It runs in the background with a 45s timeout, so the UI never waits on it (`service.ts` → `observeInBackground`).
- **Probe** (new, optional on `MemoryProvider`): a cheap authenticated call. `GET /health?probe=1` runs it before answering.
- Backboard never stores mastery numbers. Those stay in the deterministic knowledge-state engine.
- New helpers: `createAssistant`, `createThread`, `sendMessage` (form-encoded, memory mode), `waitForMemoryOperation`, `searchMemories`.
- Optional model settings: `BACKBOARD_LLM_PROVIDER` and `BACKBOARD_MODEL`.

## 3. Health status (`src/adapters/guard.ts`, `src/api/app.ts`)
- `/health` now reports a `status` for each adapter:
  - `live`: the last call succeeded.
  - `degraded`: the last call failed, so the fallback is being served.
  - `unverified`: configured, but no calls yet.
  - `fallback`: not configured.
- `?probe=1` checks the configured sponsors first. No secrets are returned.

## 4. Contracts (`packages/contracts/src/api.ts`)
- `MemoryItem.source?: "backboard" | "local"`. It's optional and additive, so nothing breaks. The app can use it to show where a memory came from (live Backboard or the local fallback).

## 5. Verification script
- `npm run verify:backboard --workspace @thinketh/intelligence` proves memory persists across threads. It passes only if all of these hold:
  - Thread A (memory `Auto`) states a preference and a misconception.
  - Thread B is a new thread on the same assistant (memory `Readonly`), and it retrieves both.
  - `/ask` returns them in `memoryUsed` with `source: "backboard"`.
  - `/health` reports Backboard as `live`.
- Add `-- --fresh` to run it against a new, empty assistant. If `BACKBOARD_ASSISTANT_ID` isn't set, the script creates an assistant and prints the id to pin.

## 6. Supabase
- Created and linked the `thinketh` Supabase project (ref `mbfogczuvxqkrykwlrcp`, us-east-2).
- The `20260926000000_thinketh_init.sql` migration is applied: `profiles`, `feature_flags` and `integration_ids` all respond on the REST API.
- `supabase/.temp/` (the CLI's local link state) is now gitignored.
- Not yet verified from my side: whether `supabase functions deploy api` and `supabase secrets set` have been run.

## 7. Env / secrets
- `.env.example` only has placeholders, plus the new Backboard fields. Real keys go in the gitignored repo-root `.env`, which every `npm run` script already loads.
- To get the keys, ask Stefen directly. Never commit them.

## Tests
- `npm run typecheck`: clean for intelligence and mobile.
- `npm test --workspace @thinketh/intelligence`: 72/72 passing. `test/adapters.test.ts` adds coverage for the Backboard recall, observe and health status changes.

## Open items to reconcile with Nadani
- [ ] Pin `BACKBOARD_ASSISTANT_ID` (run `verify:backboard` once and copy the printed id), then confirm the run passes.
- [ ] Deploy the Supabase edge function (`supabase functions deploy api`) and set its secrets.
- [ ] Confirm MongoDB Atlas and Tiger Data are seeded (`seed:mongo`, `seed:tiger`) and show `live` in `/health?probe=1`.
- [ ] ElevenLabs agent: check that `ELEVENLABS_AGENT_ID` is the real agent id. It's currently the placeholder `thinketh`.
- [ ] Run the golden check against the live backend: `API_URL=… npm run check:golden -w mobile`.
- [ ] Physical-phone pass of the whole golden path: Today → Development → Delta → Diagnostic → State update → Mind.
