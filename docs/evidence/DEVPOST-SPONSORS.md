# Sponsor integrations (Devpost copy)

Thinketh keeps a model of what you understand and updates it as the field changes. Each sponsor does one distinct job in that model. The mobile app only ever sees one Thinketh API, and every sponsor call has a timeout and a fallback, so no single service can break the demo.

## Tiger Data: version control for human understanding
Every learning signal is an append-only fact in TimescaleDB hypertables. That includes a diagnostic answer, a "Got it", and a concept that improved because a related one did. Each fact stores the state before, the state after, and a plain-English reason. A continuous aggregate rolls those facts up into a daily mastery curve per concept. That's how Thinketh answers "how has my understanding changed?", not just "what do I know?". One answer in the demo writes 6 transitions: the concept answered, plus 5 related concepts that shift with it.

## MongoDB Atlas: the world-state corpus
Developments, sources, claims, concepts and the concept graph live in Atlas. Ask Thinketh retrieves through Atlas Search. It ranks developments, claims and sources for the question, expands the hits into verbatim claims, and those claims become the "What sources say" layer of the answer. The index is set up for vector search too; it switches on when an embeddings key is added.

## Backboard: persistent learner memory
One stable Backboard assistant holds the learner's qualitative context: explanation preferences, recurring misconceptions, and current topics. Memory lives at the assistant level, so a brand-new thread recalls it. Thinketh reads it on every Ask and writes back what it learns, such as a misconception revealed by a wrong answer. Backboard never holds the numbers: mastery and uncertainty stay in Thinketh's own transparent model.

## Supabase: app state and API
Supabase holds profiles, feature flags and the mapping from users to sponsor ids, with row-level security on user data. The API reads its feature flags from Supabase, so we can hide an unstable feature (like voice) without shipping a new build.

## Not live at the time of writing
- ElevenLabs (Catch Me Up voice): the server side is built, but no API key or agent is configured yet. The screen plays its transcript fallback.
- Claude (phrasing, Ask inferences, diagrams, memory aids): the adapter is built and validated with Zod, but no API key is configured. Deterministic fallbacks are used.

Update these two sections if the keys are added before submission.
