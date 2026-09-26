# Sponsor integrations (Devpost copy)

Thinketh keeps a model of what you understand and updates it as the field changes. Each sponsor does one distinct job in that model. The mobile app only ever sees one Thinketh API, and every sponsor call has a timeout and a fallback, so no single service can break the demo.

## Tiger Data: version control for human understanding
Every learning signal is an append-only fact in TimescaleDB hypertables. That includes a diagnostic answer, a "Got it", and a concept that improved because a related one did. Each fact stores the state before, the state after, and a plain-English reason. A continuous aggregate rolls those facts up into a daily mastery curve per concept. That's how Thinketh answers "how has my understanding changed?", not just "what do I know?". One answer in the demo writes 6 transitions: the concept answered, plus 5 related concepts that shift with it.

## MongoDB Atlas: the world-state corpus
Developments, sources, claims, concepts and the concept graph live in Atlas. Ask Thinketh retrieves through Atlas Search. It ranks developments, claims and sources for the question, expands the hits into verbatim claims, and those claims become the "What sources say" layer of the answer. The index is set up for vector search too; it switches on when an embeddings key is added.

## Backboard: persistent learner memory
One stable Backboard assistant holds the learner's qualitative context: explanation preferences, recurring misconceptions, and current topics. Memory lives at the assistant level, so a brand-new thread recalls it. Thinketh reads it on every Ask and writes back what it learns, such as a misconception revealed by a wrong answer. Backboard never holds the numbers: mastery and uncertainty stay in Thinketh's own transparent model.

## Supabase: app state, API and the Playground's realtime layer
Supabase holds profiles, feature flags and the mapping from users to sponsor ids, with row-level security on user data. The API reads its feature flags from Supabase, so we can hide an unstable feature (like voice) without shipping a new build. In the Playground, Supabase Realtime connects two phones in one room: Broadcast carries semantic room events (a teacher was assigned, an answer was verified), and Presence carries who's here and whether they're following Muse. The channel carries only event types and sequence numbers; each phone refetches the room from the Thinketh API, which stays the source of truth.

## Claude: the intelligence model
Claude grades short answers against a rubric (Thinketh scores the covered ideas deterministically), phrases each development's delta, writes Ask's inferences, and reads any link you save to find what's new to you. In the Playground, Claude grades the learner's transfer answer, and that grade is the only thing that can change their Mind.

## ElevenLabs: Catch Me Up
A conversational voice agent briefs you on what changed today, seeded with your own delta.

## Muse (Playground conductor)
Muse decides what the room looks at next through a strict, server-validated tool surface (spotlight, assign a peer teacher, ask a transfer question, teach a shared gap, introduce a resource, advance, end). It has no tool that can change anyone's knowledge. Live with Muse Spark 1.3 on Meta's Model API (verified 2026-09-26: Muse assigned Nadani to teach Stefen evaluator architectures, then asked the transfer question; both calls passed server-side validation). If Muse is slow or proposes anything invalid, a deterministic conductor decides instead, and the app says which one conducted.
