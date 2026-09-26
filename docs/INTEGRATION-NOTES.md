# Integration notes: Stefen → Nadani

Written for Nadani and her Claude Code sessions. It explains the changes made on `stefen-integration-mobile` that touch backend-owned or shared code. Read this before editing `packages/contracts` or `packages/intelligence/src/contracts.ts`.

## 2026-09-25: canonical API envelopes moved to `packages/contracts`

This follows JOINT-INTEGRATION-CHECKLIST.md step 2: "Move response envelopes into `packages/contracts`".

### What changed in code you own

`packages/intelligence/src/contracts.ts` was changed in commit `4247387`.
- **Removed:** the envelope and domain definitions that it used to declare itself: `BriefResponse`, `DevelopmentDetailResponse`, `DiagnosticSelectResponse`, `KnowledgeResponse`, `ConceptHistoryResponse`, `AskResponse`, `VoiceSession`, `Storyline`, `MemoryItem`, `SelectionDebug`, `KnowledgeLevel`, and the request schemas.
- **Where they are now:** `packages/contracts/src/api.ts`, **copied unchanged**. The file still does `export * from "@thinketh/contracts"`, so every name your code imports from `../contracts.ts` still resolves, with the same shape.
- **Kept in your file:** `PersonaInterest`, `PersonaProfile`, `ObservationKindSchema`, `ObservationKind`, and `PropagatedChange`. These are backend-only.
- **Verified after the change:** `tsc` is clean, `vitest` passes 56/56, `npm run start` boots, and every route returns 200.

### What changed in `packages/contracts`
- **`src/domain.ts`:** the old `src/index.ts` (the 05-data-contracts.md types), unchanged.
- **`src/api.ts`:** the envelopes above.
- **`src/index.ts`:** re-exports both. Relative imports use a `.ts` extension, because Node type-stripping and Deno both need it. The Deno import map in `supabase/functions/api/deno.json` still points at `index.ts`.
- **Two OPTIONAL fields were added.** Your server doesn't need to send them, and its response validation still passes without them:
  - `BriefResponse.sources?: Source[]`: publisher names on Today.
  - `AskResponse.sections?: { sourcesSay, thinkethInfers, youAlreadyUnderstand, stillUncertain }`: the design spec's trust layering.

### Rules going forward
- **Don't redefine envelopes in `packages/intelligence`.** Change them in `packages/contracts/src/api.ts` through the shared-contract process (SHARED-INTEGRATION-RULES.md): make an isolated commit and tell Stefen.
- **Additive, optional fields are safe.** Renaming, removing, or making a field required will break the mobile app's validation. Every response is Zod-parsed on the phone.

## Backend behaviours the mobile app now relies on

If you change any of these, the app needs a matching change:

1. **Propagated transitions keep `observation.sourceRef` starting with `"propagated:"`.** The app uses this to show "Just improved" and count "understood" only for the concept the user actually answered on. Without it, every prerequisite would light up.
2. **`items[].lastTransition` in `GET /knowledge`.** Today's "Your knowledge changed today" and "N of 6 understood" are derived from it. A development counts as understood when there's a direct `diagnostic_correct` transition today on its `conceptIds[0]`. If you'd rather own this, add `understoodDevelopmentIds` to the brief and the app will switch to it.
3. **`knowledgeLevel()` thresholds (0.75 / 0.55 / 0.40)** are mirrored in `apps/mobile/src/lib/knowledge.ts` → `levelOf()`. The app uses it only for transitions, which don't carry a `level`. Elsewhere it uses the server's `level`.
4. **`skippedBreakdown` keys** are mapped to labels. The known keys are `duplicate`, `low_signal`, `already_understood`, `minor_update`, and `low_confidence`. Any other key is shown humanized.
5. **Diagnostic feedback** may start with a short verdict ("Right.", "Not quite."). The app turns it into the heading. Keep it short.
6. **User header:** the app sends `x-thinketh-user-id: demo-user`.
7. **`POST /demo/reset`** is used by the golden check. Keep `THINKETH_ALLOW_RESET` on in dev.

## Check your changes against the app

After any backend change that touches responses, run:

```sh
npm run dev:api
API_URL=http://localhost:8787 npm run check:golden -w mobile
```

It runs Today → Development → Diagnostic → Transition → Mind → History through the app's own HTTP client with **no mock fallback**. It validates every response against `packages/contracts` and checks the runbook numbers (0.42→0.51, 0.44→0.29). The last run passed 22/22.

## Open asks for Nadani

- **Optional:** send `sources` in `GET /brief/today`.
- **Optional:** send `sections` in `POST /ask`.
- **Decide on the filtered count:** the brief filters 39 items, while the runbook says "143". Change either the seed or the talk track.

Full endpoint-by-endpoint notes are in `docs/MOBILE-API-EXPECTATIONS.md`.
