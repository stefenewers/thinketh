# Mobile API expectations

For: Nadani (backend / intelligence)
From: Stefen (mobile), `stefen` branch

This is what the mobile app actually sends and expects back. Every field inside these responses is a type from `packages/contracts` (a copy of `05-data-contracts.md`). The **response envelopes** (the outer objects) are the mobile side's proposal. Tell me if you'd prefer different shapes; changing them on my side is cheap.

- Response validation: the app checks every response against Zod schemas in `apps/mobile/src/api/types.ts`. If a response doesn't match, the request counts as a failure.
- Mock backend: `apps/mobile/src/api/mock.ts` and `apps/mobile/src/api/fixtures.ts` hold the seeded demo data. Treat them as reference fixtures.
- Automated check: `npm run check:golden -w mobile` runs the golden loop against the mock and validates every response.

## Transport

- Base URL: `EXPO_PUBLIC_API_URL`. Set `EXPO_PUBLIC_USE_MOCK_API=false` to use the real backend.
- Headers: `Content-Type: application/json` and `X-Thinketh-User: demo-user`. POST bodies also include `userId`.
- Timeout: 8 seconds.
- Fallback: if a call fails or returns an invalid shape, the app logs a warning and serves the seeded mock instead, so the demo never shows an error. To surface failures while integrating, set `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false`.

## Endpoints, in the order we should connect them

### 1. `GET /brief/today`
```ts
{
  brief: DailyBrief,
  developments: Development[],        // everything referenced in brief.developmentIds
  sources: Source[],                  // for publisher names on Today
  concepts: Concept[],
  understoodDevelopmentIds: string[], // developments the user has verified today → "1 of 6 understood"
  recentTransitions: KnowledgeStateTransition[] // newest first → "Your knowledge changed today"
}
```
The app labels a development "Major" when `significance >= 0.75`, and "Notable" when `>= 0.6`. `skippedBreakdown` keys are shown as written. The app has plain-English definitions for these five keys: `Duplicate reports`, `Low-signal opinions`, `Already understood`, `Minor updates`, `Low-confidence claims`.

### 2. `GET /developments/:id`
```ts
{ development: Development, delta: DeltaExplanation, sources: Source[], concepts: Concept[], claims: Claim[] }
```
`delta.affectedConcepts[0]` is treated as the **primary concept**. The app uses it for "Check my understanding", Make It Stick, and Explain Deeper.

### 2b. `POST /developments/:id/feedback`
Used by the "Got it" and "I already knew this" buttons. This endpoint is in the architecture doc but not in the first-prompt list.
```ts
request:  { userId, kind: "got_it" | "already_knew" }
response: { transitions: KnowledgeStateTransition[] }  // transitions[0].reason is shown inline
```

### 3. `POST /diagnostics/select`
```ts
request:  { userId, developmentId?: string, conceptId?: string }
response: DiagnosticQuestion
```
The app shows `rationale` and `selectionDebug` under "Why this question?". Please fill in `selectionDebug`, because it's part of the demo.

### 4. `POST /diagnostics/:id/answer`
```ts
request:  { userId, answer: string }   // for multiple choice, the exact choice text
response: { answer: DiagnosticAnswer, transition: KnowledgeStateTransition }
```
How the result is shown:
- The verdict depends on `answer.correctness`: `>= 0.99` shows "Right.", `> 0` shows "Partly there.", and anything else shows "One connection needs clarification."
- The transition view animates `before` → `after` for mastery and uncertainty.
- It then shows `reason`, the observation kind and weight, and the evidence count change.
- Each entry in `propagatedChanges` is listed under "Also updated".
- The runbook demo expects Agent Memory to go from 0.42 to 0.51 for mastery and from 0.44 to 0.29 for uncertainty.

### 5. `GET /knowledge`
```ts
{ states: KnowledgeState[], concepts: Concept[], edges: ConceptEdge[], recentTransitions: KnowledgeStateTransition[] }
```
A concept counts as "Just improved" when it has a transition in `recentTransitions` with `after.mastery > before.mastery`.

The Mind graph uses a hand-placed layout for the 10 demo concept IDs in `fixtures.ts`. Any other IDs fall back to a circle layout, so keep the demo concept IDs if you can.

### 6. `GET /knowledge/:conceptId/history`
```ts
KnowledgeStateTransition[]   // oldest first
```

### 7. `POST /ask`
```ts
request:  { userId, question }
response: {
  question: string,
  sourcesSay: string[], thinkethInfers: string[], youAlreadyUnderstand: string[], stillUncertain: string[],
  citedDevelopmentIds: string[], citedConceptIds: string[]
}
```
Splitting the answer into sources, inference, what the user knows, and what's uncertain comes from the design spec. Empty arrays hide their section.

### 8. `POST /visualize`
```ts
request: { userId, developmentId?, conceptId? }   response: DiagramSpec
```
Layout rules:
- `group: "before"` nodes go in the left column and `"after"` nodes in the right. `"shared"` nodes sit on top.
- Labels should be 30 characters or fewer, since they're clipped to 2 lines.
- 3 or 4 nodes per column works best.

### 9. `POST /make-it-stick`
```ts
request: { userId, conceptId, developmentId? }   response: MemoryAid
```

### 10. `POST /voice/session`
```ts
request:  { userId, briefDate }
response: { sessionId, conversationToken: string | null, agentId: string | null, expiresAt, fallbackScript: string[] }
```
Until `conversationToken` is set, the app plays `fallbackScript` as text. Real voice will also need an Expo development build, because it doesn't work in Expo Go.

## Open contract questions

1. **`Interest`**: `UserProfile` references this type, but `05-data-contracts.md` never defines it. `packages/contracts` currently uses `{ topic: string; weight: number }`. Does that work for you?
2. **`packages/contracts`**: I created this package from `05-data-contracts.md`, with no other changes. It lives in its own commit. If you already have one, let's keep yours and I'll rebase onto it.
3. **Response envelopes**: should they move into `packages/contracts` once we've agreed on them?
4. **Knowledge-state numbers**: the mock applies fixed demo deltas, `+0.09 / -0.15` for a correct answer. The real update rules are yours. The app only renders whatever `before`, `after`, and `reason` you send.
