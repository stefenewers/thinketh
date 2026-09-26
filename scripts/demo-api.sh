#!/usr/bin/env bash
# Run the public demo API: the Node/Hono server plus a Cloudflare quick tunnel.
# Supabase Edge can't hold Thinketh's state (instances recycle, Tiger TLS fails there),
# so the demo runs on one persistent Node process. See docs/NADANI-ACTION-ITEMS.md.
#
#   brew install cloudflared      (once)
#   ./scripts/demo-api.sh         (Ctrl-C stops both)
#
# Needs the repo-root .env with the full TIGER_DATABASE_URL (password included) and MONGODB_URI.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-8787}
LOG_DIR=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use; stop the other API first."; exit 1
fi

# Hackathon demo settings. TIGER_TLS_INSECURE is not needed: Node accepts Tiger's certificate.
THINKETH_REQUIRE_AUTH=false THINKETH_ALLOW_RESET=true PORT=$PORT \
  npm run start --workspace @thinketh/intelligence >"$LOG_DIR/api.log" 2>&1 &
for _ in $(seq 1 40); do curl -sf "localhost:$PORT/health" >/dev/null && break; sleep 1; done
curl -sf "localhost:$PORT/health" >/dev/null || { echo "API did not start:"; tail -20 "$LOG_DIR/api.log"; exit 1; }

cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG_DIR/tunnel.log" 2>&1 &
URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)
  [ -n "$URL" ] && break; sleep 1
done
[ -n "$URL" ] || { echo "Tunnel did not start:"; tail -20 "$LOG_DIR/tunnel.log"; exit 1; }
for _ in $(seq 1 20); do curl -sf --max-time 10 "$URL/health" >/dev/null && break; sleep 2; done

echo; echo "Public API: $URL"; echo
APP_KEY=$(grep -E '^THINKETH_APP_KEY=' .env | cut -d= -f2- || true)
THINKETH_APP_KEY=$APP_KEY node supabase/verify-remote.mjs "$URL" || true
cat <<EOF

Mobile (.env for the Expo app):
  EXPO_PUBLIC_API_URL=$URL
  EXPO_PUBLIC_THINKETH_APP_KEY=${APP_KEY:-<THINKETH_APP_KEY from .env>}
  EXPO_PUBLIC_USE_MOCK_API=false
  EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false   # set true for judging

Logs: $LOG_DIR   (Ctrl-C stops the API and the tunnel)
EOF
wait
