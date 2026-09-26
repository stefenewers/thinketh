# Run the public demo API

The demo API is the **Node server** (`packages/intelligence/src/server/node.ts`), running as one persistent process and exposed through a Cloudflare quick tunnel. It is **not** the Supabase Edge Function. Stefen's `docs/NADANI-ACTION-ITEMS.md` has the verification (Tiger, Mongo, Backboard, Supabase live; golden loop 23/23; answer ~590 ms).

## Start it

```sh
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"   # cloudflared + node (installed in ~/.local on Nadani's Mac)
lsof -ti:8787 -sTCP:LISTEN | xargs kill                       # free the port if a dev API is running
./scripts/demo-api.sh                                        # starts the API + tunnel, prints the public URL, runs the checks
```

It needs the repo-root `.env` with the full `TIGER_DATABASE_URL` (password included), plus `MONGODB_URI`, the Backboard keys and the Supabase keys. Point the app at the printed URL (`EXPO_PUBLIC_API_URL`).

- The quick-tunnel URL **changes on every restart** and dies if the laptop sleeps. Keep the laptop awake during judging, or move the same server to Railway or Render for a stable URL (needs a browser login).
- `TIGER_TLS_INSECURE` isn't needed: Node accepts Tiger's certificate.

## Why not Supabase Edge

Two problems, both confirmed on the deployed function:

- **State doesn't persist.** Edge recycles instances between requests, and Thinketh keeps knowledge state in process memory plus Tiger. After an answer, Mind and History showed the old state again.
- **Tiger can't connect.** Timescale's server certificate is marked `CA:TRUE`, signed by a private Timescale CA. The Edge runtime's TLS stack refuses it (`CaUsedAsEndEntity`) even with verification off. The Postgres driver's `ssl: "require"` already skips verification, so `TIGER_TLS_INSECURE` changes nothing there. Node's TLS accepts it.

The Edge Function stays deployed (`https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api`) but isn't used for the demo. Supabase itself (database, feature flags) is live and used by the Node server. Redeploying the Edge Function is still possible with `npm run secrets:remote --workspace @thinketh/intelligence` and `./supabase/deploy-remote.sh`.

## Atlas access

The Atlas Network Access rule `0.0.0.0/0` is open for the event, which the tunnel setup doesn't strictly need but doesn't hurt. Remove it after HackGT (see `docs/POST-HACKATHON-CLEANUP.md`).
