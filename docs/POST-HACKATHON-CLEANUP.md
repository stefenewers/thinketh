# Post-hackathon cleanup

These are temporary changes we made so the public demo works during HackGT. Each one is a security trade-off. Remove all of them after the event.

- [ ] **Remove `TIGER_TLS_INSECURE=true`** from the Edge Function secrets:
  ```bash
  npx supabase secrets unset TIGER_TLS_INSECURE
  ```
  Also delete it from `supabase/.env.remote` and from any local `.env`.
- [ ] **Remove the Tiger TLS bypass code.** It's marked `HACKGT DEMO ONLY` in:
  - `packages/intelligence/src/adapters/temporal.ts`: `TigerTemporalStore.tlsOptions()`. Go back to `ssl: "require"`.
  - `packages/intelligence/src/config.ts`: `tiger.tlsInsecure`.
  - `packages/intelligence/src/adapters/registry.ts`: the `tlsInsecure` option passed to the Tiger store.
  - `.env.example` and the related test in `test/adapters.test.ts`.

  Why it exists: Timescale's server certificate is marked `CA:TRUE`. Deno, the runtime behind Supabase Edge Functions, rejects that as `CaUsedAsEndEntity`, while Node accepts it. The long-term fix is to run the Tiger writes from a Node runtime, or to wait until Timescale or Deno changes this behavior.
- [ ] **Remove MongoDB Atlas Network Access `0.0.0.0/0`.** Replace it with specific IPs, or use private networking.
- [ ] Consider turning JWT verification back on for the `api` function. It was deployed with `--no-verify-jwt` for the demo.

The circuit breaker in `adapters/guard.ts` isn't temporary. It keeps a failing sponsor from stalling requests, so keep it.
