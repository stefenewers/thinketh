# Shared Two-Computer Integration Rules

## Branches
- Stefen: `stefen/mobile`
- Nadani: `nadani/intelligence`

Separate clones are fine.

## Core rule
Build independently against the shared contracts first.

Stefen never waits for an endpoint: use typed mocks.
Nadani never waits for a screen: use typed fixtures/tests.

## Merge checkpoints

### A
Both branches compile independently.

### B
Golden loop works separately:
- mobile with mocks
- backend with tests/API fixtures

### C
Wire only the six core endpoints:
- brief
- development
- diagnostic select
- diagnostic answer
- knowledge state
- concept history

### D
Add sponsor integrations one at a time.

## Shared contract change
If either person needs to change a shared type:
1. write down the exact field/change
2. make a small isolated commit
3. notify the other person
4. both pull/rebase before continuing

## Non-negotiable
Never break the working golden demo to add a sponsor integration.
