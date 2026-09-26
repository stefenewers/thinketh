# Nadani: action items from Stefen's side (2026-09-25)

This covers the Supabase Edge Function work. It's what you need to do, review, or know so we stay in sync. Stefen's earlier changes are in `docs/STEFEN-CHANGES.md`. Temporary security trade-offs to undo after the event are in `docs/POST-HACKATHON-CLEANUP.md`.

## Do now

1. **Open MongoDB Atlas Network Access to `0.0.0.0/0`**, temporarily. Supabase Edge Functions don't use fixed outgoing IPs, so Atlas rejects them now. The error looks like `received fatal alert: InternalError`. Mongo can't go `live` on the deployed API until this is done. It's on the cleanup list for after HackGT.
2. **Review and merge the branch `stefen-edge-tiger`.** It changes backend files you own. Details are below.
3. **After you merge, tell Stefen**, so he can redeploy and run `./supabase/deploy-remote.sh`. That script sets the secrets, deploys, and verifies everything.
4. **ElevenLabs:** the `ELEVENLABS_AGENT_ID` we have is `thinketh`, and ElevenLabs returns 404 for it. It's not a real agent id. Send the real one, or we cut voice. The `voice` feature flag is off in Supabase right now.
5. **Claude live phrasing** (optional): `ANTHROPIC_API_KEY` isn't set on the Edge Function, so it runs the deterministic fallback. Send the key if we want Claude live.

## Review: branch `stefen-edge-tiger` (commit `b4df0c8`)

Typecheck and lint pass, and 80/80 tests pass. The files touched are `adapters/guard.ts`, `adapters/temporal.ts`, `adapters/registry.ts`, `config.ts`, `service.ts` and the tests.

- **Circuit breaker** (`guard.ts`): this keeps answer requests under the mobile 8s timeout.
  - The first remote golden run failed at the answer step. A failing Tiger added a 2.5s wait on every call, and the answer step chains several calls.
  - Now, once a sponsor call fails or times out, `guarded()` skips that adapter for 30s. For TLS certificate errors, it skips it for the life of the instance.
  - A success, from a real call or a probe, closes the circuit again.
  - `/health` adapters gain `circuit` (`closed | open | open_permanent`), `retryAt` and `skipped`. An open circuit reports `status: "degraded"`.
  - `probeAdapters()` reports a permanently failed adapter as `error` (`skipped (serving local fallback): …`) instead of calling it again.
  - Tests: health state is module-global, so `adapters.test.ts` now calls `resetCircuits()` in `beforeEach`. Do the same in any new tests that make an adapter fail.
  - One changed test: "keeps writes locally when Tiger fails…". After a failed write, the next read now skips Tiger (local only). Reads merge both stores again once the circuit closes.
- **Tiger TLS bypass** (HACKGT DEMO ONLY):
  - The problem: Timescale's server certificate is marked `CA:TRUE`. Deno, the runtime behind Supabase Edge Functions, rejects that (`invalid peer certificate: CaUsedAsEndEntity`). Node accepts it, which is why Tiger works on your laptop.
  - The fix: `TIGER_TLS_INSECURE=true` makes the Tiger connection use `ssl: { rejectUnauthorized: false }`. It's off by default and applies to Tiger only. The connection stays encrypted, and Mongo, Supabase, Backboard, Claude and ElevenLabs are unchanged. The server logs a `tiger.tls_insecure` warning whenever the flag is on.
  - **Not yet proven on Supabase Edge.** We still need to confirm that Deno's `npm:postgres` respects `rejectUnauthorized: false`. If Tiger still shows `CaUsedAsEndEntity` after the redeploy, the bypass had no effect. The breaker still keeps requests fast, and we fall back to showing Tiger live from Node (your evidence script).
- **Deploy and verify scripts** (`supabase/deploy-remote.sh`, `supabase/verify-remote.mjs`). `deploy-remote.sh` reads the gitignored `supabase/.env.remote`, then:
  - sets the secrets
  - deploys with `--no-verify-jwt`
  - checks `/health?probe=true`
  - times the diagnostic answer against the 8s limit
  - checks that the answer's transition was written to Tiger and read back
  - runs the golden loop

## Current deployment state

- **Public API:** `https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api`. It's deployed from `main` as of `27c0c86`, with JWT verification off.
- **Remote secrets** (names only): `BACKBOARD_API_KEY`, `BACKBOARD_ASSISTANT_ID`, `MONGODB_URI`, `TIGER_DATABASE_URL`, `THINKETH_DEMO_USER_ID`, `THINKETH_ALLOW_RESET`. The `SUPABASE_*` values are provided automatically. `TIGER_TLS_INSECURE=true` gets set by the next `deploy-remote.sh` run.
- **Backboard assistant:** pinned to `ab52d134-07e0-4231-a5da-c5eb62e7549b`. That's your `thinketh-demo-user` assistant, with the 5 seeded persona memories. Use the same id in your `.env` so we share one memory.
- **Last remote run, before the branch above:**

  | Service | Status | Reason |
  |---|---|---|
  | Backboard | live | |
  | Supabase | live | |
  | Mongo | degraded | Atlas IP access (item 1) |
  | Tiger | degraded | `CaUsedAsEndEntity` |
  | ElevenLabs | fallback | |
  | Claude | fallback | |

  The golden loop passed 8 checks, then timed out on the answer step. The branch fixes that.
- **Supabase DB:** the migration is in sync, remote and local. `feature_flags` has `voice` off; `ask`, `visualize`, `make_it_stick` and `storylines` are on.

## FYI: Stefen's local creds

Stefen's local `MONGODB_URI` and `TIGER_DATABASE_URL` don't work: his IP isn't on the Atlas allowlist, and his Tiger URL has no password. The remote secrets use your working values. Share credentials privately, never in git.
