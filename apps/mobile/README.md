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
EXPO_PUBLIC_USE_MOCK_API=false EXPO_PUBLIC_API_URL=https://… npx expo start
```

Failed or malformed responses fall back to the mock unless `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false`. For the endpoint contract, see `docs/MOBILE-API-EXPECTATIONS.md`.

## Checks

```sh
npm run typecheck -w mobile
npm run lint -w mobile
npm run check:golden -w mobile   # runs the golden loop against the mock, validates every response
```

## Layout

- `src/app/`: routes. `(tabs)` holds Today, Library, Explore, and Ask. The other routes are `development/[id]`, `diagnostic`, `mind`, `visualize/[id]`, `make-it-stick/[id]`, and `voice`.
- `src/api/`: `ThinkethApi` interface, the mock, the HTTP client, fixtures, and response schemas.
- `src/components/`: design-system pieces, `KnowledgeStateTransitionView`, `MindGraph`, and `DiagramView`.
- `src/theme/tokens.ts`: colors, spacing, radii, fonts, and motion.
