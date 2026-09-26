# Thinketh Playground: implementation plan

**Branch:** `stefen-playground-vnext` (the `stefen/…` form isn't possible because a local branch named `stefen` exists).
**Baseline:** `main @ 0765cfd` (as expected).

| Check | Baseline |
|---|---|
| Backend tests | 110 passed (8 files) |
| Typecheck | clean |
| Lint | clean |
| Golden loop | passes (mock, local API, public tunnel) |
| `verify-remote` | Claude, Backboard, MongoDB, Tiger, ElevenLabs and Supabase all live |

## Blockers found in the audit

1. **Figma:** no Figma MCP or connector is available in this session, so the 10 frames (1:6–1:376) couldn't be inspected directly. Until they are, visuals follow the design direction in the brief, the existing Thinketh design system, and the reference captures in `P237/screens` (Figma and Freeform Spotlight / "Following · Stop", Freeform canvas chrome, Claude's voice minimalism, Notion sheets). This must be reconciled against the real frames as soon as they're available.
2. **Muse:** `MUSE_API_KEY` isn't in `.env`, and the API surface isn't confirmed. The conductor is built behind an adapter with a strict tool schema and a deterministic fallback conductor, so the peer-learning flow never depends on Muse. The live call gets wired once the key and API reference are provided.

## Audit facts the design depends on

- **Evidence path (reused, not duplicated):** `service.answerDiagnostic(userId, questionId, answer)` → `evaluate()` (multiple choice, or short answer: Claude's `gradeShortAnswer` returns the covered key ideas, and `scoreRubric` scores them deterministically) → `kindForCorrectness` → `observe()` → `transition()` → Tiger `appendTransition` / `appendObservation` via `ResilientTemporalStore`. The Playground's transfer question is a new short-answer rubric item graded through exactly this path.
- **Every user shares one seeded baseline** (`seed.baselineStates`), so Nadani needs a seeded persona baseline (user id `nadani`). Her history is real from then on: Tiger records her transitions like anyone else's.
- **Graph:** 9 concepts, 10 typed and weighted edges (prerequisite / part_of / related / supports). All concepts share one domain, so clusters must come from edge structure.
- **Native:** `react-native-reanimated` 4.7.0, `react-native-gesture-handler` 3.3.0 and `react-native-worklets` 0.13.0 are already compiled into the iOS build (they're in `Podfile.lock`, pulled in by expo-router). Declaring them directly at the same versions needs no native rebuild. LiveKit, WebRTC, Expo and React Native versions stay untouched. `@supabase/supabase-js` is pure JS.
- **The Figma copy "Stefen → Nadani: Persistent agent memory" isn't supported by the real knowledge state** (Stefen's Agent Memory is *developing*). The collaborative delta is computed, not scripted, so the UI shows whatever the real states support. This is a documented deviation.

## Architecture (additive)

```
packages/mindprint          NEW  pure TS: semantic clustering, deterministic layout,
                                 label placement, edge routing, collision validation (vitest)
packages/contracts          + MindSnapshot, CollaborativeDelta, PlaygroundRoom, RoomEvent,
                                 MuseAction, LearningScene (all additive)
packages/intelligence
  engine/collaborative.ts   NEW  deterministic collaborative delta (A→B, B→A, shared, gaps, conflicts)
  playground/snapshot.ts    NEW  permissioned MindSnapshot (no Ask history, no Backboard memories)
  playground/room.ts        NEW  room lifecycle, scenes, event log (server is the source of truth)
  adapters/muse.ts          NEW  Muse conductor: strict tool schema, server validation, deterministic fallback
  playground/realtime.ts    NEW  semantic events → Supabase Realtime Broadcast (REST, server key)
  api routes                + /playground/rooms …
  seed                      + persona `nadani` baseline; transfer rubric item (Playground only)
apps/mobile
  src/mindprint/*           NEW  SVG renderer + Reanimated camera (pan / pinch / reframe), 2.5D cues
  src/app/playground.tsx    NEW  scenes: overview → arrival → compare → peer teaching → transfer →
                                 knowledge moved → shared gap → resource
  src/app/mind.tsx          ~   upgraded to the Mindprint renderer (one graph system)
```

**The boundary:** Muse's tools only change *what the room is looking at*: spotlight, assign a teacher, ask a question, introduce a resource, advance the scene. There is **no** state-mutation tool. Knowledge state changes only through `answerDiagnostic`.

## Mindprint layout pipeline (designed before any rendering)

1. **Semantic clusters:** deterministic greedy modularity over the weighted edge graph, with stable tie-breaks by concept id. Expected: memory (agent memory, consolidation, retrieval, compaction, context windows), agents (long-running agents, evaluator architectures), tools (tool use, MCP).
2. **Stable anchors:** each cluster gets a fixed angular sector and a fixed radius, from sorted cluster ids. Nothing is random: the same state always gives the same layout.
3. **Active-concept gravity:** the focal concept pulls its cluster anchor slightly toward the frame's focal point. This reframes the view without reordering.
4. **Constrained placement:** nodes are placed on a ring within their cluster, ordered by edge-weighted barycenter, then a bounded deterministic relaxation (a fixed number of iterations, run before rendering, never on screen) enforces minimum node distance, safe bounds and reserved corridors (the transfer corridor, participant-name areas, bottom-sheet clearance).
5. **Labels:** measured label boxes (a character-width model of Inter) are tried at 8 anchor positions around each node, scored on overlap with labels, nodes and edges and on clipping, and chosen greedily in priority order (selected > changed > important). If a label can't fit, it's hidden at that level of detail rather than overlapped.
6. **Edges:** quadratic curves whose control point bends away from node and label boxes the straight line would cross. Only primary edges are drawn by default; secondary edges appear on focus.
7. **Level of detail:** overview shows cluster structure and the strongest labels; normal shows the relevant labels; focus shows the selected concept, its direct edges and detail.
8. **Validation:** no node overlap, no label overlap, no essential edge through text, everything inside safe bounds, and every touch target at least 44 pt. Tests assert this on fixtures (single Mind, two Minds, the transfer scene).

**Two-person layout:** the same engine runs with two regions (Stefen on the left, Nadani on the right), a shared middle band for shared concepts and gaps, and a reserved horizontal transfer corridor. It isn't two shrunken graphs.

**2.5D:** depth is a function of relevance to the scene (focal: 1.0, direct neighbors: 0.85, others: 0.6), expressed as scale, opacity and edge sharpness, plus a slight parallax offset per depth layer while panning. Reduced motion keeps the static hierarchy and drops parallax and animation.

**Performance:** layout is computed only when the data or scene changes (memoized). Gestures and camera run on the UI thread (Reanimated shared values), with no React re-renders per frame.

## Realtime

The server is the source of truth: `GET /playground/rooms/:id` returns the full room state and event log. Supabase Realtime **Broadcast** pushes semantic events (`participant_joined`, `spotlight`, `teacher_assigned`, `explanation_submitted`, `transfer_question`, `answer_submitted`, `transfer_verified`, `scene_advanced`, `resource_introduced`), and **Presence** carries low-frequency participant state. Each client animates events locally. If realtime is down, clients poll the room. **One-device mode** runs both participants from one phone against the same server room, so the full story works without a second phone.

## Order and gates

- **P0:** audit, baseline, branch, this plan. ✅
- **P1:** `packages/mindprint` layout engine, with determinism and collision tests.
- **P2:** Mindprint renderer; upgrade the single-user Mind.
- **P3–P4:** contracts, Nadani persona, MindSnapshot, collaborative delta (tests), room lifecycle and API (tests).
- **P5–P6:** Playground screen: two-Mind layout, scenes, Spotlight / Following.
- **P7–P9:** peer teaching → transfer question → **real** evidence → Tiger → coral transfer trace → Stefen's Mind resolves. **This is the success gate.**
- **P10:** Muse conductor (blocked on key and docs; the fallback conductor ships first).
- **P11:** Supabase Realtime for two devices.
- **P12–P13:** shared gap; shared resource with a dual delta (reusing resource ingestion per participant).
- **P14:** existing-product fixes (processing stages, Quick answer, zero-delta call to action, Visualize).
- **P15:** native QA, demo hardening, docs, README.
