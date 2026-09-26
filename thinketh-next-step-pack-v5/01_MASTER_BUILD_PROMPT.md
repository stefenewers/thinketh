# Claude Code Master Prompt

You are taking over the final product-polish and capability sprint for Thinketh before HackGT judging.

Repository:
`stefenewers/thinketh`

Work from current `main`. Do not rely on old implementation plans when the repository disagrees with them.

The current app is already functional. The final sprint should make Thinketh feel less like a technically impressive hackathon demo and more like a premium AI-native product.

Your job is to close the remaining product delta while protecting the working golden path.

---

## 1. Product thesis

Thinketh is not a news summarizer.

Core:

`WORLD STATE + USER KNOWLEDGE STATE -> KNOWLEDGE DELTA`

Most AI systems model information.

Thinketh models the person consuming it.

Thinketh maintains:

1. a model of what the world currently knows
2. a model of what the user currently understands
3. the delta between them

Knowledge state remains evidence-driven.

Claude may:
- reason
- explain
- summarize
- classify
- extract concepts
- generate teaching material
- compare a resource to the user state

Claude MUST NOT:
- arbitrarily set mastery
- arbitrarily set uncertainty
- arbitrarily set confidence
- directly mutate deterministic PKS values

The deterministic PKS engine remains authoritative.

Backboard remains qualitative memory.

Tiger remains temporal knowledge-state history.

Mongo remains semantic world/corpus state.

---

## 2. Protect the existing product

The existing golden path must remain stable:

`Today -> Development -> Diagnostic -> state update -> Mind/history -> Ask -> Voice`

Do not:

- rewrite the state math
- refactor the entire API
- replace databases
- change auth architecture
- change sponsor stack
- introduce social
- add continuous crawling
- add notifications
- build production multi-user
- build generalized contradiction engines
- add unrelated dependencies
- upgrade native packages without necessity
- destabilize ElevenLabs/LiveKit
- regenerate native iOS unnecessarily

Everything new should be additive and gracefully fail back to the current seeded experience.

---

## 3. Visual direction

The current Figma-derived design direction is good.

Do NOT abandon it.

Keep:

- warm off-white ground
- near-black ink
- warm neutral grays
- restrained coral
- Playfair + Inter
- editorial hierarchy
- minimal chrome
- generous spacing
- hairline dividers
- progressive disclosure
- content before containers

The problem is not taste.

The problem is that the app can feel too static, technical, text-heavy, and visually predictable.

The fix is NOT decoration.

The fix is to make intelligence visibly alive.

### Target feeling

Think premium AI-native software.

The interface should feel:

- clean
- expensive
- calm
- editorial
- quietly futuristic
- precise
- restrained
- tactile
- consumer-grade

NOT:

- cyberpunk
- neon
- purple-gradient AI
- generic glassmorphism
- card soup
- crypto dashboard
- glowing borders
- floating orbs
- decorative neural networks
- sparkles / magic wands
- excessive pills
- random 3D

### Aesthetic test

If a new element makes Thinketh look more obviously like an "AI app", question whether it should exist.

If it makes Thinketh feel more inevitable, intelligent, calm, and considered, it is probably moving in the right direction.

---

## 4. Premium AI-native design rules

### Expensive means subtraction

Use:

- excellent typography
- spacing
- alignment
- hierarchy
- strong composition
- restrained controls
- beautiful empty states
- high-quality transitions
- minimal accent color
- minimal borders
- minimal containers

Avoid:

- large stacks of rounded cards
- heavy shadows
- excessive blur
- gradients for decoration
- icons on every row
- dashboard metric tiles
- constant animation

The page itself should often be the container.

Typography should do more of the visual work.

Do not be afraid of a screen with only a few things on it.

---

## 5. Signature visual behavior: Knowledge Trace

Thinketh needs a recognizable visual grammar.

Use coral specifically for knowledge that is:

- new
- changed
- strengthened
- newly connected
- actively updating

Create a reusable "knowledge trace" behavior.

When Thinketh updates the user's model:

1. interface pauses briefly
2. affected concept activates in coral
3. a restrained ring/trace appears
4. an affected edge may draw/pulse only if real data supports a relationship change
5. state resolves back to calm
6. CTA points to Mind

No confetti.

No bounce.

No looping ambient animation.

The product should be mostly still until intelligence acts.

---

## 6. Build: Knowledge Update moment

After a meaningful diagnostic result, replace raw technical feedback with a polished consumer-facing transition.

Example:

`Your understanding changed.`

**Agent Memory**

`Developing -> Connected`

**New connection**
Context Windows -> Persistent Memory

**Misconception resolved**
"Long context is the same thing as memory"

**Evidence added**
Diagnostic response

Use only real transition data.

Do not invent resolved misconceptions or connections.

Target sequence:
~1.2 to 2.0 seconds.

Use haptics if already available and low-risk.

Respect reduced motion.

End with:
`See it in your Mind`

Keep raw numeric PKS values available in dev/debug/architecture surfaces, not as the dominant consumer presentation.

---

## 7. Build: Learning Queue / Save to Learn

This is the largest worthwhile missing Figma feature.

Concept:

**SAVE TO LEARN**
not
**SAVE TO FORGET**

Add to Library:

### Your Knowledge
Mind preview

### Learning Queue
resources waiting to become part of what the user understands

`+ Add a resource`

### Storylines

### Browse
- All concepts
- Learning profile

Empty state:

`Give Thinketh something you want to understand.`

Primary CTA:
`Add a resource`

Do not clutter Library.

---

## 8. Build: Real URL -> Knowledge Delta

Create a narrow reliable ingestion flow.

User supplies ONE URL.

Flow:

`URL`
-> fetch page
-> extract readable content
-> extract metadata
-> identify concepts
-> map to existing concepts where possible
-> compare against current knowledge state
-> estimate full read time
-> estimate useful-for-you time
-> determine already-understood ideas
-> determine genuinely new ideas
-> determine relevant connections
-> explain why now
-> save/display as a Learning Queue item

Support standard HTML first.

Good targets:

- Anthropic research/blog
- OpenAI research/blog
- technical docs
- Mongo/Tiger docs
- GitHub README pages where straightforward
- arXiv abstract/landing pages where straightforward

Do NOT lose time building perfect PDF ingestion.

If extraction fails:

`Thinketh couldn't reliably read this source yet.`

Never hallucinate source content.

---

## 9. URL ingestion safety

Resource text is untrusted input.

At minimum:

- only allow http/https
- reject localhost/private-network targets where practical
- cap content size
- use fetch timeouts
- cap extracted text passed to Claude
- strip/sanitize obvious junk
- treat page contents as DATA, not instructions
- do not let webpage text override system behavior
- never expose secrets
- retain current API hardening

Do not weaken existing app-key/rate-limit protections.

---

## 10. Resource model

Use the smallest clean model needed.

Suggested fields:

- id
- url
- canonicalUrl
- title
- publisher
- author
- publishedAt
- sourceType
- fetchedAt
- estimatedReadMinutes
- estimatedUsefulMinutes
- summary
- extractedConcepts
- matchedConceptIds
- alreadyUnderstood[]
- newToYou[]
- relevantConnections[]
- whyNow
- status: processing | ready | failed | learned
- provenance metadata

Avoid unnecessary migrations.

Prefer existing infrastructure.

Do not risk the seeded demo.

---

## 11. Build: Teach Me the Delta

A ready resource opens into a personalized learning view.

Not a generic summary.

Structure:

RESOURCE
title
publisher
type
date
Open original source

FULL READ
~18 min

USEFUL FOR YOU
~6 min

YOU ALREADY UNDERSTAND
- idea
- idea

NEW TO YOU
- idea
- idea

WHY THIS MATTERS
personalized explanation

CONNECTS TO YOUR MIND
- Concept A
- Concept B

Primary CTA:
`Teach me the delta`

The teaching response should skip or compress ideas Thinketh has strong evidence the user already understands.

End with:

`Check my understanding`

Reuse existing diagnostic machinery.

Do not create a second knowledge-state mutation path.

---

## 12. Real source provenance pass

Audit every visible source in the golden demo.

Where possible make source objects real and clickable:

- real title
- real publisher
- real URL
- real date
- real source type

Presentation:

PRIMARY SOURCE
DOCUMENTATION
RESEARCH
PREPRINT
REPORTING

Publisher
Actual title
date
↗

Use `Linking.openURL` safely.

Do not claim peer-review, credibility, or source class without support.

If a seeded claim cannot be supported by a credible real source, flag it instead of fabricating evidence.

---

## 13. Ask Thinketh learning modes

Do NOT rebuild Ask.

Add only:

- Quick answer
- Teach me
- Go deep

Default:
Quick answer

### Quick answer
- concise
- answer-oriented
- personalized
- source grounded

### Teach me
- start from demonstrated knowledge
- explain the delta
- use examples
- connect to existing concepts
- optional check-my-understanding CTA

### Go deep
- mechanisms
- caveats
- competing interpretations where relevant
- source distinctions
- more technical depth
- explicit uncertainty

Do not let mode mutate PKS directly.

Keep the selector visually quiet.

---

## 14. Explore

Explore currently feels seeded.

Do not build a large recommendation engine.

Progressively ground Explore in:

1. ready Learning Queue items
2. current development/world data
3. current knowledge state
4. existing static fallback

Every recommendation still needs a reason.

Examples:

`BUILDS ON TODAY'S LEARNING`

Anthropic: Building Effective Agents
6 useful minutes

Why now:
You understand tool use, but your model of orchestration is still incomplete.

`STRENGTHENS A WEAK AREA`

...

`CONNECTS TWO THINGS YOU KNOW`

...

Static fallback remains acceptable if dynamic inputs are unavailable.

---

## 15. Consumer-facing knowledge language

Audit normal UI for raw internal PKS values.

Keep numeric values internally.

Keep them in dev/debug where useful.

Normal product surfaces should favor human-readable states:

- Encountered
- Developing
- Connected
- Verified
- Established

or the closest existing labels.

Prefer:

- Your model strengthened
- New connection verified
- Uncertainty reduced
- Misconception resolved

over:

- mastery 0.42 -> 0.51

Do not break contracts or tests.

Presentation only.

---

## 16. MindGraph polish

Do NOT replace the graph library or architecture.

Preserve curated stable layout.

Enhance with subtle stateful animation:

- updated node activates in coral
- ring expands/fades once
- affected edge can briefly draw/pulse
- selected node transitions smoothly
- labels may fade in
- graph settles quickly

Only animate what the backend/state actually supports.

Do not fake edge changes.

No force simulation.

No ambient graph motion.

---

## 17. Loading states are product moments

Generic loading text is a missed opportunity.

Use truthful process language.

Examples:

`Reading the source…`

`Mapping concepts…`

`Comparing with your Mind…`

`Finding the actual delta…`

`Grounding this in your sources…`

Never show fake percentages.

Never show steps that are not actually happening.

Use subtle transitions between states.

---

## 18. Today

Do not heavily redesign Today.

It already works.

Polish hierarchy so the first few seconds clearly communicate:

- Thinketh read a lot
- most content was filtered
- only meaningful changes survived
- the result is personalized
- there is one obvious next action

Emphasize through typography and spacing, not dashboard cards:

`YOU MISSED 6 THINGS WORTH KNOWING`

`3 MAJOR`
`~11 MINUTES`

`143 filtered`

`CATCH ME UP`

Make filtered count feel like evidence of intelligence, not incidental metadata.

---

## 19. Development detail

Ensure visual sequence is immediately scannable:

WHAT HAPPENED

YOU ALREADY KNEW

WHAT CHANGED

YOUR UPDATED MENTAL MODEL

EVIDENCE / SOURCES

NEXT ACTION

Coral identifies the delta.

Do not use coral decoratively.

Reduce unnecessary cards where the page can carry the content directly.

---

## 20. Storyline

Preserve:

Earlier -> Shift -> Current

Make the juxtaposition clear:

WORLD MODEL
how the field changed

YOUR MODEL
what the user believed
what evidence arrived
what changed
where they are now

Temporal evolution is important, but do not let Storyline become the entire wow factor.

The visual wow should come from the live transformation of knowledge.

---

## 21. Voice

Voice is already working.

Do not destabilize native ElevenLabs/LiveKit.

Only polish if low-risk.

The screen should feel like Thinketh briefing the user, not a phone-call clone.

Possible elements:

- current topic
- listening/thinking/speaking state
- transcript
- concepts currently being discussed
- subtle knowledge trace

Avoid waveform theatrics unless trivial.

---

## 22. Screen-by-screen polish

After functionality is stable, perform a ruthless visual pass.

Review:

- Today
- Development
- Diagnostic
- Knowledge Update
- Mind
- Library
- Resource detail
- Ask
- Explore
- Storyline
- Voice
- onboarding
- profile
- empty states
- error states
- loading states

Look for:

- monotony
- too many flat rows
- too many cards
- giant undifferentiated whitespace
- tiny metadata
- weak visual anchors
- repetitive dividers
- awkward line wraps
- equal-priority actions
- dead-end screens
- generic loading
- unnecessary raw numbers
- unclear next step

Do not redesign for novelty.

Design so the user always knows what matters next.

---

## 23. Motion

Motion must explain causality.

Good:

- fade
- subtle translate
- line draw
- node/ring pulse
- staggered reveal
- tiny scale/tap response
- restrained haptic
- crossfade

Avoid:

- bounce
- confetti
- constant animation
- floating particles
- looping graph movement
- gratuitous parallax
- large cinematic transitions

Normal navigation is fast.

Knowledge-changing moments can breathe slightly longer.

---

## 24. Implementation order

P0
- confirm current tests/build
- protect golden path

P1
- Learning Queue
- Add Resource
- URL ingestion
- resource analysis
- Teach Me the Delta
- real source opening/provenance

P2
- Knowledge Update visual transition
- MindGraph update animation

P3
- consumer-facing PKS cleanup
- Ask modes

P4
- dynamic Explore integration
- full visual polish pass

P5
- optional micro-interactions only if stable

If time pressure appears, cut from the bottom upward.

DO NOT cut:
- real resource ingestion
- Teach Me the Delta
- provenance
- golden path stability

---

## 25. Testing requirements

At minimum verify:

- URL validation
- ingestion failure behavior
- fetch timeout
- content size cap
- safe handling of untrusted page text
- extraction failure behavior
- resource analysis does not mutate PKS
- Teach Me the Delta does not mutate PKS
- diagnostic remains the knowledge-update authority
- source URLs open safely
- existing seeded demo still works
- existing golden tests pass
- typecheck
- lint
- physical iPhone build if native code changed

Do not claim something is working if you did not verify it.

---

## 26. Final demo target

Optimize for this:

1. Today
"You missed 6 things worth knowing."

2. Filtering
"I skipped 143 items because they don't change what you understand."

3. Development
"You already knew this. This is the actual change."

4. Diagnostic

5. Knowledge Update
The user visibly sees their model change.

6. Mind
The updated concept/connection is visible.

7. Library -> Add Resource

8. Paste a REAL URL Thinketh has not seen before.

9. Thinketh analyzes it live.

10. Show:

Full read: 18 min
Useful for you: 6 min

You already understand:
...

New to you:
...

Connected to your Mind:
...

11. Teach Me the Delta

12. Ask if useful

13. Voice
Catch Me Up conversationally

The judge should conclude:

Thinketh is not summarizing information.

Thinketh is calculating the difference between what the world knows and what I know, then maintaining that difference over time.

---

## 27. Definition of done

When finished report:

1. branch name
2. commits
3. what was implemented
4. what was intentionally skipped
5. routes/contracts added
6. migrations if any
7. dependencies added
8. tests/typecheck/lint
9. native device status
10. known risks
11. exact manual demo path
12. exact five-minute verification checklist
13. anything that must not be touched before judging

Favor polished, verified work over breadth.

Start now.
