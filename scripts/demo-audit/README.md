# Demo audit harness

Used by the `thinketh-demo-auditor` agent (`.claude/agents/thinketh-demo-auditor.md`). It runs the judge demo in a phone-sized Chrome against a live local API and writes evidence to `docs/demo-audit/evidence/<run-id>/`.

```sh
npm install --prefix scripts/demo-audit                     # once: playwright-core only; it uses the installed Google Chrome
node scripts/demo-audit/preflight.mjs                       # API on :8797 + Expo web on :8091, env check, sponsor probe
AUDIT_RUN_ID=<id printed above> node scripts/demo-audit/journey.mjs
node scripts/demo-audit/preflight.mjs --stop                # stop what preflight started
```

Safety:
- It uses its own ports and never touches a running demo API (:8787), phone Metro (:8081) or the public tunnel.
- Every request the app sends as `demo-user` goes to the audit API as an isolated `audit-<run-id>` user, so resets and answers only touch that user's rows. Calls the web bundle aims at the tunnel (Expo bakes `apps/mobile/.env.local` into the bundle) are redirected to the audit API.
- It refuses to send any answer, feedback or reset as another identity, such as the seeded `nadani` persona in the one-device Playground. Blocked calls are listed under `guardBlocked` in `journey.json`.
- Mock fallback is off (`EXPO_PUBLIC_USE_MOCK_API=false`, `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false`), so a backend failure shows up as a failure instead of seeded data.
- `tiger-check.mjs` only reads.

Browser evidence only. It proves nothing about native gestures, the microphone, the speaker or the iPhone build.
