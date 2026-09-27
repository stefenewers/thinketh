# Thinketh Playground

Two Minds in one learning space. Thinketh works out what can usefully move between two people, has one teach the other, and checks whether the idea transferred. It updates the learner's knowledge model only after they demonstrate it.

> Mongo models the changing world. Tiger models your changing understanding. Backboard remembers qualitative things about you that numbers cannot. Claude reasons over the delta. Muse orchestrates the shared learning environment. ElevenLabs makes the interaction conversational. Thinketh decides what you need next.

> **Removed on 2026-09-27 at the product owner's request:** the guided session (Muse conductor, "Start session" and the session plan, peer teaching with agent-prepared lessons, transfer questions, the shared-gap and shared-source scenes) and the post-exchange "apply it yourself" check. Nothing in the Playground asks a person to answer in their own words any more. The Playground is now: create a room, join by code, or "Bring in Nadani" → "Compare our Minds" → "Let our agents exchange" → saved sourced takeaway → Grokbot "Challenge this idea" → stop/close → leave. The sections below that describe the removed flow are kept as history. Stored rooms still parse (the contract fields are marked deprecated), and a room left in a removed scene is shown as the overview.

**Live status (2026-09-26):** Mongo, Tiger, Backboard, Claude, ElevenLabs, Supabase and **Muse** are live. Muse (`muse-spark-1.3` on Meta's Model API) conducts the room behind a strict tool surface; if it times out, errs or proposes anything invalid, the deterministic conductor decides instead. Every room shows which one conducted.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Mindprint layout | `packages/mindprint` | Deterministic semantic layout for one Mind or two side by side: clusters, labels, edge routing and collision validation. Pure TypeScript, tested. |
| Mindprint renderer | `apps/mobile/src/mindprint` | SVG painter plus a Reanimated and Gesture Handler camera (pan, pinch, tap, double-tap to reset). |
| MindSnapshot | `playground/room.ts` → `snapshot()` | The permissioned view of a Mind that a room sees. |
| Collaborative delta | `engine/collaborative.ts` | Who can teach whom, shared strengths, shared gaps and conflicts. Deterministic and explainable. |
| Rooms | `playground/room.ts`, `/playground/*` routes | Lifecycle, scenes and the event log. The server is the source of truth. |
| Agent exchange | `playground/exchange/engine.ts` | Muse agents in separate contexts teach, question and keep a sourced takeaway; Thinketh checks it. (`playground/conductor.ts` was removed on 2026-09-27.) |
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
- **Validation:** every proposed call is checked server-side against the room, twice (in the Muse adapter and again before it's applied). Only known tools and known arguments are accepted, strings are capped at 280 characters, and a teacher/learner/concept can be assigned only if it came from the computed delta, Thinketh can verify it (`assessmentAvailable`), and it is an unfinished item of the session plan. A shared gap must also be in the plan unless the people in the room asked for it. Transfer questions must follow an explanation.
- **Fallback:** on a timeout, an error or an invalid call, the deterministic conductor decides from the same view, and the room keeps working.
- **Integration:** Meta Model API's OpenAI-compatible chat completions (`MUSE_API_BASE`, `MUSE_API_KEY`, `MUSE_MODEL`, all server-side only). Muse Spark reasons before it answers, so the call uses `reasoning_effort: "low"` and a 1,500-token budget (reasoning counts against it), and `tool_choice: "auto"` (the only value the API accepts); a reply without a tool call falls back. Verified live 2026-09-26: Muse chose `assign_peer_teacher` (Nadani → Stefen, Evaluator Architectures) in about 4 s, then `ask_transfer_question` after the explanation in about 3 s. Both passed validation and were recorded with `actor: "muse"`.

## Thinketh's exact evidence responsibility

Only the evidence engine changes a Mind, and only through the path every diagnostic uses:

1. The teacher explains in their own words. That is **not** evidence for anyone.
2. The learner answers a **transfer question** in a new context (for example, "An AI agent can approve customer refunds. Where would you add an independent check before money is sent, and why?"). It is a Playground-only rubric item that normal adaptive selection never picks.
3. `service.answerDiagnostic(learner, questionId, answer)` runs. Claude reports which rubric ideas the answer covered; `scoreRubric` scores them deterministically; and `kindForCorrectness` turns the score into an observation.
4. `transition()` applies the deterministic update rule and writes a reason ("Updated because you correctly answered a transfer question applying peer-taught evaluator design to a refund-approving agent. Mastery rose 0.30 → 0.43 …"). The previous state, observation, resulting state and timestamp are stored.
5. Tiger records the transition (`appendObservation` + `appendTransition`), exactly as for any diagnostic.
6. The room shows "Knowledge moved" only if the observation was `diagnostic_correct`. Otherwise it says "Not yet" and shows what the answer did show.

## Dynamic transfer challenges

Peer teaching is no longer limited to concepts with a prepared question. Any teaching move the collaborative delta finds can be verified, as long as Thinketh can build a fair challenge for it.

1. **Seeded first.** Evaluator Architectures keeps its hand-written question (`dq-evaluators-transfer-coding-agent`). It's the golden demo fixture.
2. **Generated.** For any other concept, `service.transferChallenge` asks Claude (the existing model adapter, server-side) for a structured challenge built only from trusted Thinketh data: the concept's definition, its related concepts, the claims Thinketh holds about it, and the teacher's explanation (treated as data). The output is validated on the server:
   - 3–5 rubric ideas, each with grounding keywords;
   - a prompt that tests application in a genuinely new context rather than recall;
   - no rubric idea and no stretch of the teacher's words in the prompt;
   - it must assess the taught concept.
3. **Grounded fallback.** If Claude times out, errors or fails validation, a deterministic challenge is built from the concept's definition and its claims. For example: "Picture a customer-support agent… Using what you just learned about when AI should use a tool, what would you do differently, and why?"
4. **Fail closed.** If there isn't enough grounding for at least three rubric ideas (today: MCP, memory consolidation and context compaction), the concept is not assessable. It's never assigned, so nobody is handed a question Thinketh can't grade fairly.

The challenge is registered as a Playground-only diagnostic, and the room stores its id. The learner sees exactly that item's prompt, and `answerDiagnostic` grades exactly that item, with no regeneration in between. It then follows the same steps as every diagnostic: grader → `scoreRubric` → observation → deterministic update → Tiger. Claude creates assessment structure; Thinketh evaluates the evidence.

## Session planner

"Start session" runs a real plan. The time budget (7 minutes by default) is a planning constraint, not a countdown. Thinketh uses it to decide which learning moves are worth doing. The plan is computed immediately, "Start session" begins the first move at once, and people can do one move, several or all of them, or end early. After the delta is computed, `planSession` (`engine/sessionPlan.ts`) chooses the most valuable valid moves that fit the time budget. It's deterministic.

- **Candidates:**
  - the best assessable peer-teaching move in each direction;
  - the strongest shared gap;
  - the shared source.
- **Value:** the delta's own evidence scores. Peer teaching is scored as gap × teacher certainty × (verified ? 1 : 0.8) × (0.5 + importance). A shared gap is scored as (1 − best mastery) × (0.5 + importance). The source has a small fixed value.
- **Durations:** planning estimates kept in one place (`ACTIVITY_MINUTES`): peer teaching 2.5 min, shared gap 2 min, source 2 min.
- **Selection:** highest value first while it fits the budget, then run in teachable order (peer teaching, then the shared gap, then the source). Any positive budget works.
- **Seeded demo plan (7 min):** Nadani → Stefen on Evaluator Architectures (2.5 min), Stefen → Nadani on Agent Tool Use (2.5 min), then Muse → both on Memory Consolidation (2 min).

Muse receives the plan and its next step, and conducts it. It can't replace it with an unplanned or unverifiable move; the validation above rejects that. The deterministic conductor follows the same plan. Under "Start session", the overview says what was computed ("3 learning moves planned for the next 7 minutes", from the real plan), and "View learning plan" shows only the planned moves. Each move lists its estimate, who teaches whom, the concept and its reason in plain language ("Nadani has strong verified evidence here while Stefen is only starting out.").

## Supabase Realtime

The server owns every room. `GET /playground/rooms/:id` always returns the whole truth.

- **Broadcast** (server → phones) carries semantic events: `participant_joined`, `teacher_assigned`, `explanation_submitted`, `transfer_question`, `transfer_verified`, `shared_gap_taught`, `resource_introduced`, and so on. The payload is only `{seq, type}`, and each phone refetches the room and animates locally. Nothing is replicated frame by frame.
- **Presence** (phone ↔ phone) carries low-frequency participant state: who's here, which scene they're on, and whether they're following Muse. It's debounced, since Supabase rate-limits presence.
- **Keys:** clients get only the public anon key (RLS protects every table; checked). The service-role key never leaves the server, and a test asserts it's absent from room responses.
- **Polling:** each phone polls the room every 1.5 s regardless, so a dead socket only makes updates slower.

Measured between two browser sessions on one room: arrival reached the host in about 0.6 s, the overview reached the guest in about 0.3 s, and teaching and transfer propagated in 0.1–0.3 s.

## Knowledge transfer lifecycle

`waiting → arrival → overview → peer_teaching → transfer → knowledge_moved → shared_gap → resource → ended`

The coral trace runs from the teacher's concept to the learner's while they teach. When the transfer is verified, it draws once and leaves a ring on the learner's concept. Then it goes quiet.

## The room on screen (one continuous canvas)

One canvas (`MindVenn`) stays mounted from the overview through teaching, transfer, the outcome and the shared gap. What it shows is derived by `apps/mobile/src/lib/roomStory.ts` from the room the server returns, plus the request this device has in flight. No timer ever advances a step.

| Beat | Driven by | On the canvas |
|---|---|---|
| Difference found | `delta_ready` (actor **thinketh**) and the plan's next peer move | The same concept is lit in both Minds, with one word each ("verified", "starting out") and a faint dashed route. Numbers and rule are behind the rail. |
| Muse choosing | this device's `conduct` request in flight | Muse mark pulses; "Muse is choosing the next move from Thinketh's plan…", then after 8 s an honest note that the planner steps in if Muse can't. |
| Muse's move | `teacher_assigned` with `data.by` = `muse` or `fallback` | Muse anchors above the teacher → learner path, labelled "Muse" or "Planner". |
| Teaching | scene `peer_teaching` | The coral path travels 42% of the way and breathes. The explanation is a perspective, not proof. |
| Evidence checkpoint | `transfer_question` (scene `transfer`) | A gate sits at the learner's side of the path; the path stops at 64%. |
| Grading | this device's `answer` request in flight | The head at the gate breathes; "Thinketh is grading…". |
| Verified | `transfer_verified` (actor **thinketh**) with the recorded transition | The path completes (the only beat that reaches 100%), the learner's concept changes, and the real before → after is shown. The halo and haptic play once per verified event on this device (keyed by room id + event seq), never on a refetch or remount. |
| Not yet | `transfer_not_verified` | The path turns grey and stays at the gate. There's no head, halo or haptic, and the next move is offered. |
| Shared gap | `shared_gap_taught` | Both concepts lit, Muse between the Minds, no path. |

The **What just happened** rail lists the current exchange from the recorded events: Thinketh found a teaching gap → Muse (or Planner) assigned the teacher → the teacher explained → Thinketh asked for transfer → answer verified / not verified → Mind updated / recorded. Tap it for each step's recorded detail (rule and numbers, the move's conductor, the explanation, the challenge and its source, the grader's feedback, the transition and its reason). It never shows invented agent thoughts. "Following Muse" can be stopped at any time; exploring shows the full two-Mind canvas with pan and pinch. There, a teaching route is dashed and only a verified one is solid. In one-device mode the persona's input says plainly that it's a demo persona typed on this phone.

The comparison is Thinketh's: `compare_started` is a Thinketh event, and there's no longer a timed "Muse is comparing" checklist.

## The room (pixel agents)

The Playground is one small room that stays mounted for the whole session, from before a room exists to the end. Stefen's agent and Nadani's agent arrive, approach each other, teach, answer and react. Everything they do comes from the room the server returns. Native controls, text input, sheets and the evidence rail sit beneath it in a compact action area.

**Truth.** `projectPlayground(room, me, pending)` in `apps/mobile/src/components/playground/world/worldState.ts` is pure. It turns the room, the viewer and this device's in-flight request (`compare`, `conduct`, `explain`, `answer`) into a `WorldView`:
- where each agent stands and which way they face
- the teacher and the learner, taken from `teaching`, `transfer` or `plan` and never assumed, so the reverse move works
- the idea object and its state
- Thinketh's checkpoint and the learner's Mind
- Muse's cue, labelled "Planner" when the fallback made the move
- Thinketh's own action (comparing or grading)
- a "Now" line: who is teaching, what idea, what Thinketh is waiting for, and whether it was verified

It reuses `stageState` and reads only permissioned snapshot and event data. There is no separate game state that could disagree with the room.

| Room state | On screen |
|---|---|
| No room / waiting | Your agent alone in the room; the code and consent text below. |
| Arrival | The guest walks in through the door, **once, if this device saw the join happen**. Compare stays your action. |
| Comparing | Thinketh's light pass across both agents while the request is in flight. |
| Overview | The strongest teachable difference floats between them as an idea ("can move"). |
| Muse choosing | Muse's cue pulses: "Muse · choosing…". |
| Teaching | The teacher walks up to the listener and faces them; the idea is "being taught". One-device mode says the host is typing for the seeded persona. |
| Checkpoint | The idea stops before Thinketh's gate, short of the learner's Mind (dashed ring). |
| Grading | The gate pulses "GRADING"; the idea stays put. |
| Verified | Only after `transfer_verified`: the idea enters the learner's Mind, the ring turns solid, and the learner hops once. The real numbers and reason are below. |
| Not verified | The idea stays at the gate ("NOT YET"). No motion, no haptic, and the real feedback is shown. |
| Shared gap / source | Both agents face one shared idea or source. No checkpoint, no transfer. |
| Ended | Every recorded move with verified or not (`sessionOutcome`), and See your Mind. |

**Once only.** A module-level map keeps the seq at which this device first saw each room, and `freshEffects` returns only newer joins and verifications that haven't played. A refetch, reconnect, remount, return or late join starts settled. Characters and the idea start at their settled places on mount and walk only when the projected place changes while mounted.

**Stale responses.** `acceptRoom` (`lib/roomSync.ts`) orders polls, realtime refetches and action responses by `seq`:
- an older room never replaces a newer one
- same-seq resource progress still lands

**Camera.** Follow shows the whole room. Explore zooms slightly and allows a limited pan, with "Return to live". Camera state never feeds back into the learning state.

**Rendering.** The characters are pre-sliced Pixel Office strips (`assets/playground/pixel-office/`, with `ATTRIBUTION.md`). They're described in `world/assets.ts`, including where each frame came from.
- **Frames:** the idle loop (5 frames) and the stepping cycle (10 frames) advance on the UI thread with Reanimated.
- **Facing:** every source frame faces three-quarters right, so sprites are mirrored to face left. There is no talking or handing-over animation in the pack, so teaching is shown through position, facing and the idea object.
- **Pausing:** rendering pauses when the app is backgrounded or another screen covers the Playground.
- **Reduced motion:** agents and the idea jump to their places, and frames hold.

**Why not Skia (yet).** A spike rendered the room with `@shopify/react-native-skia` 2.6.2 on web and built it for the simulator. The blocker is the demo phone:
- its installed dev client has no Skia native module
- a bundle that imports Skia would break the Playground until the client is rebuilt
- the phone was unavailable to rebuild

Pre-sliced PNG frames with native images and Reanimated need no native change. The world state is renderer-independent, so moving to a Skia Atlas later only replaces `Character` and `WorldCanvas`.

**Secondary view.** "Inspect both Minds as a diagram" swaps the room for the earlier Mind diagram (`room/RoomScene.tsx`), which draws `projectRoomToWorld` from `lib/roomWorld.ts`. The two are never shown side by side.

## Resource dual delta

Muse brings one source into the room: the known-safe default, or **any** link someone pastes with "Use another source" (article, docs page, PDF or YouTube). It goes through the same hardened resource pipeline as everywhere else: URL validation, SSRF checks, redirect validation, size and PDF limits, YouTube transcripts, reader fallback, prompt-injection handling and timeouts. The page is fetched and extracted **once**, then personalized separately against each participant's Mind: read, map concepts, compare with **that** person's Mind, then compute the delta. A blocked or unreadable source fails honestly ("I couldn't read it for you"), and the session and the safe default stay available.

The safe default is Claude's tool-use documentation. `scripts/resource-asymmetry.mjs` read all 11 known-safe sources against both demo Minds through the live pipeline, and this one gave the clearest real difference. It measured the same twice: Stefen ~3 useful minutes (focus: agent memory), Nadani ~5 (focus: agent tool use). The previous default, "Building effective agents", gave both ~5–6 minutes and 5 ideas. The numbers are always computed and never adjusted. Each person gets their own useful minutes, new ideas and focus, and the stages (SOURCE → CONCEPTS → YOUR MIND → DELTA) show live. The conductor's note is deterministic from the two deltas ("Stefen: focus on evaluator architectures … Nadani: …"). The page says "Different delta" only when the two deltas actually differ.

## Demo fallback

- **One-device mode:** "Bring in Nadani" seats the seeded Nadani persona, and the host phone types what she says. Her explanation still isn't evidence for anyone; the transfer question is. (This is documented here and no longer printed in the product.) The whole flow works on one phone.
- **Diagnostics:** the room's provenance (who conducted, how it syncs, the room code) is hidden from the normal UI. Long-press the "Playground" title to show it.
- **Two phones:** the second phone taps "Have a code? Join a Playground" and joins as Nadani.
- **Conductor:** Muse if configured, otherwise the deterministic fallback. The same flow either way.
- **Realtime:** if the socket is down, polling carries the room.
- **Claude grading:** if Claude times out, the keyword fallback grades against the same rubric.

## API

`POST /playground/rooms` · `POST /playground/join` · `GET /playground/rooms/:id` · `POST …/demo-guest` · `…/compare` · `…/share` · `…/exchange` · `…/exchange/advance` · `…/exchange/stop` · `…/exchange/close` · `…/challenge` · `…/challenge/advance` · `…/challenge/stop` · `…/leave` · `GET /takeaways` · `GET /takeaways/:id`. (`…/conduct`, `…/explain`, `…/answer`, `…/resource` and `…/exchange/check` were removed on 2026-09-27 at the product owner's request.) All require the app key. Rooms are visible only to their participants, and only the host can act for a seeded demo persona in their own room.

## Presentation labels (simple outside, deep inside)

Concept wording lives in one place, `packages/contracts/src/presentation.ts`, with three levels. Each surface uses the one that fits it:

| Level | Example | Where |
|---|---|---|
| Canonical | Evaluator Architectures | Concept inspector, evidence, "Why Thinketh changed its model", delta details ("Technical concept: …"), docs |
| Graph | Evaluators | Compact Mindprint node labels |
| Narrative | AI checking its own work | Headlines in the live learning flow: overview, plan, peer teaching, shared gap, Not yet |

A fourth form, `topic` ("how AI should check its own work"), is the narrative idea as a phrase inside a sentence: Muse's lines, the plan rationale, "Next: …", "Strengthened your thinking on …", the shared-source focus. Muse's room view carries the topic, and its system prompt asks for plain language.

| Concept id | Canonical | Graph | Narrative |
|---|---|---|---|
| evaluator-architectures | Evaluator Architectures | Evaluators | AI checking its own work |
| agent-tool-use | Agent Tool Use | Tool Use | When should AI use a tool? |
| agent-memory | Agent Memory | Agent Memory | What should AI remember? |
| retrieval | Retrieval (RAG) | Retrieval | When should AI look something up? |
| context-windows | Context Windows | Context | How much can AI keep in mind? |
| memory-consolidation | Memory Consolidation | Consolidation | What is worth remembering long-term? |
| long-running-agents | Long-running Agents | Long-running | How can AI keep working without losing the plot? |
| context-compaction | Context Compaction | Compaction | How does AI keep the important parts? |
| mcp | Model Context Protocol | MCP | How does AI connect to tools? |

This is wording only. Concept ids, the graph, knowledge state, the update math, Tiger history, diagnostic ids and the collaborative delta are unchanged. The golden transfer question was reworded from a coding agent to a refund agent, but it keeps the id `dq-evaluators-transfer-coding-agent` and the same four rubric ideas; keywords were only added, so strong answers grade correct in either register (`test/presentation.test.ts`). Claude's transfer-challenge and teach prompts get the same plain-language instruction. It's never applied to source quotes, source titles, stored evidence or canonical names.

## Demo

### Safe golden path

1. Reset (Demo controls: long-press the Thinketh mark on Today → Reset demo).
2. Today → Catch Me Up: captions and the Mind react; interrupt; ask; say "I'm done".
3. Playground → Invite a collaborator → Bring in Nadani → Compare our Minds. "3 learning moves planned for the next 7 minutes" appears; "View learning plan" shows them.
4. Start session. Muse: "Nadani, teach Stefen how AI should check its own work." Nadani answers the prompt "Why shouldn't an AI always be the final judge of its own output?" in about ten seconds. Thinketh: "Apply it somewhere new." Transfer question: "An AI agent can approve customer refunds. Where would you add an independent check before money is sent, and why?" Stefen answers (a strong answer names a separate check, where it sits, why self-checking misses mistakes, and what happens when the check fails). Knowledge moved: "Strengthened your thinking on how AI should check its own work", recorded in Tiger.
5. "Next: the shared gap" → Teach us the delta → Bring in a shared source (the safe default) → two personal deltas → End session.

### Judge challenges

1. **"Give us another concept."** After the first knowledge moved, take the plan's next move ("Next: Stefen teaches Nadani when AI should use a tool"). Thinketh generates a grounded transfer challenge for Agent Tool Use and grades Nadani's answer through the same evidence path. A weak answer shows "Not yet" and verifies nothing.
2. **"Give us another article."** On the shared-gap or shared-source screen, tap "Use another source" and paste any article, PDF, docs page or YouTube link. It's fetched once, and each Mind gets its own useful minutes, new ideas and focus. "Different delta" appears only if they really differ.
3. **"Why did Muse choose this?"** Open "View learning plan" on the overview. Every move comes from Thinketh's deterministic plan over the evidence asymmetry, with its reason; Muse only conducts it, and validation rejects anything outside the plan.
