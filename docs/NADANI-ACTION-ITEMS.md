# Nadani: action items from Stefen's side (updated 2026-09-25, late)

Stefen's earlier changes are in `docs/STEFEN-CHANGES.md`. Temporary security trade-offs to undo after the event are in `docs/POST-HACKATHON-CLEANUP.md`.

## Update: the demo API now runs on Node, not Supabase Edge

**What happened on Supabase Edge:**
- The circuit breaker fixed the answer timeout: the answer step took 306 ms there.
- But after the answer, the golden loop failed on Mind and History. The state went back to 0.42.
- Why: Supabase recycles Edge instances between requests. Eight health calls in a row each showed zero prior calls. Thinketh keeps knowledge state in process memory plus Tiger, and Tiger can't connect from Edge. Deno still rejects Timescale's certificate (`CaUsedAsEndEntity`) even with `TIGER_TLS_INSECURE=true`, so the bypass has no effect there. The result: every request starts from a blank state.
- We decided not to build a second knowledge-state store in Supabase Postgres.

**What we did instead:** we run the unchanged Node/Hono server (`packages/intelligence/src/server/node.ts`) as one persistent process, exposed through a Cloudflare quick tunnel. This involved no code or architecture changes.

**Verified against the public tunnel URL:**

| Check | Result |
|---|---|
| Tiger | **live**. The answer's transition was written and read back (row count 0 → 6). |
| Mongo | **live**. Thanks for opening Atlas. |
| Backboard | **live** |
| Supabase | **live** |
| Claude, ElevenLabs | fallback |
| Golden loop | **23/23** |
| Answer latency | about 590 ms |
| Persistence | 0.42 → 0.51 still shows 0.51 on requests 10 s later, and History shows the answer as newest |
| Reset | brings it back to 0.42 |

`TIGER_TLS_INSECURE` isn't set on Node; Node accepts Tiger's certificate.

**How to run it** (either of us):
```bash
brew install cloudflared   # once
./scripts/demo-api.sh      # starts the API and the tunnel, prints the public URL, runs the checks
```
- It needs the repo-root `.env` with the **full** `TIGER_DATABASE_URL`. Stefen's now has the password.
- A quick-tunnel URL changes on every restart and dies if the laptop sleeps. For judging, we should move the same server to Railway or Render to get a stable URL (it needs a browser login).
- The Supabase Edge Function stays deployed but is **not** the demo API. Supabase itself (DB, flags) is still live and used by the Node server.

## Still open for you
1. **ElevenLabs:** the `ELEVENLABS_AGENT_ID` we had was the placeholder `thinketh`, and ElevenLabs returns 404 for it. Send the real agent id, or we cut voice. The `voice` flag is off in Supabase.
2. **Claude live phrasing** (optional): send `ANTHROPIC_API_KEY` if we want it. Without it, the server runs the deterministic fallback.
3. Done, thanks: the Atlas `0.0.0.0/0` access, the full Tiger URL, and the `stefen-edge-tiger` merge.

## History: the Supabase Edge attempt

### Branch `stefen-edge-tiger` (merged in #6)

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

### Edge deployment state at the time

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

### FYI: Stefen's local creds (resolved)

Stefen's `MONGODB_URI` is the same one you use. It only fails because of the Atlas allowlist, which item 1 fixes.

**Correction (needs you): the `TIGER_DATABASE_URL` in Stefen's `.env`, and in the deployed secrets, has no password** (`postgres://tsdbadmin@…`). Once the TLS bypass gets past the certificate error, Tiger will fail its login on Edge. Please send Stefen the full URL privately, with the password (`postgres://tsdbadmin:<password>@…`). He'll put it in his root `.env`, because `npm run secrets:remote` rebuilds `supabase/.env.remote` from that file, then redeploy. Never commit it.
