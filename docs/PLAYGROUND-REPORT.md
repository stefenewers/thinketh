# Playground vNext: deliverable report

## Baseline
- The starting commit was `main @ 0765cfda94b22d22ddbffb160fd175f9e7f96cf1`, as expected.
- Branch: `stefen-playground-vnext`. `stefen/playground-vnext` couldn't be used because a local branch named `stefen` already exists.
- Baseline results: 110 tests passing, typecheck and lint clean, golden loop passing (mock, local and tunnel), all six sponsors live.

## Architecture
Everything is additive:
- `packages/mindprint`: layout engine.
- `packages/contracts/src/playground.ts`: MindSnapshot, CollaborativeDelta, PlaygroundRoom, RoomEvent, MuseAction, LearningScene.
- `engine/collaborative.ts`.
- `playground/{room,conductor,realtime}.ts`.
- Seeded Nadani persona and the transfer rubric item (`seed/personas.ts`).
- The `/playground/*` routes.
- Mobile: `src/mindprint/*`, `src/app/playground.tsx`, `src/lib/roomChannel.ts` and `src/api/playground.ts`.

Key decisions:
- The server owns every room.
- Knowledge state changes only through `answerDiagnostic`.
- The conductor is swappable behind one validated tool surface.
- No new native dependencies: Reanimated 4.7.0, Gesture Handler 3.3.0 and Worklets 0.13.0 were already compiled into the build and are now declared at exactly those versions. LiveKit, WebRTC, Expo, React Native and React are untouched.

See `docs/PLAYGROUND.md`.

## Mindprint
- **Layout:** semantic clusters come from the real weighted edges (deterministic greedy modularity, ties broken by id). Cluster anchors are stable and the focus concept pulls its cluster in. Hubs sit at the anchors, with members on an elliptical ring rotated toward what they connect to. A bounded 160-step relaxation, computed once and never animated, applies minimum gaps, springs back to home positions, the frame bounds, reserved zones, extra clearance for nodes whose labels must show, and an edge-clearance force that keeps nodes off lines that aren't theirs. The same input always gives the same picture.
- **Collisions:** `validate()` counts node overlaps, label overlaps, labels on nodes, edges through labels, edges through unrelated nodes and anything clipped. Tests assert zero for every single-Mind focus and for the two-Mind scenes.
- **Labels:** labels use Figma's short names, measured with a width model of Inter. Each label tries 16 anchors on two rings plus 48 radial fallbacks, placed greedily by priority (focus > changed > neighbour > hub). After edges are routed, a repair pass moves any label a line still crosses. If a label can't be placed cleanly it is hidden at that level of detail, never overlapped.
- **Edge routing:** each edge is a quadratic curve, with 11 curvature candidates scored on label and node hits. A weak edge that still collides recedes to secondary at that level of detail; essential edges and the focus's edges always draw.
- **2.5D:** depth follows relevance to the scene (focus 1, neighbours 0.85, same cluster 0.72, others 0.6) and is expressed as node scale, opacity and edge weight, with dimming around a selection or spotlight. No 3D.
- **Performance:** layout is memoized per data, focus and level of detail. The camera runs on the UI thread (shared values via `.get()`/`.set()`), and only a tap or a settled zoom crosses back to JS. Zooming out switches to the overview level of detail.
- **Two Minds:** the regions sit side by side, as in Figma, with a corridor between them. The composition is identical in both, so a concept sits in the same place in each Mind and a transfer is one short coral trace. The duo uses 11 pt labels, the delta's concepts are required labels, and the off-canvas lines are clipped to their own region.

## Playground
- **Room lifecycle:** create (with a room code) → join by code, or "Bring in Nadani" (one device) → snapshots on join (the consent act) → compare → overview → peer teaching → transfer → knowledge moved → shared gap → resource → end. There is an event log with sequence numbers. Rooms are private to their participants, and the host may act only for a seeded demo persona.
- **Collaborative delta:** computed, deterministic and explainable (rules in `docs/PLAYGROUND.md`). Tap any item to see both sides' numbers and the rule that produced it.
- **Peer teaching:** Nadani explains in her own words. That is not evidence. Stefen then gets a transfer question in a new context, graded by Claude against a four-idea rubric and scored deterministically.
- **Shared gap:** Memory Consolidation. A sourced lesson is built from the corpus claims, with the backing source shown.
- **Resources:** one source runs through the normal pipeline once per Mind, with live SOURCE → CONCEPTS → YOUR MIND → DELTA stages. Each column shows useful minutes, new ideas and a focus concept. The conductor's note is derived from the two deltas. The page says "Different delta" only when the deltas really differ.

## Muse
- **API:** an OpenAI-compatible tool-calling adapter (`MUSE_API_BASE`, `MUSE_API_KEY`, `MUSE_MODEL`, all server-only), temperature 0, `tool_choice: "auto"` (the only value Meta's Model API accepts), `reasoning_effort: "low"` and 1,500 max tokens (Muse Spark's reasoning counts against it; at 300 it ran out before calling a tool). **Live with `muse-spark-1.3` (2026-09-26):** it chose `assign_peer_teacher` (≈4 s) and then `ask_transfer_question` (≈3 s), both validated and recorded as `actor: "muse"`.
- **Tool surface:** the nine specified tools. None can change knowledge state, and a test asserts that.
- **Validation:** unknown tools and arguments are rejected, strings are capped at 280 characters, and teacher/learner/concept must come from the computed delta. Ordering is enforced (explanation before transfer). Validation runs twice: in the adapter and before the action is applied.
- **Fallback:** the deterministic conductor on missing configuration, a timeout (8 s), an error or an invalid call. Tests cover a malicious `set_mastery` call (falls back) and a valid call (accepted as `by: "muse"`). The app shows which conductor ran.

## Realtime
- **Broadcast:** server REST → channel `playground:<roomId>`, payload `{seq, type}` only. Each phone subscribes over the Phoenix websocket (no SDK) and refetches the room.
- **Presence:** each phone tracks `{name, scene, following}`, debounced to 700 ms because Supabase rate-limits presence (hit and fixed during testing). It drives the "Nadani is here / exploring on their own" line.
- **Keys:** clients receive only the anon key. RLS was confirmed on every table, and a test asserts the service key never appears in room responses.
- **One-device fallback:** the whole flow runs on one phone (Nadani seated as a persona), and polling every 1.5 s runs underneath realtime anyway.
- **Measured between two browser sessions:** arrival 0.6 s, overview 0.2–0.3 s, teaching assigned 0.1–0.2 s, transfer 0.2–0.3 s, knowledge moved on the other device within about 0.7 s.

## Evidence
**The path by which peer learning changes the Mind:**
1. `POST /playground/rooms/:id/answer` → `PlaygroundService.answer`.
2. `ThinkethService.answerDiagnostic(learner, "dq-evaluators-transfer-coding-agent", answer)`.
3. `evaluate()`: Claude's `gradeShortAnswer` returns the covered rubric ideas, and `scoreRubric` computes correctness.
4. `kindForCorrectness`, then `observe()`, then `transition()`: the deterministic update, with previous state, observation, reason, result and timestamp.
5. `ResilientTemporalStore.appendObservation` + `appendTransition` write to Tiger.
6. The room is verified only if the observation kind is `diagnostic_correct`.

**Tiger verification:** queried Tiger directly and found `pg-smoke-14536 evaluator-architectures diagnostic_correct 0.302 → 0.432` joined to the observation with `source_ref = diagnostic:dq-evaluators-transfer-coding-agent`. `GET /knowledge` returns the same new mastery (also asserted in a test).

## UI
Implemented from Figma:
- **1:6:** Mind at rest, with the "changed today" card.
- **1:34:** selected concept, with WHAT CHANGED, Ask Thinketh, and History · sources · related concepts.
- **1:65:** Learn together.
- **1:94:** Nadani joined; two Minds.
- **1:142:** Muse comparing, with a checklist and the M mark.
- **1:197:** You can teach each other.
- **1:216:** peer teaching, with a live coral trace and "Nadani is speaking…".
- **1:269:** Knowledge moved, with the trace and a ring on the learner.
- **1:322:** shared gap, the resource card and Teach us the delta.
- **1:376:** Same source. Different delta.

Deviations, and why:
- **"Stefen → Nadani: Persistent agent memory" became "Agent tool use".** Stefen's real Agent Memory evidence is developing (0.42), so the engine won't make him its teacher. The delta is computed, not scripted.
- **Transfer screen:** a transfer question screen was added between 1:216 and 1:269. Figma skips it, but verification needs it.
- **Honesty lines:** "Why Thinketh changed its model" (the engine's own reason) and a provenance line naming the conductor and sync.
- **"Not yet":** a non-verified path, since Figma only shows success.
- **Header:** a back chevron, and "Following Muse · Stop" to leave Spotlight. The brief requires user agency.
- **Resource columns:** "mostly <concept>" is added so the difference is visible even when counts match.
- **Typography:** Figma's title sentence case is followed, keeping acronyms.

## Existing-product fixes
- Quick answer shows the answer first, with the reasoning behind "Why this answer?".
- Resource processing is staged: SOURCE → CONCEPTS → YOUR MIND → DELTA.
- "Teach me the delta" is hidden when there's nothing new, with an honest line in its place.
- Visualize is now a single vertical Before → Now → Still true shift.

## Tests
- **Before:** 110.
- **After:** 132 (intelligence 121, up from 110 plus the new Playground tests; mindprint 11).

All passing:
- `npm run typecheck`: clean.
- `expo lint`: clean.
- Golden loop: passes against the mock, the local API and the public tunnel.
- Resources: article (page), PDF (MemGPT) and YouTube (transcript) all read and analyzed by Claude.
- `/health?probe=1`: all six integrations live.
- iOS Metro bundle: compiles (200, 12.5 MB).

## Native
- **Physical iPhone: not yet tested this sprint.** The device shows as unavailable (not connected) to this Mac right now. The dev-client Metro was restarted with the new package and serves through the same tunnel, so reopening the installed dev build loads this version. No native rebuild is needed (Podfile.lock is unchanged).
- **ElevenLabs regression:** `/voice/session` still reports live. The voice screen code and the LiveKit/WebRTC pins are untouched, but it still needs a spoken check on the phone.
- Visual review was done on web at 390×844 for every Playground scene and the Mind. Screen-level visual checks on the phone are pending.

## Known risks and fallbacks
| Risk | Fallback |
|---|---|
| Muse not configured, slow or invalid | The deterministic conductor runs the same flow, labelled as such |
| Claude grading slow or down | Keyword rubric grading (same rubric); 20 s client timeout on answers |
| Realtime socket blocked on venue Wi-Fi | Polling every 1.5 s; one-device mode needs no second phone |
| A weak transfer answer | "Not yet" is shown honestly. For the demo, answer with the rubric's ideas |
| Repeated rehearsals move Stefen's Evaluators past the teaching gap | `POST /demo/reset` for `demo-user` **and** `nadani` before the demo |
| Quick-tunnel URLs change on restart | `scripts/demo-api.sh`; update `EXPO_PUBLIC_API_URL` |
| Gestures on a physical device not yet verified | The Mind still works without gestures (tap rows below the map) |

## Two-minute demo script
1. **0:00 Mind:** "This is my Mind: filled means strong evidence, hollow means developing, coral is what changed today." Tap Agent Memory to show what changed and why. Tap **Learn together**.
2. **0:20 Playground:** "Nothing is shared until I invite someone." Tap **+ Invite a collaborator**, then **Bring in Nadani** (or join from the second phone with the code). "Nadani joined": two Minds, one space.
3. **0:35** Tap **Compare our Minds**. Muse compares. "You can teach each other": Nadani → Stefen on evaluator architectures (tap it to show the numbers and the rule), Stefen → Nadani on tool use, and a shared gap in memory consolidation. "Computed from evidence, not chosen by a model."
4. **0:55** Tap **Start 7-minute session**. "Following Muse": the coral trace runs between the two Evaluators. Nadani explains (typed on one device): "A model grading its own output shares its blind spots, so a separate evaluator catches what the generator misses." Tap •••.
5. **1:15 Transfer:** "Apply that idea to an autonomous coding agent." Answer: "Use a separate evaluator model at each commit gate with the tests, because an agent grading its own diff is biased toward approving it; failures go back so it fixes and retries." Submit.
6. **1:30 Knowledge moved.** The trace lands with a ring on Stefen's Evaluators. Tap "Mastery 0.30 → 0.43 · why?" to show the engine's reason, and say: "Recorded in Tiger. Thinketh updated only after I demonstrated it."
7. **1:45** Tap **Next: the shared gap**, then **Teach us the delta**, then **Bring in a shared source**: "Same source. Different delta." Muse: "Stefen: focus on evaluator architectures, and skip agent tool use. Nadani: focus on agent tool use." End.
