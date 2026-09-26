# Implementation Plan

This is the intended execution order for the final sprint.

## Phase 0: Baseline

Before touching product code:

- pull current main
- create a new branch
- record current commit SHA
- run existing unit/golden tests
- run typecheck
- run lint
- verify iOS native build if currently practical
- verify remote/public API path
- verify voice still works

Do not continue if the golden path is already broken.

## Phase 1: Learning Queue

Goal: make Library useful beyond seeded content.

Implement:

- Learning Queue section
- empty state
- Add Resource CTA
- resource detail screen
- simple resource state machine:
  - processing
  - ready
  - failed
  - learned

Prefer existing components and spacing.

Avoid a new tab.

## Phase 2: URL ingestion

Add one backend path for a user-submitted URL.

Recommended rough sequence:

1. validate URL
2. reject private/local targets
3. fetch with timeout
4. limit response size
5. extract title / metadata / readable text
6. trim to safe model context
7. classify source
8. ask Claude for structured concept extraction / semantic delta scaffolding
9. map concepts against existing PKS concepts
10. derive:
   - already understood
   - new to you
   - relevant connections
   - why now
   - full read estimate
   - useful read estimate
11. return a stable contract
12. persist only as much as necessary

The ingestion flow must not update PKS.

## Phase 3: Teach Me the Delta

Reuse current learning/diagnostic infrastructure.

Resource analysis becomes teaching input.

Teaching output should:

- skip known basics
- explain genuinely new concepts
- connect them to existing concepts
- surface important caveats
- end with Check My Understanding

Only the diagnostic can trigger evidence-based state update.

## Phase 4: Real provenance

For existing seeded demo:

- audit each source object
- attach real URLs wherever legitimate
- expose source type
- expose publisher/title/date
- make source rows tappable
- avoid unsupported credibility claims

Target 5-8 high-quality visible real sources.

## Phase 5: Knowledge Update transition

Build a reusable transition component.

Inputs should come from actual state/history output.

Possible fields:

- concept name
- previous qualitative state
- new qualitative state
- uncertainty direction
- corrected misconception, if real
- strengthened/related concept, if real

If only mastery/uncertainty changed, show that semantically.

Do not fabricate a connection.

## Phase 6: MindGraph motion

Use existing graph.

Add:

- initial fade
- updated-node ring
- restrained coral activation
- selected-node transition
- optional edge trace only if supported

Keep interactions responsive.

## Phase 7: Consumer PKS cleanup

Search normal UI for:

- mastery
- uncertainty
- raw decimal display

Replace or demote with qualitative language.

Keep numbers in dev/debug architecture views.

## Phase 8: Ask modes

Add:

- Quick answer
- Teach me
- Go deep

Keep a single backend route if possible.

Mode is generation context only.

## Phase 9: Explore grounding

Use:

1. real queued resource
2. world/development
3. PKS
4. seeded fallback

Do not remove fallback.

## Phase 10: visual pass

Do not add new features here.

Tune:

- type hierarchy
- spacing
- content width
- divider use
- card count
- CTA hierarchy
- loading
- empty states
- transitions
- source rows
- touch targets

The target is clean and expensive, not decorative.

## Cut line

If time runs short, cut in this order:

1. optional Explore work
2. optional Ask polish beyond modes
3. optional voice visual polish
4. optional Storyline motion
5. nonessential micro-interactions

Do not cut:

- golden path reliability
- real resource ingestion
- Teach Me the Delta
- real provenance
- resource failure fallback
