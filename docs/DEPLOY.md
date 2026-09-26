# Deploy the Thinketh API (Supabase Edge Function)

**Public API:** `https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api` (project `thinketh`, ref `mbfogczuvxqkrykwlrcp`). It's already deployed. Stefen's `docs/NADANI-ACTION-ITEMS.md` has the current remote status.

## Redeploy

```sh
npm run secrets:remote --workspace @thinketh/intelligence   # writes supabase/.env.remote (gitignored) from the repo-root .env
./supabase/deploy-remote.sh                                # sets secrets, deploys with --no-verify-jwt, verifies
```

`secrets:remote` copies only the keys the API needs, plus the judging defaults: `THINKETH_REQUIRE_AUTH=false`, `THINKETH_ALLOW_RESET=true`, `THINKETH_DEMO_USER_ID=demo-user` and `TIGER_TLS_INSECURE=true`. It leaves out `SUPABASE_*`, because the Edge runtime injects those and the CLI rejects secret names with that prefix. It prints key names only.

## Known remote blockers

- **MongoDB Atlas:** Edge Functions have no fixed outgoing IPs, so Atlas → Network Access needs `0.0.0.0/0` for the event. This is on the post-hackathon cleanup list.
- **Tiger Data:** Timescale's certificate is marked `CA:TRUE`, which the Edge runtime rejects (`CaUsedAsEndEntity`). `TIGER_TLS_INSECURE=true` works around it for Tiger only. It isn't yet proven on Supabase Edge.

## Local check under Deno

The function has also been served locally under Deno 2.9 with the live `.env`:

```sh
~/.local/deno/bin/deno run --allow-all --env-file=.env --config supabase/functions/api/deno.json supabase/functions/api/index.ts
API_URL=http://localhost:8000/api npm run check:golden -w mobile
```

That run passed, with Tiger, Mongo, Backboard and Supabase live. Local Deno accepted Tiger's certificate, so that failure only shows up on Supabase's Edge runtime.
