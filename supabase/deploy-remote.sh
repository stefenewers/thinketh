#!/usr/bin/env bash
# Deploy the Thinketh API Edge Function and verify it end to end.
#   1. edit supabase/.env.remote (gitignored)
#   2. ./supabase/deploy-remote.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=supabase/.env.remote
API_URL=https://mbfogczuvxqkrykwlrcp.supabase.co/functions/v1/api

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
# Only non-empty, uncommented KEY=value lines are sent.
SECRETS=$(mktemp)
trap 'rm -f "$SECRETS"' EXIT
grep -E '^[A-Z_]+=.+' "$ENV_FILE" | grep -v '^SUPABASE_' > "$SECRETS" || true
echo "Setting secrets: $(cut -d= -f1 "$SECRETS" | tr '\n' ' ')"
npx supabase secrets set --env-file "$SECRETS"

echo; echo "Deploying api (JWT verification off for the demo)..."
npx supabase functions deploy api --no-verify-jwt

echo; echo "Health, answer timing, Tiger write/read:"
node supabase/verify-remote.mjs "$API_URL" || VERIFY_FAILED=1

echo; echo "Remote golden loop:"
API_URL=$API_URL npm run check:golden -w mobile
[ -z "${VERIFY_FAILED:-}" ] || { echo "verify-remote failed (see above)"; exit 1; }
