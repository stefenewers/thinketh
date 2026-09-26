# CLAUDE.md — Thinketh HackGT 13

You are helping build **Thinketh**, a mobile personal AI intelligence and learning system for HackGT 13.

## Product thesis

Thinketh is not a news reader, bookmark manager, generic RAG chat app, or quiz generator.

Thinketh maintains:

1. **World State** — an evolving representation of meaningful developments in a field.
2. **Personal Knowledge State** — an evolving representation of what a specific user understands.
3. **Delta Intelligence** — the difference between the world state and that user's knowledge state.
4. **Adaptive Learning** — the next intervention most likely to improve the user's understanding.

The emotional promise is:

> Your knowledge continuously updates itself as the world changes.

The shortest framing:

> Your brain gets a software update.

The fundamental product rule:

> No new information = no card.

The atomic object is a **Development**, not an article.

## HackGT target

Primary track: **Oracle of the Deep (ML/AI)**.

Primary competitive goals:
- Best Overall
- Oracle of the Deep first place

Sponsor integrations:
- Backboard: persistent memory / Claude-backed assistant layer
- Tiger Data: temporal knowledge and world-state events
- MongoDB Atlas: semantic development/concept/source store + vector search
- ElevenLabs: Catch Me Up conversational voice
- Notability: documented design/build process
- .tech: deployment/domain if available
- CREATE-X: startup interest

Do not introduce Cursor, Grok, Grok Imagine, SpaceXAI, Solana, Visa, NSA, Impiricus, or Meta Rooms into the core build.

## Mobile architecture

Use:
- Expo
- React Native
- TypeScript
- Expo Router
- Supabase Auth + app/profile/demo orchestration data
- Server-side API / Edge Functions for secrets and sponsor adapters
- Backboard adapter
- MongoDB Atlas adapter
- Tiger Data adapter
- ElevenLabs adapter
- Claude as the intelligence model

Never expose secret API keys in the React Native bundle.

## Visual constitution

The UI direction is already established. Do not invent a new visual identity.

Target feeling:
- Apple
- Arc
- Linear
- premium editorial publishing

It must feel:
- calm
- intelligent
- premium
- minimal
- deliberate
- trustworthy

Avoid:
- generic vibe-coded SaaS
- dashboard grids
- AI gradient spam
- crypto aesthetics
- glassmorphism everywhere
- endless tiny cards
- random pills/badges
- meaningless charts

Use:
- large editorial serif moments
- clean sans-serif navigation and metadata
- warm off-white / white / charcoal / gray
- restrained coral/peach accent
- generous whitespace
- purposeful motion only

## Required mobile screens

1. Onboarding / profile initialization
2. Today / Catch Up
3. Development Detail
4. Mind / Personal Knowledge State
5. Library
6. Explore
7. Ask
8. Adaptive diagnostic modal/screen
9. Catch Me Up voice screen
10. Storyline / temporal knowledge view if time permits

Bottom nav:
Today · Library · Explore · Ask

Mind can be reached from profile / Today / development state update.

## Required development-detail sections

- headline
- impact / significance
- What happened
- Why this matters to you
- You already knew
- What changed
- Why this changes your mental model
- Go deeper
- Related concepts
- actions:
  - Got it
  - I already knew this
  - Explain deeper
  - Check my understanding
  - Visualize this
  - Make it stick

"Visualize this" and "Make it stick" must not rely on Grok. For the hackathon, implement these as structured, deterministic visual/analogy experiences produced from Claude output and rendered with native UI components/SVG where possible.

## Intelligence rules

Never let an LLM assign arbitrary mastery percentages with no explanation.

Knowledge state updates must combine explicit signals and deterministic update rules.

Store:
- mastery
- confidence
- uncertainty
- recency
- evidence count
- misconception flags

Every knowledge-state update should have:
- previous state
- observation
- update reason
- resulting state
- timestamp

The judge must be able to see *why* Thinketh changed its model.

## Demo-first engineering rules

1. Protect the golden demo path.
2. Build vertical slices before broad feature coverage.
3. Every external service gets an adapter with a deterministic local/demo fallback.
4. Never block the UI on a sponsor API.
5. Seed a strong demo user and demo dataset.
6. Avoid speculative abstractions.
7. Avoid infrastructure rewrites.
8. Type all shared data contracts.
9. Log meaningful intelligence decisions.
10. If a feature is unstable, hide it rather than demo it half-working.

## Git / parallel work

Two humans are implementing concurrently.

Recommended:
- `main` protected as integration branch.
- `stefen/mobile` for mobile UI.
- `nadani/intelligence` for backend/intelligence.
- optional worktrees for isolation.

Do not edit another owner's files without coordinating.
Use small commits with descriptive messages.
Prefer additive files to large shared-file rewrites.

## Definition of done

Thinketh is done enough to demo when the following works on a phone:

Today -> Development -> Knowledge Delta -> Diagnostic -> Knowledge State Update -> Mind view

Voice and additional sponsor integrations are valuable only after that loop is stable.

## Integration notes (read before touching contracts)

API envelopes are canonical in `packages/contracts/src/api.ts`; `packages/intelligence/src/contracts.ts` only re-exports them plus backend-only types. Why this changed, which backend behaviours the mobile app depends on, and how to verify a backend change against the app: `docs/INTEGRATION-NOTES.md`.
