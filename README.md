# Thinketh

**Your brain gets a software update.**

Thinketh keeps two models side by side: what's changing in a field (the **world state**) and what you, specifically, understand (your **Mind**). It shows you only the difference between them, and it updates your Mind only when you demonstrate something new. No new information means no card.

Built for HackGT 13 (Oracle of the Deep, ML/AI).

## What's in the app

- **Today:** the developments that changed something you follow, each with what you already knew, what changed and why it matters to you.
- **Knowledge Update:** a diagnostic checks your understanding. The answer is graded against a rubric, and your Mind changes by a deterministic rule with a written reason.
- **Mind:** a living map of what you understand (the Mindprint). Filled concepts have strong evidence, hollow ones are still developing, and coral marks what changed. Tap a concept to see why the model changed.
- **Library, Explore, Ask:** save any link (article, PDF, YouTube) and Thinketh finds the part that's new to *you*. Ask answers from your sources first, with the reasoning one tap away.
- **Catch Me Up:** a voice briefing (ElevenLabs).
- **Playground:** two Minds in one space. Thinketh finds who can teach whom, one person teaches, and the learner applies it in a new context. Only then does their Mind change. See [docs/PLAYGROUND.md](docs/PLAYGROUND.md).

## How the sponsors fit

> Mongo models the changing world. Tiger models your changing understanding. Backboard remembers qualitative things about you that numbers cannot. Claude reasons over the delta. Muse orchestrates the shared learning environment. ElevenLabs makes the interaction conversational. Thinketh decides what you need next.

Live as of 2026-09-26: MongoDB Atlas, Tiger Data, Backboard, Claude, ElevenLabs and Supabase (including Realtime for the Playground). **Muse isn't configured yet**; the Playground runs its deterministic conductor through the same validated tool surface. Evidence: [docs/evidence](docs/evidence/README.md).

## Repository

```
apps/mobile               Expo / React Native app (Expo Router, TypeScript)
packages/contracts        Shared, Zod-validated API contracts
packages/intelligence     API + intelligence engine (Hono on Node), sponsor adapters with fallbacks
packages/mindprint        Deterministic Mindprint layout engine (pure TS, tested)
docs/                     Architecture, integration notes, deploy, evidence, sprint reports
```

Principles that hold everywhere:
- No secret key ever ships in the app bundle.
- Every external service sits behind an adapter with a timeout and a deterministic fallback.
- Knowledge-state numbers come only from the engine's rules, never from a model.
- Every change records its previous state, the observation, the reason, the result and a timestamp.

## Run it

```sh
npm install
cp .env.example .env              # fill in sponsor keys; everything still runs without them (fallbacks)
npm run dev:api                   # API on http://localhost:8787
npm run mobile                    # Expo dev server (dev client build for iOS)
```

Point the app at the API with `apps/mobile/.env.local` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_USE_MOCK_API=false`, `EXPO_PUBLIC_THINKETH_APP_KEY`). For a public demo URL, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Checks

```sh
npm test                          # intelligence (engine, API contracts, Playground) + mindprint layout
npm run typecheck
npm run lint
npm --workspace mobile run check:golden   # the golden loop against a running API
```

## Docs

- [docs/PLAYGROUND.md](docs/PLAYGROUND.md): Playground architecture, the collaborative delta, Muse's boundary, evidence and realtime
- [docs/PLAYGROUND-REPORT.md](docs/PLAYGROUND-REPORT.md): this sprint's deliverable report
- [docs/INTEGRATION-NOTES.md](docs/INTEGRATION-NOTES.md): contracts and backend behaviours the app depends on
- [docs/DEPLOY.md](docs/DEPLOY.md): running the public demo API
- [docs/PROVENANCE.md](docs/PROVENANCE.md): where every claim on screen comes from
