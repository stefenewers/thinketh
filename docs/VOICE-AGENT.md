# Thinketh's voice companion

Thinketh's voice agent used to be tied to Catch Me Up. It is now one companion, available from every main screen. It keeps the same hosted ElevenLabs agent, the same voice and the same identity, and Catch Me Up is one activity of it.

## How it works

**One conversation for the app.**
- `AgentProvider` sits at the root (`apps/mobile/src/app/_layout.tsx`).
- Where native voice can run, it loads `AgentRuntime`. This goes through the existing guard in `voice/availability.ts`, so the native SDK is only required in development and release builds.
- `AgentRuntime` owns the single `ConversationProvider`. It also owns:
  - connection and mic state
  - captions and turns
  - the activity (`assist` or `catch_up`)
  - screen context
  - client tools
  - audio focus
  - compact and expanded presentation
- Changing routes never reconnects, greets again or asks for a second token.
- On web, in Expo Go, or without WebRTC, `AgentProvider` renders a text-only stand-in. Nothing that depends on voice is shown, and Ask still works.

**Presentation.**
- **Idle:** a small "Talk" control (the Thinketh mark) sits above the tab bar. Nothing listens until it is tapped, and the microphone permission is only requested then.
- **Live:** a slim dock shows the state (Connecting, Listening, Hearing you, Thinking, Speaking, Muted), one line of caption, a mute button and an end button. Tapping the dock opens the conversation (`AgentSheet`), which has:
  - the captions and recent turns
  - "Type to Thinketh"
  - mute
  - "Stop talking" (silences the current reply only)
  - "End conversation"
- **Minimize** (top of the sheet) keeps the call. **End** (bottom of the sheet, and the dark ✕ on the dock) disconnects and releases the mic.
- **Ask** shows the voice entry in its own composer (mic when the composer is empty, the live state while a call runs), so there is no second floating mic.
- **Catch Me Up** (`/voice`) renders the same shared call with its existing live canvas. Closing that screen minimizes the call; it does not end it.
- **Stop, mute and end are three different things:**
  - "Stop talking" or "stop" silences the rest of the reply locally (`setVolume(0)` until the agent's turn ends), and the SDK interrupts server-side because the user spoke.
  - "Mute my mic" is a tool call that mutes input.
  - "End the conversation" makes the agent call `end_call`. The deterministic `isEndIntent` check still ends the call, as it did before.

**Screen context** (`agent/screenStore.ts`, `agent/screenContext.ts`).
- Each main screen calls `useAgentScreen({...})` while it is focused. The typed contract is `AgentScreenContext` in `packages/contracts/src/agent.ts`. It holds:
  - the screen and route
  - the focused concept, development, resource or room
  - a few visible lines
  - for Playground rooms: the scene and an `assessing` flag
- The runtime sends a debounced, deduplicated `contextual_update` that replaces the earlier screen context.
- Whole libraries and histories are never sent.
- During an assessment (`assessing: true`), the context tells the agent to help with navigation only, and never to coach the answer or describe a rubric.

**Tools** (`agent/tools.ts`).
- The tools are an allowlist backed by the real API, and the same list (`AGENT_TOOLS`) configures the hosted agent.
- Every id is validated against the authenticated API before anything happens. No tool accepts routes, URLs or user ids.
- Navigation only reports success after the destination screen publishes its own context.
- Results arriving after the call has ended or the account has changed are dropped (epoch check).
- Identical calls within 2 s are merged, and bursts of navigation are capped.
- Handlers never throw. The SDK reports thrown tools as session errors, so every failure comes back as a structured `{ ok: false, reason }` result.

| Tool | Backed by |
|---|---|
| `get_screen_context` | the screen store |
| `explain_focus` | `getKnowledge`, `getDevelopment`, `getResource` (level words only, never numbers) |
| `ask_thinketh` | `POST /ask` (the Ask engine) |
| `find_concept`, `open_concept` | `getKnowledge` + deterministic name matching; ambiguity returns options |
| `open_development`, `open_resource` | `getDevelopment`, `getResource` |
| `open_sources` | Mind `?concept=…&tab=sources` (the book's Sources tab), or the development page |
| `open_visualization` | `/visualize/[developmentId]` for the book's development in today's brief |
| `navigate` | allowlist: today, learn, mind, ask, explore, playground (when available), profile |
| `go_back`, `start_catch_up`, `mute_microphone` | the router, the session's briefing, the SDK mute |
| `read_takeaway`, `challenge_takeaway` | **Not available on `main`.** These return `{ ok: false }` until the agent-exchange / Grokbot work supplies handlers (`ExchangeCapabilities` in `tools.ts`). |

**Lifecycle.**
- **Backgrounding** ends the call; there is no background listening.
- **A brief interruption** (a phone call, Control Center) mutes the mic. Only the user turns it back on, so recording never resumes silently.
- **Logout or an account switch** ends the call and drops any prepared token.
- **A single audio owner** (`agent/audioFocus.ts`): anything else that speaks must claim audio focus, which silences the agent. Today nothing else in the app plays audio.

## Backend

- `POST /voice/session` accepts `{ activity?: "assist" | "catch_up" }`. The schema is `VoiceSessionRequestSchema`, and the session's `dynamicVariables` gain `activity` and `opening_line`.
- With no activity, the endpoint behaves exactly as before (Catch Me Up), so older app builds are unaffected.
- The briefing script is included for both activities, so "catch me up" works in the middle of a conversation.

## Hosted agent configuration (applied 2026-09-27)

This is applied with `node --env-file=.env scripts/voice-agent/configure.ts --apply`. The script is idempotent. It backs up the agent, applies the changes and verifies them.

| Setting | Before | After |
|---|---|---|
| Voice / TTS | `aTjktDK8M3doKUGPAY2J`, eleven_flash_v2, stability 0.5, similarity 0.8, speed 1, phone filter | **unchanged** (verified by the script) |
| Prompt | Catch-Me-Up only; its guardrail refused anything else | `scripts/voice-agent/prompt.md`: the same identity, tone and knowledge-state rules, with two activities, screen context, tool rules, stop/mute/end and the assessment rule |
| Client tools | none (only the `end_call` system tool) | the 15 client tools from `AGENT_TOOLS`, `expects_response: true`, 20 s timeout; `end_call` is kept |
| First message | the Catch Me Up line | unchanged; `agent.first_message` override is now **allowed**, and the app sends the assist opening for general assistance |
| Client events | audio, interruption, agent_response, user_transcript, agent_response_correction, agent_tool_response | adds `client_tool_call` |
| Dynamic variable placeholders | none | user_name, brief_date, brief_minutes, brief_script, activity, opening_line (for the dashboard's test calls) |
| LLM | qwen35-397b-a17b, temperature 0 | unchanged |

**Revert:** `node --env-file=.env scripts/voice-agent/configure.ts --restore scripts/voice-agent/.backups/agent_7301m3dwaz6kfjbr59749g5wy1np-2026-09-27T03-21-05-100Z.json`. That is the pre-change backup. The folder is git-ignored and exists only on the machine that ran the script.

### Rollout caveat: app builds with embedded pre-change JavaScript

The platform only lets a session select from tools that are already attached to the agent. A per-session `tool_ids` override was tested, and it was rejected with "Tool IDs not attached to this agent". So the tools are attached for every session.

A build whose JavaScript predates this change has no handlers for them. If the agent calls a tool during that build's Catch Me Up, the old screen treats the SDK error as fatal and falls back to the transcript. This was observed live with a simulated old client: the agent called `explain_focus` without any screen context.

- **Dev-client builds** load JavaScript from Metro, so they are fine once reloaded.
- **Standalone/TestFlight builds** made before this change need a rebuild, or the agent must be restored with the command above while they are in use.

## Verified

- **Unit tests:** `apps/mobile/src/agent/__tests__/tools.test.ts` covers id validation, confirmed navigation, stale results, dedupe, the allowlist, honest failures, the no-throw rule, activity switching and the assessment wording. `voice/__tests__/endIntent.test.ts` covers the split between "stop talking" and ending. `packages/intelligence/test/adapters.test.ts` covers the activity split.
- **Local API:** `POST /voice/session` returns real ElevenLabs tokens for `assist` and `catch_up`. `{}` still returns Catch Me Up, and an invalid activity returns 400.
- **Live conversation with the hosted agent over its websocket** (text turns, the app's context messages, the assist opening override, the app's tool result shapes):
  - "Open the book about agent memory" → `find_concept` → `open_concept("agent-memory")`
  - "Explain this" → `explain_focus` on the updated screen focus
  - "Show me its sources" → `open_sources`
  - "End the conversation" → `end_call`
  - The assist opening override was accepted, and no briefing was delivered unprompted.
- **Simulated conversations (mocked tools):**
  - "catch me up" → `start_catch_up`
  - "show me a visualization" → `open_visualization`
  - "mute my mic" → `mute_microphone`
  - "stop talking" → "Sure." with no end
  - Ambiguous book → a one-line clarification
  - "What did my agent learn from Nadani?" and "Challenge that takeaway with Grokbot" → honest "not available in this version"
- **Web build:** cold start with the root provider, Today, Ask, the Mind deep link with `tab=sources`, and the Catch Me Up transcript fallback all loaded with no console errors.

## Not verified (needs a phone)

- The microphone and audio on a device:
  - the permission prompt and denial path
  - that `endSession` actually releases the mic (the iOS indicator turning off)
  - interruption while speaking
  - "Stop talking" silencing through `setVolume`
  - output-volume metering
- The full spoken acceptance journey on iOS. The navigation chain was verified against the hosted agent with text turns and against the app's handlers in unit tests, but never end to end by voice on a device.
- Background/foreground, device lock and phone-call interruptions, and account switching during a live call. The code paths exist but have no automated tests.
- Whether `contextual_update` with `context_id: "screen"` supersedes earlier context server-side. The text also says it replaces the earlier context, as a fallback.
- Keyboard, large text and reduced motion on a device. The layouts use `minHeight`, hide the dock while the keyboard is up, and skip entrance animations under Reduce Motion.
- Takeaway reading and Grokbot challenges: there is no implementation on `main`, so none was demonstrated.
