# Mobile ↔ API contract

For: Nadani (backend / intelligence)
From: Stefen (mobile), branch `stefen-integration-mobile`

## Status

**The canonical envelopes now live in `packages/contracts/src/api.ts`.**
- They're copied unchanged from `packages/intelligence/src/contracts.ts`, and that file now re-exports them under the same names.
- Two fields were added, both **optional**, so your server doesn't need to change for its validation to keep passing (see below).
- Backend typecheck is clean, 56/56 tests pass, and the server boots and serves.

**The mobile app consumes these shapes directly.** Its own envelope copies are deleted.

**Golden loop verified against the real backend with mock fallback off.** Run `API_URL=http://localhost:8787 npm run check:golden -w mobile`. It passes 22/22 checks, including your engine hitting the runbook numbers exactly: 0.419→0.508 mastery and 0.438→0.289 uncertainty.

## How mobile uses each endpoint

| Endpoint | Mobile uses |
|---|---|
| `GET /brief/today` | `brief`, `developments`, optional `sources` (publisher names). `skippedBreakdown` keys are mapped to labels: `duplicate`, `low_signal`, `already_understood`, `minor_update`, `low_confidence`. Any other key is shown as-is. |
| `GET /developments/:id` | Everything. `delta.affectedConcepts[0]` is the primary concept. |
| `POST /developments/:id/feedback` | `{ kind: "got_it" \| "already_knew" }`. `transitions[0].reason` is shown inline. |
| `POST /diagnostics/select` | `question`. "Why this question?" shows `selection.explanation`, then `question.rationale` (if it's different), then `question.selectionDebug` as factor bars, then `selection.candidates` ranked by priority. |
| `POST /diagnostics/:id/answer` | `{ answer: <choice text> }`. If `feedback` starts with "Right." or "Not quite.", that sentence becomes the heading. `transition` drives the animation. |
| `GET /knowledge` | `items[].concept/state/level`, `edges`. **Today's changes are derived from `items[].lastTransition`.** Transitions with `sourceRef` starting `propagated:` are ignored, so only the concept actually tested shows "Just improved". |
| `GET /knowledge/:id/history` | `transitions` (oldest first), shown as a sparkline and a list of reasons. |
| `POST /ask` | `{ question, developmentId? }`. The app renders `sections` if present, otherwise `answer`. Then it shows `memoryUsed` as "What Thinketh remembered about you", `citations` as Sources, and `relatedConceptIds`, which link to Mind. |
| `POST /visualize`, `POST /make-it-stick` | `{ developmentId, conceptId }` → `DiagramSpec` / `MemoryAid` |
| `POST /voice/session` | `{}` → `mode`. When it's `transcript_fallback`, the app steps through `fallbackTranscript`. |
| `POST /demo/reset` | Used by the golden check. |

The app sends the header `x-thinketh-user-id: demo-user`.

## "Understood" and "changed today" are derived, not sent

**Understood:** a development counts as understood when a *direct* `diagnostic_correct` transition happened today on its `conceptIds[0]`. That's why Today shows "1 of 6 understood" after the hero check.

**If you want to own this server-side instead,** add `understoodDevelopmentIds: string[]` to the brief. Mobile would switch to it.

## Asks for Nadani

1. **Optional:** add `sources` to `GET /brief/today` for the listed developments. Without it, Today rows show only the time, with no publisher.
2. **Optional:** add `sections` to `POST /ask` (sources say / Thinketh infers / you already understand / still uncertain). Without it, the app renders `answer` plus memory and citations. That works, but it loses the trust layering from the design spec.
3. **Resolved: 143 filtered.** The backend seed now uses the same breakdown as the mobile fixtures (68 duplicate, 31 low signal, 22 already understood, 15 minor, 7 low confidence), so a fallback never changes the number.
4. **FYI:** `GET /config` flags (`voice: false`, etc.) aren't used by mobile yet. That's next with the demo controls.

## Running it

```sh
npm run dev:api                                   # backend on :8787
API_URL=http://localhost:8787 npm run check:golden -w mobile

cd apps/mobile
EXPO_PUBLIC_USE_MOCK_API=false \
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8787 \
EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false \
npx expo start --clear
```

On a physical phone, use the laptop's LAN IP, not `localhost`. Env vars are inlined at bundle time, so restart with `--clear` after changing them.
