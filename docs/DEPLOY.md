# Deploy the Thinketh API (Supabase Edge Function)

Project: `thinketh` (ref `mbfogczuvxqkrykwlrcp`). The migration is already applied.

The function (`supabase/functions/api`) has been run locally under Deno 2.9 with the live `.env`. `/health?probe=1` reported Tiger, Mongo, Backboard and Supabase live, and the full mobile golden check passed against it (`API_URL=http://localhost:8000/api`). Dependencies are pinned in `supabase/functions/api/deno.lock`.

## 1. Secrets

```sh
npm run secrets:remote --workspace @thinketh/intelligence   # writes supabase/functions/.env.remote (gitignored)
npx supabase secrets set --env-file supabase/functions/.env.remote --project-ref mbfogczuvxqkrykwlrcp
```

Don't pass the repo-root `.env` directly: the CLI rejects names starting with `SUPABASE_`. The Edge runtime injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` itself. The script also sets the judging defaults `THINKETH_REQUIRE_AUTH=false`, `THINKETH_ALLOW_RESET=true` and `THINKETH_DEMO_USER_ID=demo-user`.

## 2. Deploy

```sh
npx supabase functions deploy api --project-ref mbfogczuvxqkrykwlrcp --no-verify-jwt
```

`--no-verify-jwt` lets the app call the API without a Supabase session, matching `THINKETH_REQUIRE_AUTH=false` for judging.

**Not yet verified:** whether Supabase's bundler accepts the function importing `packages/intelligence` and `packages/contracts` from outside `supabase/functions`. Deno resolves those imports fine locally. If the deploy rejects them, tell Nadani and the backend will be bundled into the function folder at deploy time.

## 3. Verify

```sh
BASE=https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api
curl "$BASE/health?probe=1"       # expect tiger / mongo / backboard / supabase: live
curl "$BASE/brief/today" | head -c 300
API_URL=$BASE npm run check:golden -w mobile
```

Then point the app at `$BASE` with mock fallback off, run the golden path on a physical phone, and turn fallback back on for the final build.
