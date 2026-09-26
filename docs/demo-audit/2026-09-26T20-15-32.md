# Thinketh demo audit: 2026-09-26T20-15-32

Automated walk of the judge demo in a phone-sized Chrome (390×844, Expo web) against a live local API on its own ports, as an isolated audit user. Evidence: `evidence/2026-09-26T20-15-32/` (`journey.json`, `preflight.json`, `screens/`).

## 1. Verdict: ready with caveats

The whole judge order works end to end on live sponsors in the browser. **29 pass, 0 fail, 0 blocked.** The caveats are about the name shown to the judge, the state of the shared personas, a volatile working tree, and a few judge-visible screens. The verdict rests on these facts:

1. **Golden loop is live and persisted.** Today (6 new, 3 major, 143 filtered) → Development → diagnostic → correct answer → Agent Memory 0.419 → 0.508 mastery, 0.438 → 0.289 uncertainty, with the engine's reason. It's in the API and in Tiger: 6 rows for the audit user, including the answer row. Steps 3–10; [07](evidence/2026-09-26T20-15-32/screens/07-diagnostic-answer.jpg), [result-scroll2](evidence/2026-09-26T20-15-32/screens/result-scroll2.jpg).
2. **Playground follows the documented script and persists.** The plan opens with "Nadani teaches Stefen evaluator architectures", conducted by Muse (muse-spark-1.3). The refund transfer answer was graded by Claude with no fallback, and the outcome shows "Knowledge moved. Mastery 0.30 → 0.43". Tiger has `evaluator-architectures diagnostic_correct 0.30→0.43` and `long-running-agents 0.50→0.52` for the audit user. Then "Same source. Different delta." (~3 min vs ~5 min). Steps 21–25.
3. **Every sponsor probe is live.** Claude, Backboard, Mongo, Tiger, ElevenLabs and Supabase were all `live`, with 5 feature flags readable (`preflight.json`). Claude, Mongo, Tiger and ElevenLabs had zero fallbacks across the run. **Backboard fell back 2 times in 22 calls** (HTTP 500 from Backboard on a memory write, including one during Ask). See §8.
4. **The judge will hear "Good morning, Jordan".** Catch Me Up greets the learner as **Jordan**, but the rest of the app, the avatar and the Playground call him **Stefen** ([17](evidence/2026-09-26T20-15-32/screens/17-voice.jpg)). The cause is the seeded profile's `displayName: "Jordan"` (`packages/intelligence/src/seed/corpus.ts:585`) versus `DEMO_LEARNER_NAME = "Stefen"` (`apps/mobile/src/content/demo.ts:12`).
5. **The working tree was volatile during the audit, and the phone Metro serves it.** Two earlier runs (20-00-32, 20-06-40) caught an in-progress Playground edit mid-flight. Tapping "Bring in Nadani" white-screened the page (`TypeError: Cannot read properties of undefined (reading 'conceptId')` in `<MindVenn>`). It was committed as 9e87c25 at 16:12 local time and is fine now. Phone Metro (:8081) bundles the same working tree, so a mid-edit reload on the phone would crash the same way. See §5.
6. **The shared personas aren't at baseline right now.** A read-only Tiger check at about 20:10Z found 2 fresh `demo-user` rows from 20:09:13Z (`evaluator-architectures` and `long-running-agents`, both `diagnostic_incorrect`). The audit didn't write these (see §3); they came from live use of the shared demo API. Reset before judging, or the Playground numbers won't match the script.

## 2. Run facts

| | |
|---|---|
| Final run | `2026-09-26T20-15-32` (started 20:15:32Z, journey finished 20:18:14Z) |
| Commit | `9e87c25` on `stefen-playground-room` at the final preflight. Commits made later, during and after the run, contain only harness and evidence files: a254490, 32327ac and 091b2db. All are pushed. |
| Dirty state | **Final run:** clean product tree. The only untracked files were `.claude/`, `docs/demo-audit/` and `scripts/demo-audit/`. **At the start of the session:** someone else's in-progress edits were present (`apps/mobile/src/components/playground/MindVenn.tsx`, `packages/intelligence/src/playground/room.ts` and the untracked `apps/mobile/src/lib/roomStory.ts`). During the audit, `playground.tsx`, `DuoMind.tsx`, `EventRail.tsx` and `roomStory.test.ts` were added to that set. It was all committed as e92e267 (16:06:33 local) and 9e87c25 (16:12:17 local). The auditor never touched these files. |
| URLs | API `http://localhost:8797`, web `http://localhost:8091` (audit-only ports) |
| Audit user | `audit-2026-09-26t20-15-32`. The app's `demo-user` is rewritten to this id. |
| Mock flags | `EXPO_PUBLIC_USE_MOCK_API=false`, `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false` (this run only) |
| Env | All 10 required variables are set. Optional: Muse key, model and base set; `ANTHROPIC_WORKSPACE_ID` and `SUPABASE_ANON_KEY` set; `VOYAGE_API_KEY` **missing**. `apps/mobile/.env.local` is present. |
| Probe (`/health?probe=1`) | claude live (model claude-opus-5), backboard live (pinned assistant, 4 memories), mongo live (7 developments), tiger live (56 transitions), elevenlabs live (agent reachable), supabase live (5 flags). One intermediate preflight (20-06-40) saw Supabase `degraded: fetch failed`, and the next one was live again. |
| Tiger direct | reachable |
| Left alone | Demo API on :8787 and phone Metro on :8081. The auditor made no requests to either. Both were restarted by someone else during the audit: the :8787 PID became 98003 at 16:03 local, and the :8081 PID changed from 42925 to 2121. |
| Simulator | `xcrun simctl list devices booted` showed none booted, so it wasn't run. |
| Contract check | `npm --workspace mobile run check:golden` with **no** `API_URL`: **mock only**, 22/22 ok. |

Superseded runs are kept for evidence. Each one explains a finding below.
- `2026-09-26T20-00-32`: 24 pass, 1 fail, 4 blocked. The Playground white-screened on the mid-edit working tree.
- `2026-09-26T20-06-00`: 6 pass, 5 fail, 18 blocked. The audit API process died at about 20:03:3xZ with nothing in its log, around the same moment the shared :8787 API was restarted by someone else. This run is the best evidence of the app's **failure states**; see §7.
- `2026-09-26T20-06-40`: 24 pass, 1 fail, 4 blocked. It hit the same `MindVenn` crash on a later mid-edit tree.
- `2026-09-26T20-12-29`: 28 pass, 1 fail. The harness selector was stale after "Teach us the delta" was renamed to "Teach it to both of us" in 9e87c25.

## 3. Safety notes

**Persona writes (read this first).**
- **Earlier this session**, before the harness had its persona guard, one development run answered a Playground transfer question **as the seeded persona `nadani`**. That wrote 4 `knowledge_state_transitions` rows for `user_id='nadani'` in the shared Tiger DB at 2026-09-26T19:48:42.542Z:
  - agent-tool-use 0.38 → 0.321
  - agent-memory 0.5 → 0.485
  - long-running-agents 0.58 → 0.574
  - mcp 0.74 → 0.719

  Before that write, a fresh user's Playground plan opened with "Nadani teaches Stefen evaluator architectures", the documented script. After it, the plan deterministically opened with "Stefen teaches Nadani agent tool use"; this was verified on 4 fresh users. The live demo API reads the same Tiger history.
- **Current state:** a read-only `tiger-check.mjs nadani` now returns **0 rows**, so someone reset `nadani` between about 20:00Z and 20:09Z. It was not the auditor, who never calls `/demo/reset` for a shared persona. Fresh users now get the documented plan again: an API probe at 20:09:41Z, then steps 21–22 of this run. **The flip is resolved**, but only because of that reset. If it recurs, restoring it needs the documented `POST /demo/reset` for `nadani`.
- **`demo-user` has 2 Tiger rows from 20:09:13Z** (`evaluator-architectures` and `long-running-agents`, both `diagnostic_incorrect`). No audit API log has a `demo-user` event, and the journey that was running then had finished at 20:08:56Z, so these came from live use of the shared API. Reset `demo-user` before judging.

**Earlier requests to the live tunnel.** Smoke runs earlier this session, before the redirect existed, sent a few requests to the **live tunnel API as `demo-user`**:
- `GET /brief/today`
- `GET /knowledge`
- one `POST /ask` ("What changed in agent memory this week?")

The POST reached the pinned Backboard assistant (see the next point). Nothing was reset.

**Backboard side effect.** Every run's Ask step posts the question to the **pinned Backboard assistant** (`BACKBOARD_ASSISTANT_ID` is set, so every user maps to it; see `memory.ts` `assistantFor`). The demo persona uses the same assistant. This adds memory and deletes nothing. In this run, one of those writes got HTTP 500 from Backboard and fell back.

**Guard and redirect.**
- `guardBlocked` is **empty**: no answer, feedback or reset was attempted as another identity.
- Redirected bundle origin: `https://<demo-tunnel>.trycloudflare.com` was redirected to `http://localhost:8797`. Expo baked `apps/mobile/.env.local` into the web bundle even with `EXPO_NO_DOTENV=1` and process-env overrides. That's why the README's command-line `EXPO_PUBLIC_*` override doesn't take effect while `.env.local` exists (confirmed on web; see Doc drift).

**The public tunnel host was committed and pushed.** The Demo controls screen prints the API URL. The `29-demo-controls.jpg` screenshots from runs 20-00-32, 20-06-00, 20-06-40 and 20-12-29 showed the live tunnel hostname, and they were committed in `a254490`, which is **already on `origin/main` and `origin/stefen-playground-room`**. Commit 32327ac redacted only `journey.json`. This run painted over the host in all five screenshots in the working tree; the 20-06-00 one also had a second "Couldn't reach …/health" line. This run's screenshot went into 091b2db already redacted. The four older redactions are **uncommitted** (`git status` shows them as `M`), so they need committing. Git history still has the originals. The host changes whenever the tunnel restarts; whether to rewrite history is the owner's call.

**Harness fixes this run** (all in `scripts/demo-audit/journey.mjs`; product code untouched). The repo owner committed and pushed them in 091b2db (16:20:57 local), together with this run's evidence:
1. `scrollShots` used `el.scrollTo(0, top)`. RN-web replaces that method on ScrollView nodes with the legacy `scrollTo(y, x)` signature, so every "scroll" shot moved the page **sideways** by 70 px (the Today decoration's overflow) instead of down. Earlier `today-scroll*` evidence showed a clipped, shifted page that looked like a layout bug. It now sets `scrollTop` directly and resets both axes.
2. The shared-gap step waited for "Teach us the delta", which 9e87c25 renamed to **"Teach it to both of us"**. The selector now accepts either.
3. Screenshots now pass `mask: [getByText(/trycloudflare\.com/)]` (verified: the URL line renders as a solid block), and `bundleApiOrigins` writes the host as `<demo-tunnel>`.

**Other.** Server logs stay in `scripts/demo-audit/.logs/` (gitignored). No secrets or credentialed URLs were printed.

## 4. Journey table (final run)

All steps ran in the browser (Chrome 390×844, Expo web) unless marked *backend*. Times are UTC; durations are in ms. In the Sponsors column, "calls/fallbacks" are per adapter during that step.

| # | Env | Step | Expected | Observed | Status | Evidence | API calls · sponsors | Time |
|---|---|---|---|---|---|---|---|---|
| 1 | backend | Reset audit user | Reset returns 200; Agent Memory is at baseline | Mastery 0.419, uncertainty 0.438 | pass | [01](evidence/2026-09-26T20-15-32/screens/01-reset-audit-user.jpg) | tiger 4/0 | 20:15:37 · 283 |
| 2 | browser | Onboarding | Explains itself and can be skipped | "Let's learn about you", then skipped | pass | [01a](evidence/2026-09-26T20-15-32/screens/01a-onboarding.jpg) | brief 200 (412 ms), knowledge 200 · backboard 1/0, tiger 5/0 | 20:15:37 · 3468 |
| 3 | browser | Today | Brief from live API | 6 new / 3 major / 11 min, 143 filtered, hero is the persistent agent memory development | pass | [03](evidence/2026-09-26T20-15-32/screens/03-today.jpg) | brief 200 (95 ms) · backboard 1/0, tiger 5/0 | 20:15:41 · 2963 |
| 4 | browser | Today, full page | Mind, Ask and Playground tiles reachable | All three found; scrolling now correct | pass | [s1](evidence/2026-09-26T20-15-32/screens/today-scroll1.jpg), [s2](evidence/2026-09-26T20-15-32/screens/today-scroll2.jpg) | none | 20:15:44 · 999 |
| 5 | browser | Development | Personal delta and sources | "The change in a minute", "Builds on what you knew", "Why it matters to you" and the check are all on the first screen; 3 already-knew, 4 changed, 4 sources in the payload | pass | [05](evidence/2026-09-26T20-15-32/screens/05-development.jpg), [s2](evidence/2026-09-26T20-15-32/screens/development-scroll2.jpg) | development 200 (66 ms) · claude 1/0, backboard 1/0, mongo 1/0, tiger 2/0 | 20:15:45 · 3648 |
| 6 | browser | Check my understanding | Adaptive question with a reason | `dq-agent-memory-persistence`; "Chosen because Agent Memory is high-uncertainty…" | pass | [06](evidence/2026-09-26T20-15-32/screens/06-diagnostic-open.jpg) | select 200 (108 ms) · claude 1/0, mongo 1/0, tiger 5/0 | 20:15:48 · 1737 |
| 7 | browser | Knowledge Update | Deterministic transition with a reason | Correct: 0.419 → 0.508, uncertainty 0.438 → 0.289, "Misconception no longer flagged"; numbers only behind "See the numbers" | pass | [07](evidence/2026-09-26T20-15-32/screens/07-diagnostic-answer.jpg), [r2](evidence/2026-09-26T20-15-32/screens/result-scroll2.jpg) | answer 200 (591 ms) · claude 1/0, tiger 13/0 | 20:15:50 · 5127 |
| 8 | browser | Mind | Agent Memory shows the change | Map centred on Agent Memory (coral), inspector open | pass | [08](evidence/2026-09-26T20-15-32/screens/08-mind.jpg) | knowledge 200, knowledge/agent-memory/history 200, brief 200 · backboard 1/0, tiger 7/0 | 20:15:55 · 2795 |
| 9 | browser | Mind history | Why the model changed | Inspector shows "You correctly answered a transfer question…"; no numbers on first view; Changes tab lists Agent Memory | pass | [09](evidence/2026-09-26T20-15-32/screens/09-mind-history.jpg), [i2](evidence/2026-09-26T20-15-32/screens/mind-inspector-scroll2.jpg) | none | 20:15:58 · 3997 |
| 10 | backend | Persistence | In API **and** Tiger | API 0.508; newest history id matches; Tiger has 6 rows including the answer | pass | [10](evidence/2026-09-26T20-15-32/screens/10-persistence.jpg) | tiger 5/0 | 20:16:02 · 652 |
| 11 | browser | Learn | Add, saved and suggested | Add a source; "Nothing saved yet."; Explore suggestion | pass | [11](evidence/2026-09-26T20-15-32/screens/11-learn.jpg) | brief, knowledge, resources 200 · claude 1/0, backboard 1/0, tiger 5/0 | 20:16:02 · 5359 |
| 12 | browser | Add a source | Staged read reaches ready, analyzed by Claude | Anthropic URL ready in about 20 s; `analyzedBy: claude`; ~12 min full vs ~5 min useful | pass | [09a](evidence/2026-09-26T20-15-32/screens/09a-resource-processing.jpg), [12](evidence/2026-09-26T20-15-32/screens/12-resource-add.jpg) | POST resources 200, then polled · claude 2/0, tiger 5/0 | 20:16:08 · 20054 |
| 13 | browser | Teach me the delta | Skips what you know | "You already understand" (tool use, MCP, RAG), then "What's new for you" | pass | [13](evidence/2026-09-26T20-15-32/screens/13-resource-teach.jpg) | teach 200 (6963 ms) · claude 1/0 | 20:16:28 · 9599 |
| 14 | backend | Saved | Resource listed | 1 saved; in API memory only | pass | [14](evidence/2026-09-26T20-15-32/screens/14-resource-saved.jpg) (shows the teach screen) | none | 20:16:38 · 44 |
| 15 | browser | Ask | Grounded answer | 200 in 4.2 s; 3 sources; memory used: Backboard | pass | [15](evidence/2026-09-26T20-15-32/screens/15-ask.jpg), [s2](evidence/2026-09-26T20-15-32/screens/ask-scroll2.jpg) | ask 200 (4241 ms) · claude 1/0, **backboard 2/1 (HTTP 500)**, mongo 1/0, tiger 4/0 | 20:16:38 · 11034 |
| 16 | browser | Why this answer? | Reasoning is visible | Understand → Find → Compare to your Mind → Synthesize, including "What Thinketh remembered about you" | pass | [16](evidence/2026-09-26T20-15-32/screens/16-ask-why.jpg), [s2](evidence/2026-09-26T20-15-32/screens/ask-why-scroll2.jpg) | none | 20:16:49 · 3063 |
| 17 | browser | Catch Me Up (voice) | Session created | `POST /voice/session` 200, `mode=elevenlabs`; web falls back to text honestly; **"Good morning, Jordan"** | pass | [17](evidence/2026-09-26T20-15-32/screens/17-voice.jpg) | voice/session 200 (310 ms) · elevenlabs 1/0, tiger 8/0 | 20:16:52 · 4046 |
| 18 | browser | Catch Me Up (text) | Walkthrough ends in an action | 4 Continue taps, then "Check my understanding" and "Back to today" | pass | [18](evidence/2026-09-26T20-15-32/screens/18-voice-text.jpg) | none | 20:16:56 · 3798 |
| 19 | browser | Playground | Explains the idea; Invite | "Learn together." + Invite | pass | [19](evidence/2026-09-26T20-15-32/screens/19-playground-open.jpg) | tiger 1/0 | 20:17:00 · 2839 |
| 20 | browser | Invite + Nadani | Room created; Nadani joins | "Nadani joined"; large blank area | pass | [20](evidence/2026-09-26T20-15-32/screens/20-playground-invite.jpg) | rooms 200, demo-guest 200 · tiger 4/0 | 20:17:02 · 2816 |
| 21 | browser | Compare | Who teaches whom | Nadani → Stefen evaluators; Stefen → Nadani tool use; shared gap; conductor `muse (muse-spark-1.3)` | pass | [21](evidence/2026-09-26T20-15-32/screens/21-playground-compare.jpg) | compare 200 (88 ms) · tiger 4/0 | 20:17:05 · 3236 |
| 22 | browser | Session: Nadani explains | Muse assigns; explanation accepted | Refund transfer prompt shown | pass | [22](evidence/2026-09-26T20-15-32/screens/22-playground-teach.jpg) | conduct 200 (4619 ms), explain 200 (3807 ms) | 20:17:08 · 14194 |
| 23 | browser | Transfer | Graded; Mind changes | "Knowledge moved." "Verified. You: 0.30 → 0.43." | pass | [23](evidence/2026-09-26T20-15-32/screens/23-playground-transfer.jpg), [o2](evidence/2026-09-26T20-15-32/screens/playground-outcome-scroll2.jpg) | answer 200 (3436 ms) · claude 1/0, tiger 7/0 | 20:17:23 · 8016 |
| 24 | backend | Playground persisted | Row in Tiger | `evaluator-architectures diagnostic_correct 0.30→0.43`; `long-running-agents 0.50→0.52` | pass | [24](evidence/2026-09-26T20-15-32/screens/24-playground-persistence.jpg) | none | 20:17:31 · 429 |
| 25 | browser | Shared gap + source | Each Mind gets its own delta | "Same source. Different delta.", 22 s after the tap; "Tool use with Claude"; ~3 min for Stefen, ~5 min for Nadani | pass | [25](evidence/2026-09-26T20-15-32/screens/25-playground-shared.jpg) | conduct 200 (6757 ms), conduct 200 (4589 ms) · claude 2/0, tiger 4/0 | 20:17:31 · 30597 |
| 26 | browser | Visualize | Structured before/now view | Before / Now / Still true, then CTA | pass | [26](evidence/2026-09-26T20-15-32/screens/26-visualize.jpg) | visualize 200 (333 ms) · backboard, mongo, tiger 1/0 each | 20:18:02 · 3648 |
| 27 | browser | Make it stick | Analogy, hook, 3 steps | "Context is RAM. Memory is disk." | pass | [27](evidence/2026-09-26T20-15-32/screens/27-make-it-stick.jpg) | make-it-stick 200 (163 ms) · claude, backboard, mongo, tiger 1/0 each | 20:18:05 · 3483 |
| 28 | browser | Explore | Each idea says why it's there | 4 reasoned items, including "You just strengthened Evaluator Architectures" | pass | [28](evidence/2026-09-26T20-15-32/screens/28-explore.jpg) | brief, resources, knowledge 200 · claude 1/0, backboard 1/0, tiger 5/0 | 20:18:09 · 2747 |
| 29 | browser | Demo controls | Data source and adapters shown | Real API, mock fallback OFF, adapters LIVE; Backboard shows 2 fallbacks and the HTTP 500 in red | pass | [29](evidence/2026-09-26T20-15-32/screens/29-demo-controls.jpg) (host redacted) | health 200 | 20:18:12 · 2764 |

Console: 2× `Invalid DOM property transform-origin` (web only) and 1× `useNativeDriver` fallback warning (web only). There were no API errors in the final run. The LogBox toast (web dev overlay) was recorded and hidden; it isn't a phone defect.

## 5. First break or confusion

**In the final run, the first confusion is at Catch Me Up, step 2 of the judge order: "Good morning, Jordan."** Before this point, the judge has seen Stefen's photo on Today. Right after it, the Playground says "Stefen" and "You" everywhere. A judge will ask who Jordan is, or conclude the greeting is canned. This will almost certainly also be what ElevenLabs *says* on the phone. The transcript comes from the same `/voice/session` payload, but that's unverified on a device.

**The first hard break seen during the audit was the Playground white screen** when tapping "Bring in Nadani" (runs 20-00-32 and 20-06-40: a blank page, and a React error in `<MindVenn>`: `Cannot read properties of undefined (reading 'conceptId')`). The cause was a half-saved working tree: `MindVenn` already required the new `stage` prop while `playground.tsx` didn't pass it yet. The committed 9e87c25 is consistent, and the final run passes. It still matters for judging, because **the phone's Metro (:8081) serves the same working tree.** Any edit in progress at demo time reaches the judge's phone on its next reload.

## 6. Reproducible bugs

1. **Catch Me Up uses the wrong learner name.**
   - Steps: Today → mic or Catch me up → read the first line.
   - Expected: "Good morning, Stefen."
   - Actual: "Good morning, Jordan." ([17](evidence/2026-09-26T20-15-32/screens/17-voice.jpg))
   - Cause: every seeded learner gets `displayName: "Jordan"` (`packages/intelligence/src/seed/corpus.ts:585`), which the voice and brief text use. The app hard-codes `DEMO_LEARNER_NAME = "Stefen"` (`apps/mobile/src/content/demo.ts:12`).
2. **The "Nadani joined" beat is a blank placeholder.**
   - Steps: Playground → Invite a collaborator → Bring in Nadani.
   - Expected: two Minds arriving (the docs say "two Minds, one space").
   - Actual: a 292 px empty band with only "Stefen · Nadani" in small grey text, above "Two minds. One learning space." ([20](evidence/2026-09-26T20-15-32/screens/20-playground-invite.jpg))
   - Cause: `ArrivalDuo` in `apps/mobile/src/app/playground.tsx:339` renders only names. It reads as a failed load.
3. **Mid-edit crash (process bug, not in HEAD).** With a partially saved `MindVenn.tsx`/`playground.tsx`, Bring in Nadani blanks the screen ([run 20-00-32, 21](evidence/2026-09-26T20-00-32/screens/21-playground-compare.jpg)). There's no error boundary around the room canvas, so one render error takes out the whole page.
4. **Backboard memory writes intermittently fail.**
   - Steps: Ask any question (step 15).
   - Actual: `backboard POST /assistants failed: HTTP 500 {"detail":"Something went wrong…"}`. It happened 2 times in 22 Backboard calls this run and once in run 20-00-32. The answer still came back and memory *reads* worked, so it degraded honestly.
   - Secondary: the error label is misleading. `ensureOk` names the path with `path.split("/").slice(0, 2)`, so every `/assistants/<id>/memories` write is logged as `POST /assistants`, which looks like assistant creation (`packages/intelligence/src/adapters/memory.ts`, `call()`). Demo controls shows this red error text to anyone who opens it.

## 7. UX friction, screen by screen

**Onboarding** ([01a](evidence/2026-09-26T20-15-32/screens/01a-onboarding.jpg))
- Clean. "What you already know: Never asked. Measured from evidence" is a strong trust line.
- The headline is sans-serif. CLAUDE.md calls for "large editorial serif moments", and there's no serif anywhere in the audited screens.
- The lower half of the screen is empty.

**Today** ([03](evidence/2026-09-26T20-15-32/screens/03-today.jpg), [s2](evidence/2026-09-26T20-15-32/screens/today-scroll2.jpg))
- Strong first impression, and "Catch me up ~11 min" is the obvious next action.
- Defects a judge will see:
  - The stat label is truncated to **"CONNEC…"**.
  - The lead headline is truncated to "AI can now remember what matters across **…**", and the subline also ends in "…". The one development you want read in full is cut off.
  - Tiles are clipped: "Ask Think…" and "Learn together wit…".
- The lead card has **two people's faces** next to "5 connected concepts". Faces on a news development read as authors or collaborators, which is confusing.
- The lead card title ("AI can now remember…") differs from the Development title ("Persistent agent memory changes…"). That's fine, but the judge has to make the connection.

**Development** ([05](evidence/2026-09-26T20-15-32/screens/05-development.jpg), [s2](evidence/2026-09-26T20-15-32/screens/development-scroll2.jpg))
- The best screen in the app. "The change in a minute", "The catch", "Builds on what you knew" and "Why it matters to you" all make sense without narration, and the check is above the fold.
- "4 sources · Anthropic, arXiv +2" is metadata only. The actual sources, "You already knew" and "What changed" are behind **Read the full brief** at the very bottom. The judge order says "personal delta, sources"; the presenter must scroll and tap to show them.

**Diagnostic** ([06](evidence/2026-09-26T20-15-32/screens/06-diagnostic-open.jpg), [07](evidence/2026-09-26T20-15-32/screens/07-diagnostic-answer.jpg))
- Clear. There's a disabled Submit state, and "Why this question?" is available but collapsed.
- The runbook wants the "Chosen because…" line visible *before* answering; it currently takes a tap.

**Knowledge Update** ([r2](evidence/2026-09-26T20-15-32/screens/result-scroll2.jpg))
- Legible and honest: "Your answer supports this understanding. One answer is a signal, not proof." Also "NO LONGER FLAGGED 'Memory = context window'", and "Connected concepts nudged up".
- But the runbook's "technical wow moment" (0.42 → 0.51, 0.44 → 0.29) is hidden behind a small grey **"See the numbers"** text link. The visible state is qualitative: "Developing, with more evidence" and "Little evidence → Some evidence". A judge looking for why the model changed gets the reason, but not the quantity, unless the presenter taps.
- "Answered correctly. You correctly answered…" is redundant.

**Mind** ([08](evidence/2026-09-26T20-15-32/screens/08-mind.jpg), [i2](evidence/2026-09-26T20-15-32/screens/mind-inspector-scroll2.jpg), [changes](evidence/2026-09-26T20-15-32/screens/mind-changes.jpg))
- The header says **"Agent Memory"** even on the Map and Changes tabs. The screen never says "Mind", so first-timers may think they're on a concept page.
- Two map nodes have no labels (the grey filled node and the hollow node left of centre), and "Evaluators" is faded almost to invisible.
- The inspector's "What's changed for you" states the reason in plain words, which is good. There are no numbers on first view; the history is one more tap away ("Why we think you know this · history").
- Changes tab: a single row on a mostly empty page.
- Note: at 9e87c25 the inspector **does** call `GET /knowledge/:id/history` (`ConceptInspector.tsx:51`; observed 200 in step 8). The earlier note that it relies only on `lastTransition` is out of date. Either way this isn't a bug.

**Learn** ([11](evidence/2026-09-26T20-15-32/screens/11-learn.jpg), [09a](evidence/2026-09-26T20-15-32/screens/09a-resource-processing.jpg), [12](evidence/2026-09-26T20-15-32/screens/12-resource-add.jpg), [13](evidence/2026-09-26T20-15-32/screens/13-resource-teach.jpg))
- The empty state is clear. However, "Saved by you" and then a bold "Nothing saved yet." read as two headings, and the lower 45% of the screen is empty.
- The processing screen is a strong loading state with a stepper (Source ✓ → Concepts ✓ → **Your Mind** → New for you) and an honest sentence. The stepper wraps, orphaning "NEW FOR YOU" on its own line.
- The result's "~12 min full read / ~5 min useful for you" lands well.
- The "Compared … by Claude" provenance footer is not on the default tab (the harness saw no "by Claude"). The five-minute check tells the presenter to look for it.
- The teach screen is long, dense paragraphs. It's correct, but heavy on a phone.

**Ask** ([15](evidence/2026-09-26T20-15-32/screens/15-ask.jpg), [16](evidence/2026-09-26T20-15-32/screens/16-ask-why.jpg), [why-s2](evidence/2026-09-26T20-15-32/screens/ask-why-scroll2.jpg))
- Very good personalization: "Since you already see RAG as read-only retrieval, the new part is the write path…".
- "Why this answer?" is excellent judge material: remembered facts about you, sources, concept chips, "What you already understand (strong)" and "Still uncertain".
- Minor: the header "+" sits off-centre.

**Catch Me Up** ([17](evidence/2026-09-26T20-15-32/screens/17-voice.jpg), [18](evidence/2026-09-26T20-15-32/screens/18-voice-text.jpg))
- The web text fallback is honest ("Voice isn't connected here, so here is your catch-up as text"), with a single Continue.
- The **Jordan** greeting is the problem (§6.1).
- The body text is light grey on off-white, which is low contrast for long paragraphs.

**Playground** ([19](evidence/2026-09-26T20-15-32/screens/19-playground-open.jpg)–[25](evidence/2026-09-26T20-15-32/screens/25-playground-shared.jpg))
- The entry is clear ("Nothing is shared until you invite someone").
- "How it works" still says **"Muse compares your Minds"** and "Muse conducts the room" (`playground.tsx:381`, `:436`). e92e267 made the comparison Thinketh's, and the rail now says "Thinketh · Found a teaching gap". A judge who asks "Why did Muse choose this?" gets two stories.
- The arrival screen is blank (§6.2).
- Compare: the canvas with "starting out" / "verified" and "You can teach each other" is compelling.
- The labels mix "You", "Stefen" and "NADANI → STEFEN" on one screen.
- Teaching:
  - "Next: You: apply it to the new case" has two colons.
  - The transfer Submit looks enabled while the answer is empty, unlike the diagnostic's disabled state.
- Outcome: "Verified. You: 0.30 → 0.43", "Knowledge moved." and "Mastery 0.30 → 0.43 · why?" show the numbers the Today loop hides. "See **Stefen's** Mind" is written in the third person on your own device.
- Shared gap and source:
  - The shared gap is "What is worth remembering long-term?" and shows a Mem0 memory resource. The shared source Muse then brings in is **"Tool use with Claude"**. A judge will ask why a tool-use doc closes a memory gap.
  - It took 22 s from tap to result. The harness didn't capture the loading state, so it's unverified whether that wait inspires confidence.
  - "Same source. Different delta." lands, even though both sides show "5 new ideas".

**Visualize / Make it stick** ([26](evidence/2026-09-26T20-15-32/screens/26-visualize.jpg), [27](evidence/2026-09-26T20-15-32/screens/27-make-it-stick.jpg))
- Deterministic and clear; "Context is RAM. Memory is disk." is memorable.
- Visualize's coral CTA is the only coral-filled primary button in the app, which is inconsistent with the charcoal primaries.

**Explore** ([28](evidence/2026-09-26T20-15-32/screens/28-explore.jpg))
- Every item says why it's there, and it reacts to the Playground ("You just strengthened Evaluator Architectures"). Good.

**Failure states** (run 20-06-00, API down: [today](evidence/2026-09-26T20-06-00/screens/03-today.jpg), [ask](evidence/2026-09-26T20-06-00/screens/15-ask.jpg), [voice](evidence/2026-09-26T20-06-00/screens/17-voice.jpg))
- Calm and honest: "This didn't load. Your progress is saved. Try again in a moment." and "NO ANSWER YET · Couldn't get an answer just now · Try again".
- There's no seeded data pretending to be live.

## 8. Live backend versus fallback or mock

| Sponsor / feature | Proven live (this run) | Fell back | Not exercised |
|---|---|---|---|
| Claude: diagnostic selection, grading, resource analysis, teach, Ask, Playground transfer grading, shared-source deltas, Make it stick, Explore | Yes. 26 calls, 0 fallbacks. `analysis.source: claude` for the resource. | none | — |
| Tiger: knowledge transitions and history | Yes. Rows read back directly for steps 10 and 24; 0 fallbacks. | none | — |
| Mongo: developments, sources, vector search | Yes: development, diagnostic select, Ask, Visualize and Make it stick. 0 fallbacks. | none | — |
| Backboard: memory for Ask, "What Thinketh remembered" and the brief | Reads were live ("memory used: backboard" ×4; remembered facts on screen) | **2 of 22 calls** (HTTP 500 on memory writes), including 1 during Ask | — |
| Muse: Playground conductor | `conductor.mode: muse`, `detail: Muse (muse-spark-1.3)`; `conduct` 200 in 4.6–6.8 s | not observed. Muse has no `/health` adapter counter, so evidence is the payload only. | Muse proposing an invalid move (validator path) |
| ElevenLabs: Catch Me Up | `POST /voice/session` 200 with `mode=elevenlabs` (token issued) | The web build uses its own text mode by design | Actual conversation, audio, mic, interruption, "I'm done" (phone only) |
| Supabase: flags, profile | Flags readable (5); probe live in the final preflight | One intermediate preflight showed `fetch failed` (transient) | Realtime socket (single browser; polling observed) |
| Voyage | — | — | `VOYAGE_API_KEY` missing; not probed |
| Mock | Off for the whole run (`USE_MOCK_API=false`, `FALLBACK_TO_MOCK=false`) | — | `check:golden` ran mock-only as a contract check (22/22) |

## 9. Unverified

- **iOS Simulator:** not run (none booted).
- **Physical iPhone:** not claimed. Nothing in this report proves native gestures, microphone, speaker, haptics or the dev-client build.
- **Realtime across two devices, a two-phone join by code, and Muse's validator rejecting a move** were not exercised.
- **Whether the ElevenLabs agent says "Jordan" aloud** is probable (same payload) but unverified.

Manual phone checklist before judging:
1. Reset both personas. On the phone, long-press the Thinketh mark and tap Reset demo; confirm Agent Memory is back to about 0.42 / 0.44. Confirm `nadani` is at baseline: a fresh Playground plan must open with "Nadani teaches Stefen…".
2. Build: the dev client against the tunnel with `EXPO_PUBLIC_API_FALLBACK_TO_MOCK=true` for judging, and Metro restarted with `--clear`. **Freeze the working tree**; phone Metro serves it live.
3. Mindprint: pinch, pan and tap a node on the Mind map. Check the inspector opens and scrolls, and that "Why we think you know this · history" works.
4. Catch Me Up voice: the mic permission prompt appears the first time. ElevenLabs audio plays and the captions track it. Interrupt mid-sentence, ask a question, and say "I'm done", which should end the call. Listen for the learner's name.
5. Haptics: on a verified Playground transfer, check for one haptic and one halo, with no replay on refetch.
6. Playground on two phones: "Have a code? Join a Playground" joins as Nadani, and arrival shows on both within a few seconds.
7. Rerun the golden loop on the phone right after the reset: Today → Development → Check → Knowledge Update → Mind.

## 10. Ranked fixes (by impact on the judging demo)

1. **Say "Stefen", not "Jordan", in Catch Me Up.** It's the second screen of the judge order and probably spoken aloud. Evidence: [17](evidence/2026-09-26T20-15-32/screens/17-voice.jpg). Files: `packages/intelligence/src/seed/corpus.ts:585` (the `displayName` for the demo learner) or have the voice/brief greeting use the app's learner name. This touches the seed, so coordinate: the golden loop depends on the seeded baseline, but not on the name.
2. **Reset `demo-user` (and check `nadani`) immediately before judging, and keep the shared personas off-limits for testing.** Tiger shows 2 `demo-user` rows from 20:09:13Z (`evaluator-architectures` diagnostic_incorrect), which will change the Playground's "0.30 → 0.43". `nadani`'s rows from 19:48Z had flipped the whole Playground plan until someone reset them. Evidence: §3 and the `tiger-check.mjs` output. Where: Demo controls → Reset demo, and `POST /demo/reset` for `nadani` (owner action).
3. **Freeze the branch that phone Metro serves, and add an error boundary around the Playground room.** A half-saved edit blanked the Playground twice during this audit. Evidence: [run 20-00-32, 21](evidence/2026-09-26T20-00-32/screens/21-playground-compare.jpg) and the `MindVenn` TypeError. Files: process; `apps/mobile/src/app/playground.tsx` (wrap `RoomStage`).
4. **Fill the "Nadani joined" arrival beat.** Today it's a blank band that looks like a failed load. Evidence: [20](evidence/2026-09-26T20-15-32/screens/20-playground-invite.jpg). File: `apps/mobile/src/app/playground.tsx:339` (`ArrivalDuo`).
5. **Show the numbers on the Knowledge Update** (or make "See the numbers" a visible control), so the judge sees 0.42 → 0.51 / 0.44 → 0.29 without narration. Evidence: [r2](evidence/2026-09-26T20-15-32/screens/result-scroll2.jpg); step 7 observed "numbers on screen: not shown". File: `apps/mobile/src/components/KnowledgeStateTransitionView.tsx`.
6. **Fix the Today truncations:**
   - "CONNEC…", from `label: "Connected"` at `apps/mobile/src/app/(tabs)/index.tsx:116`
   - the lead headline and subline
   - the "Ask Think…" and "Learn together wit…" tiles

   Evidence: [03](evidence/2026-09-26T20-15-32/screens/03-today.jpg), [s2](evidence/2026-09-26T20-15-32/screens/today-scroll2.jpg).
7. **Make one story of who compares.** Replace "Muse compares your Minds" and "Muse conducts the room" with Thinketh compares / Muse conducts. File: `apps/mobile/src/app/playground.tsx:381`, `:436`.
8. **Match the shared source to the shared gap, or explain it.** A memory-consolidation gap closes with "Tool use with Claude". Evidence: [25](evidence/2026-09-26T20-15-32/screens/25-playground-shared.jpg). Where: `DEFAULT_ROOM_RESOURCE` in `packages/intelligence/src/playground/room.ts:39`, which was chosen on purpose for delta asymmetry, so the likely fix is the copy.
9. **Put sources and "You already knew / What changed" one tap closer** on the Development screen, or name the source list above the fold. Evidence: [development-scroll2](evidence/2026-09-26T20-15-32/screens/development-scroll2.jpg).
10. **Label Backboard errors by their real path,** and consider retrying a single HTTP 500 on memory writes. File: `packages/intelligence/src/adapters/memory.ts` (`call()`, `ensureOk` label).

## 11. Doc drift

- **`apps/mobile/README.md` "Real backend" / "Physical phone":** says to run `EXPO_PUBLIC_USE_MOCK_API=false EXPO_PUBLIC_API_URL=… npx expo start --clear`. While `apps/mobile/.env.local` exists, Expo bakes `.env.local` into the bundle anyway, even with `EXPO_NO_DOTENV=1`. The audit's web bundle still targeted the public tunnel (redirected by the harness). Command-line overrides don't take effect.
- **`apps/mobile/README.md`:**
  - "runs entirely on seeded mock data by default" and "Scan the QR code with Expo Go": the repo is set up for real-API dev-client builds.
  - The Layout section still says `(tabs)` holds "Today, Library, Explore, and Ask". The tabs are now **Today · Learn · Mind · Ask** (`src/app/(tabs)/`: index, library, mind, ask). CLAUDE.md's "Today · Library · Explore · Ask" is also out of date.
- **`README.md`:**
  - "Library, Explore, Ask" describes "Save any link"; the tab is **Learn**.
  - "Mind: … Tap a concept to see why the model changed" is accurate.
- **`docs/FINAL-SPRINT-REPORT.md` §11:**
  - "You missed 6 things worth knowing": the app says "**6 new things worth knowing**".
  - "Knowledge Update: coral trace, *Misconception resolved*": the app says "**No longer flagged**".
  - Mastery numbers are no longer shown by default.
  - Step 5 says "Library → + Add a resource"; the app has **Learn → Add a source**.
- **`docs/FINAL-SPRINT-REPORT.md` §12.4:** "the analysis footer says 'by Claude'". That footer isn't on the default Summary tab of the resource result.
- **`docs/spec/06-demo-runbook.md` Scene 4:** shows `mastery: 0.42 -> 0.51 / uncertainty: 0.44 -> 0.29` as the on-screen transition. It's now behind "See the numbers". Its scene names predate the current tabs.
- **`docs/PLAYGROUND-REPORT.md` two-minute script:**
  - Step 3: "Muse compares" contradicts e92e267, where Thinketh compares.
  - Step 5: "Apply that idea to an autonomous coding agent": the live prompt is the **refund** agent (PLAYGROUND.md already notes the reword).
  - Step 7: "Teach us the delta" is now **"Teach it to both of us"**.
  - Step 7: Muse says "Stefen: focus on evaluator architectures, skip agent tool use". The live line is "Stefen: focus on **what AI should remember**, and skip when AI should use a tool" (the default source changed to "Tool use with Claude").
- **`docs/PLAYGROUND.md` "Safe golden path" step 5:** "Teach us the delta" is now "Teach it to both of us".
- **`docs/DEPLOY.md`:** consistent with what was observed (Node server plus quick tunnel). Not exercised by the audit.
