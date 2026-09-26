# Nadani's First Claude Code Prompt

Read:
- `00-CLAUDE.md`
- `02-architecture-contract.md`
- `05-data-contracts.md`
- `06-demo-runbook.md`
- `09-cut-list.md`
- `NADANI-OWNERSHIP.md`
- `SHARED-INTEGRATION-RULES.md`

You are the intelligence/backend engineer for Thinketh. Stefen is independently building the mobile application on another computer.

Do not build his UI.

## Mission
Build the stable, typed Thinketh intelligence/API layer that powers the golden demo.

## Ownership
Freely modify:
- `/packages/intelligence/**`
- `/supabase/functions/**`
- server-only adapters and tests

Treat as read-only unless coordinated:
- `/apps/mobile/**`
- `/packages/ui/**`

## Core loop first
Implement before sponsor-heavy work:
1. seeded DailyBrief
2. seeded Development
3. personalized DeltaExplanation
4. adaptive DiagnosticQuestion selection
5. DiagnosticAnswer evaluation
6. KnowledgeStateTransition
7. KnowledgeState/history retrieval

## Knowledge state
Track:
- mastery
- confidence
- uncertainty
- evidenceCount
- lastObservedAt
- misconceptionFlags

Observations:
- viewed
- saved
- already_knew
- got_it
- diagnostic_correct
- diagnostic_partial
- diagnostic_incorrect
- explained
- revisited
- asked_followup
- misconception_detected

Diagnostics must be weighted more heavily than passive reading.
"Got it" must not equal demonstrated understanding.

Every transition returns:
- before
- observation
- after
- reason
- propagatedChanges
- timestamp

## Adaptive diagnostic selection v0
Use transparent scoring:

priority =
uncertainty
× conceptImportance
× userInterest
× freshness
× prerequisiteCentrality

Return selection debug metadata.

Do not pretend this is full Bayesian inference unless implemented.

## Delta engine
Input:
- Development
- user KnowledgeState[]
- concept relationships

Output:
- whatHappened
- whyItMattersToYou
- alreadyKnew
- whatChanged
- mentalModelChange
- affectedConcepts

Claude may phrase the result.
Claude does not directly assign mastery numbers.

## Claude structured tasks
Use Claude server-side for:
- development normalization
- claim extraction
- concept extraction
- delta language
- diagnostic generation
- DiagramSpec
- MemoryAid
- Ask responses

Validate all structured output with Zod.

## Sponsor adapters

### Backboard
Persistent cross-thread learning context:
- explanation preferences
- recurring misconceptions
- current learning topics
- conversation memory

Do not store numeric mastery as the authoritative state here.

### Tiger Data
Temporal history:
- knowledge_observations
- knowledge_state_transitions
- world_state_events
- interaction_events

Support:
- latest state
- concept history
- recent change

### MongoDB Atlas
Semantic corpus:
- developments
- sources
- claims
- concepts
- storylines

Support:
- upsert
- get by ID
- semantic/vector retrieval

### Supabase
Use for:
- auth
- profile
- feature flags
- mapping integration IDs
- server/API boundary

Keep service role and all privileged secrets server-side.
Use RLS where tables are exposed.

### ElevenLabs
Backend only:
- signed/session/token/config support as required
- no privileged key in the mobile bundle

## Seed demo persona
Create:
- strong Agent Tool Use
- intermediate MCP
- weak Agent Memory
- weak Evaluator Architectures
- flagship development about persistent agent memory
- 5+ related concepts
- 3+ supporting sources
- one nuance/contradiction
- one storyline

## Tests
Unit-test:
- observation weighting
- mastery update
- uncertainty update
- diagnostic selection
- transition explanation
- adapter fallbacks

## Finish by reporting
1. files created
2. algorithms implemented
3. endpoints/functions available
4. tests passing/failing
5. sponsor-adapter status
6. exact request/response examples Stefen can consume
7. remaining credentials/accounts needed
