# Final sprint report (2026-09-26, overnight)

**Branch:** `stefen-final-sprint`, pushed. **Not merged to `main`**, so the working demo on `main` is untouched until Stefen reviews this.

## 1–2. Commits

| Commit | What |
|---|---|
| `34007fe` | Learning Queue backend: URL → knowledge delta, Teach me the delta |
| `00cf7ff` | Mobile Learning Queue: Add a resource, resource delta, Teach me the delta |
| `679a326` | Provenance: real, verified sources; flag the rest |
| `682db9c` | Knowledge Update moment and MindGraph knowledge trace |
| `9ad416f` | Consumer-facing knowledge language |
| `b16bf48` | Ask learning modes: Quick answer / Teach me / Go deep |
| `fadbe88` | Explore grounded in real state |
| `e452cd3` | Today hierarchy makes the filtering visible |
| `4431267` | Polish from a rendered visual pass |

## 3. What was implemented

- **Save to learn (P1).**
  - Library has a *Learning queue* with the empty state "Give Thinketh something you want to understand."
  - *Add a resource* takes one URL. The server reads it in the background with real stages: *Reading the source… / Mapping concepts… / Comparing with your Mind…*
  - The result shows full read vs useful-for-you minutes, *You already understand*, *New to you*, *Why this matters*, *Connects to your Mind*, and *Teach me the delta*. That ends in *Check my understanding*, which uses the existing diagnostic.
- **Rules on the analysis:**
  - Claude compares the page with the knowledge state and treats page text as data.
  - The server enforces two rules on any output: only real concept ids, and "already understood" only where the knowledge state supports it.
  - There's an extractive deterministic fallback.
  - Nothing here changes knowledge state.
- **URL safety:** http(s) on ports 80/443 only, and a DNS check against private, loopback, link-local and CGNAT addresses on every redirect hop. Plus a 10 s timeout, a 3 MB cap, and at most 24k characters sent to Claude. PDFs aren't read. Pages that can't be read say *"Thinketh couldn't reliably read this source yet."*
- **Provenance (P1):**
  - 11 of 13 seeded sources are now real pages that support their claims; each was fetched and checked.
  - 2 are flagged and stay "(demo)".
  - Mock sources no longer credit invented titles to real organizations.
  - The development screen shows a source class, the real title, the real date, and ↗ only for real links.
  - Details are in `docs/PROVENANCE.md`.
- **Knowledge Update moment (P2):**
  - "Your understanding changed." with one coral trace on the concept.
  - Then only what the transition contains: level in words, *Misconception resolved*, *Uncertainty reduced*, *Connected concepts strengthened* (real propagated changes), *Evidence added*.
  - Numbers are behind *See the numbers*. There's a success haptic, and reduced motion is respected.
  - MindGraph pulses the updated concept once on arrival.
- **Consumer language (P3):** Today, Mind, the storyline and the delta text use levels and evidence in words. Mind keeps the numbers behind a toggle. *Why this question?* keeps its numbers, since it's the explainability panel.
- **Ask modes (P3):** Quick answer (default), Teach me, Go deep. The mode only shapes Claude's inference layer. *Explain deeper* opens in Teach me.
- **Explore (P4):** built from real state first: ready queue items, your weakest concept that a development covers, what connects to what improved today, and a development linking two concepts you know. It deduplicates, skips developments you've already understood, and fills gaps from the seeded picks.
- **Today (P4):** a typographic stat row (*3 Major · ~11 Minutes · 143 Filtered*), where the filtered count opens the why sheet, plus the line "Out of 149 items, only 6 change what you understand."
- **Visual pass:** every screen was rendered against the real API (web build, headless Chrome at phone width) and fixed. That included one honesty bug the provenance change introduced ("Anthropic · 10h ago" implied Anthropic published today).

## 4. Intentionally skipped

- **Voice screen polish.** The brief said only if low-risk, and the native voice path shouldn't be touched without a phone in hand.
- **P5 micro-interactions.**
- **Reordering the development screen.** The required sections from CLAUDE.md are kept as they are.
- **The `learned` resource status.** It's in the contract but unused.
- **The two flagged sources.** No real source supports those claims, so nothing was attached.

## 5. Routes and contracts added (all additive)

- `GET /resources`, `POST /resources {url}`, `GET /resources/:id`, `POST /resources/:id/teach`
- Contracts: `Resource`, `ResourceListResponse`, `AddResourceRequest`, `TeachDeltaResponse`, and the optional `AskRequest.mode`.
- Mobile routes: `/resource/add` (modal) and `/resource/[id]`.

## 6. Migrations

None. The Learning Queue is in the API process's memory. MongoDB's `sources` collection was re-seeded with the real metadata: same ids and counts.

## 7. Dependencies added

None. This sprint needs no native rebuild.

## 8. Tests, typecheck, lint

- 103 backend tests pass, 12 of them new for resources. They cover URL validation, private-address blocking including via redirects, size caps, timeouts, PDFs, thin pages, extraction, the analysis rules, and "doesn't change knowledge state".
- Typecheck and lint are clean.
- The golden loop passes against mock data, the local real API, and the public tunnel.
- `verify-remote` passes with all six integrations live.
- The iOS bundle builds.

## 9. Native device status

This sprint added no native code or dependencies. The new screens were checked rendered on web, **not yet on the iPhone**. Metro serves the working tree, so the phone gets this branch on its next reload.

## 10. Known risks

- **The queue lives in memory:** restarting the API clears saved resources. Demo reset also clears them, on purpose.
- **Long pages take 20–30 s to analyze** with Claude; the screen shows progress while it works.
- **The quick-tunnel URL changes** if the tunnel restarts. When it does, update `apps/mobile/.env.local` and restart Metro with `--clear`.
- **Some sites block readers or are script-rendered.** They fail honestly. Good demo URLs are listed below.

## 11. Demo path

1. Today: "You missed 6 things worth knowing", then the stat row; tap **143 Filtered** for why.
2. Catch me up → the development: *You already knew* / *What changed*; sources are real and tappable.
3. Check my understanding → the correct answer → **Knowledge Update**: coral trace, *Misconception resolved: "memory = context window"*, connected concepts strengthened.
4. See it in your Mind: Agent Memory pulses.
5. Library → **+ Add a resource** → paste `https://www.anthropic.com/engineering/building-effective-agents` and watch the stages. Expect **~12 min full read vs ~5–7 min useful**, known ideas (tool use, MCP, RAG) and new ones (evaluator architectures, long-running agents).
6. **Teach me the delta** (about 8 s; it skips what you know) → Check my understanding.
7. Ask: try Teach me or Go deep.
8. Voice: Catch Me Up.

Other good URLs: `https://arxiv.org/abs/2310.08560` (MemGPT) and `https://platform.claude.com/docs/en/build-with-claude/context-windows`.

## 12. Five-minute check before judging

1. `curl <tunnel>/health?probe=1` should show all six integrations live.
2. `EXPO_PUBLIC_THINKETH_APP_KEY=… API_URL=<tunnel> npm run check:golden -w mobile` should report all checks passed.
3. On the phone: long-press the logo → Reset demo, then walk steps 1–4 above.
4. Add the Anthropic URL and confirm it becomes ready with Claude (the analysis footer says "by Claude").
5. Set `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=true` for judging, and restart Metro with `--clear`.

## 13. Don't touch before judging

- The knowledge-state math, and the seeded persona and baseline (the golden loop depends on 0.42 → 0.51).
- The LiveKit version pins, the npm override, and `ios/` (the native voice build).
- The ElevenLabs agent settings (auth on, guardrails, `end_call`) and the app-key setup.
- The Supabase feature flags.
