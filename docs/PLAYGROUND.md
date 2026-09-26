# Thinketh Playground

Two Minds in one learning space. Thinketh works out what can usefully move between two people, has one teach the other, and checks whether the idea transferred. It updates the learner's knowledge model only after they demonstrate it.

> Mongo models the changing world. Tiger models your changing understanding. Backboard remembers qualitative things about you that numbers cannot. Claude reasons over the delta. Muse orchestrates the shared learning environment. ElevenLabs makes the interaction conversational. Thinketh decides what you need next.

**Live status (2026-09-26):** Mongo, Tiger, Backboard, Claude, ElevenLabs and Supabase are live. **Muse is not configured yet.** Its conductor is built behind a strict tool surface, and the deterministic conductor makes the same kind of decisions until `MUSE_API_KEY` and `MUSE_MODEL` are set. Every room shows which one conducted.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Mindprint layout | `packages/mindprint` | Deterministic semantic layout for one Mind or two side by side: clusters, labels, edge routing and collision validation. Pure TypeScript, tested. |
| Mindprint renderer | `apps/mobile/src/mindprint` | SVG painter plus a Reanimated and Gesture Handler camera (pan, pinch, tap, double-tap to reset). |
| MindSnapshot | `playground/room.ts` → `snapshot()` | The permissioned view of a Mind that a room sees. |
| Collaborative delta | `engine/collaborative.ts` | Who can teach whom, shared strengths, shared gaps and conflicts. Deterministic and explainable. |
| Rooms | `playground/room.ts`, `/playground/*` routes | Lifecycle, scenes and the event log. The server is the source of truth. |
| Conductor | `playground/conductor.ts` | Muse (live when configured) or the deterministic fallback, behind one validated tool surface. |
| Realtime | `playground/realtime.ts`, `apps/mobile/src/lib/roomChannel.ts` | Supabase Realtime Broadcast and Presence, with polling underneath. |

## MindSnapshot (privacy boundary)

Joining a room is the consent act. From that moment the room sees, for each concept: level, mastery, uncertainty, evidence count, whether the evidence is verified (a correct diagnostic on record), and whether a misconception is flagged. It does not see which misconception. It never sees Ask history, Backboard memories, preferences or the sources you've read. The snapshot lists those exclusions itself (`excludes`).

## Collaborative delta (deterministic)

For each concept, both sides are compared under fixed rules (`COLLAB_RULES`):

- **Teach A → B:** the teacher has mastery ≥ 0.7, uncertainty ≤ 0.3, at least 3 pieces of evidence and no flagged misconception, and is at least 0.3 ahead of the learner. Score = gap × certainty × (verified ? 1 : 0.8) × concept importance.
- **Conflict:** there's a gap of at least 0.3, but the stronger side misses the teaching bar. Nobody is assigned, and the reason names the part of the bar that was missed.
- **Shared strength:** both ≥ 0.7.
- **Shared gap:** both < 0.35. The conductor teaches it to both.

Every item carries its rule, both sides' numbers and a one-sentence reason. Tap any item in the overview to see them. With the seeded Minds this gives Nadani → Stefen on Evaluator Architectures (verified evidence), Stefen → Nadani on Agent Tool Use, and Memory Consolidation as the shared gap.

## Muse's exact responsibility

Muse chooses **what the room looks at next**, and nothing else. Its entire world is the following tools:

`get_room_state` · `spotlight_scene` · `assign_peer_teacher` · `request_explanation` · `ask_transfer_question` · `teach_shared_gap` · `introduce_resource` · `advance_scene` · `end_session`

- **What it sees:** a minimized view of the room: names, the concepts in play, and flags showing progress. It never sees numbers, memories or Ask history.
- **What it cannot change:** there is **no** tool that sets mastery, marks something understood, changes uncertainty or verifies anything.
- **Validation:** every proposed call is checked server-side against the room, twice (in the Muse adapter and again before it's applied). Only known tools and known arguments are accepted, strings are capped at 280 characters, and a teacher/learner/concept can be assigned only if it came from the computed delta. Transfer questions must follow an explanation.
- **Fallback:** on a timeout, an error or an invalid call, the deterministic conductor decides from the same view, and the room keeps working.
- **Integration:** an OpenAI-compatible tool-calling endpoint (`MUSE_API_BASE`, default `https://api.llama.com/compat/v1`), with `MUSE_API_KEY` and `MUSE_MODEL` kept server-side only. It is unverified against the real Muse endpoint until a key is provided.

## Thinketh's exact evidence responsibility

Only the evidence engine changes a Mind, and only through the path every diagnostic uses:

1. The teacher explains in their own words. That is **not** evidence for anyone.
2. The learner answers a **transfer question** in a new context (for example, "Apply that idea to an autonomous coding agent. Where should evaluation happen, and why?"). It is a Playground-only rubric item that normal adaptive selection never picks.
3. `service.answerDiagnostic(learner, questionId, answer)` runs. Claude reports which rubric ideas the answer covered; `scoreRubric` scores them deterministically; and `kindForCorrectness` turns the score into an observation.
4. `transition()` applies the deterministic update rule and writes a reason ("Updated because you correctly answered a transfer question applying peer-taught evaluator design to a coding agent. Mastery rose 0.30 → 0.43 …"). The previous state, observation, resulting state and timestamp are stored.
5. Tiger records the transition (`appendObservation` + `appendTransition`), exactly as for any diagnostic.
6. The room shows "Knowledge moved" only if the observation was `diagnostic_correct`. Otherwise it says "Not yet" and shows what the answer did show.

## Supabase Realtime

The server owns every room. `GET /playground/rooms/:id` always returns the whole truth.

- **Broadcast** (server → phones) carries semantic events: `participant_joined`, `teacher_assigned`, `explanation_submitted`, `transfer_question`, `transfer_verified`, `shared_gap_taught`, `resource_introduced`, and so on. The payload is only `{seq, type}`, and each phone refetches the room and animates locally. Nothing is replicated frame by frame.
- **Presence** (phone ↔ phone) carries low-frequency participant state: who's here, which scene they're on, and whether they're following Muse. It's debounced, since Supabase rate-limits presence.
- **Keys:** clients get only the public anon key (RLS protects every table; checked). The service-role key never leaves the server, and a test asserts it's absent from room responses.
- **Polling:** each phone polls the room every 1.5 s regardless, so a dead socket only makes updates slower.

Measured between two browser sessions on one room: arrival reached the host in about 0.6 s, the overview reached the guest in about 0.3 s, and teaching and transfer propagated in 0.1–0.3 s.

## Knowledge transfer lifecycle

`waiting → arrival → (comparing) → overview → peer_teaching → transfer → knowledge_moved → shared_gap → resource → ended`

The coral trace runs from the teacher's concept to the learner's while they teach. When the transfer is verified, it draws once and leaves a ring on the learner's concept. Then it goes quiet.

## Resource dual delta

Muse brings one source into the room. Thinketh runs its normal resource pipeline once per participant: read, map concepts, compare with **that** person's Mind, then compute the delta. Each person gets their own useful minutes, new ideas and focus, and the stages (SOURCE → CONCEPTS → YOUR MIND → DELTA) show live. The conductor's note is deterministic from the two deltas ("Stefen: focus on evaluator architectures … Nadani: …"). The page says "Different delta" only when the two deltas actually differ.

## Demo fallback

- **One-device mode:** "Bring in Nadani" seats the seeded Nadani persona, and the host phone types what she says. It's clearly labelled, and her explanation still isn't evidence. The whole flow works on one phone.
- **Two phones:** the second phone taps "Have a code? Join a Playground" and joins as Nadani.
- **Conductor:** Muse if configured, otherwise the deterministic fallback. The same flow either way.
- **Realtime:** if the socket is down, polling carries the room.
- **Claude grading:** if Claude times out, the keyword fallback grades against the same rubric.

## API

`POST /playground/rooms` · `POST /playground/join` · `GET /playground/rooms/:id` · `POST …/demo-guest` · `…/compare` · `…/conduct` · `…/explain` · `…/answer` · `…/resource` · `…/leave`. All require the app key. Rooms are visible only to their participants, and only the host can act for a seeded demo persona in their own room.
