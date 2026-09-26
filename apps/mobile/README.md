# Thinketh mobile

Expo (SDK 57) + React Native + Expo Router + TypeScript.

## Run

```sh
npm install          # from the repo root (npm workspaces)
npm run mobile       # or: cd apps/mobile && npx expo start
```

Scan the QR code with Expo Go. The app runs entirely on seeded mock data by default.

## Golden demo path

Today → Catch me up → Development → Check my understanding → answer → knowledge-state transition → See it in your Mind

The mock is stateful for the app session. To reset the demo, reload the app.

## Real backend

```sh
npm run dev:api     # from the repo root: backend on :8787
EXPO_PUBLIC_USE_MOCK_API=false EXPO_PUBLIC_API_URL=http://<LAN-IP>:8787 EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false npx expo start --clear
```

Use your laptop's LAN IP on a phone (`localhost` only works for the web preview). While integrating, keep `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false` so errors surface; turn it back on for judging so a failed call serves seeded data. Contract: `packages/contracts/src/api.ts`; notes in `docs/MOBILE-API-EXPECTATIONS.md`.

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
