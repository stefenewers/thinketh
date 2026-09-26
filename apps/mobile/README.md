# Thinketh mobile

Expo (SDK 57) + React Native + Expo Router + TypeScript.

## Run

```sh
npm install          # from the repo root (npm workspaces)
npm run mobile       # or: cd apps/mobile && npx expo start
```

For the mock path, scan the QR code with a compatible development build. The app uses seeded mock data by default. Live Playground rooms require the API.

## Golden demo path

Today → Catch me up → Development → Check my understanding → answer → knowledge-state transition → See it in your Mind

The mock is stateful for the app session. To reset the demo, reload the app.

## Real backend

```sh
npm run dev:api     # from the repo root: backend on :8787
node scripts/configure-demo-mobile.mjs http://<LAN-IP>:8787
cd apps/mobile && npx expo start --clear
```

Run the configuration command from the repo root. It checks `/health`, backs up any existing `apps/mobile/.env.local`, and writes the actual values Expo bundles. Use your laptop's LAN IP on a phone (`localhost` only works for the web preview). Mock fallback stays off unless you explicitly pass `--fallback`; Playground itself always requires the live API. Contract: `packages/contracts/src/api.ts`; notes in `docs/MOBILE-API-EXPECTATIONS.md`.

## Demo controls (dev only)

Long-press the Thinketh mark (top left of Today) to open them:
- **Reset demo:** calls `POST /demo/reset`, then confirms Agent Memory is back at about 0.42 mastery and 0.44 uncertainty.
- **Data source:** shows mock or real, the API URL, and whether the mock fallback is on.
- **Sponsor adapters:** reads `/health` and shows each adapter as LIVE, LIVE · untested, DEGRADED (configured, but the last call fell back), or FALLBACK (not configured).

## Physical phone against the real backend

1. Put the phone and the laptop on the same Wi-Fi.
2. Run `npm run dev:api` from the repo root. The backend binds `0.0.0.0:8787`. Allow `node` through the macOS firewall if it asks.
3. Run `ipconfig getifaddr en0` to get the laptop's IP.
4. From the repo root run `node scripts/configure-demo-mobile.mjs http://<IP>:8787`, then `cd apps/mobile && npx expo start --clear` and open the development build.
5. Long-press the mark. Confirm **Real API**, the exact URL and **mock fallback OFF**. Tap **Reset demo** before each run and confirm Agent Memory is near 0.42 / 0.44. Reset both shared personas if a prior Playground run changed them.
6. Freeze this checkout during the judged run. Metro serves the working tree; edits during the session can break a loaded room. If you enable `--fallback` for the non-Playground path, disclose it and verify the live data source again.

## Checks

```sh
npm run typecheck -w mobile
npm run lint -w mobile
npm run check:golden -w mobile                                   # golden loop against the mock
API_URL=http://localhost:8787 npm run check:golden -w mobile     # against the real backend, no fallback
```

## Layout

- `src/app/`: routes. `(tabs)` holds Today, Library, Explore, and Ask. The other routes are `development/[id]`, `diagnostic`, `mind`, `visualize/[id]`, `make-it-stick/[id]`, and `voice`.
- `src/api/`: `ThinkethApi` interface, the mock, the HTTP client, and fixtures. Response shapes come from `@thinketh/contracts`.
- `src/components/`: design-system pieces, `KnowledgeStateTransitionView`, `MindGraph`, and `DiagramView`.
- `src/theme/tokens.ts`: colors, spacing, radii, fonts, and motion.
