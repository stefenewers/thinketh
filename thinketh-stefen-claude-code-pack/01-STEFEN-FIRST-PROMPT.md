# Stefen's First Claude Code Prompt

Read:
- `00-CLAUDE.md`
- `02-architecture-contract.md`
- `05-data-contracts.md`
- `06-demo-runbook.md`
- `09-cut-list.md`
- `STEFEN-OWNERSHIP.md`
- `SHARED-INTEGRATION-RULES.md`

You are the mobile/product engineer for Thinketh. Nadani is independently building the backend/intelligence layer on another computer.

Do not build her systems.

## Mission
Ship the polished Expo React Native application and make the full golden demo path work against typed mocks first.

## Tech
Use:
- Expo
- React Native
- TypeScript
- Expo Router

Do not make Next.js the primary client.

## Ownership
Freely modify:
- `/apps/mobile/**`
- `/packages/ui/**`

Treat as read-only unless coordinated:
- `/packages/contracts/**`
- `/packages/intelligence/**`
- `/supabase/functions/**`

## API client
Create a Thinketh API client abstraction with methods corresponding to:
- GET `/brief/today`
- GET `/developments/:id`
- POST `/diagnostics/select`
- POST `/diagnostics/:id/answer`
- GET `/knowledge`
- GET `/knowledge/:conceptId/history`
- POST `/ask`
- POST `/visualize`
- POST `/make-it-stick`
- POST `/voice/session`

Every method must have deterministic mock data matching the shared contracts.

Use a simple switch such as `USE_MOCK_API`.

## Build order

### 1. App shell
- Expo Router
- bottom nav: Today / Library / Explore / Ask
- theme tokens
- typography
- safe areas
- loading/error states

### 2. Today
Show:
- date
- meaningful-development count
- major count
- estimated catch-up time
- hero development
- smaller developments
- optional "items skipped for you" transparency

### 3. Development Detail
Show:
- headline
- significance
- What happened
- Why this matters to you
- You already knew
- What changed
- Why this changes your mental model
- Go deeper
- Related concepts

Actions:
- Got it
- I already knew this
- Explain deeper
- Check my understanding
- Visualize this
- Make it stick

### 4. Diagnostic
- one focused question
- answer
- submit
- feedback
- show KnowledgeStateTransition

Make the state transition the primary visual wow moment.

### 5. Mind
Show:
- concept name
- mastery
- uncertainty
- recent change
- selected concept details
- small temporal history

Prefer a calm graph/list hybrid over a huge physics graph.

### 6. Secondary
- Library
- Explore
- Ask

Suggested Ask prompts:
- What changed in agent memory this week?
- What am I weakest on?
- Explain MCP based on what I already know.

### 7. Visualize This
Render the shared `DiagramSpec` with native UI/SVG.
Prefer before-vs-after mental models.

Do not use Grok or generated images.

### 8. Make It Stick
Render:
- analogy
- memory hook
- three-step model
- recall question

### 9. Voice
Only after the golden loop is stable.
Use ElevenLabs React Native integration when backend support is ready.
Keep a silent/text fallback.

## Design
Preserve the established Thinketh identity:
Apple × Arc × Linear × premium editorial publishing.

No dashboard spam, crypto aesthetics, gradient spam, or generic SaaS layouts.

## Finish by reporting
1. files created
2. screens/routes implemented
3. mock API methods available
4. typecheck/lint status
5. what Nadani must provide for integration
6. current integration risks
