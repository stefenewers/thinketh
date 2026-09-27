# Grokbot: an optional visiting challenger

Written for the Thinketh team (Stefen, Nadani, and their coding sessions).

Grokbot runs **after** two agents save a sourced takeaway in the Playground. A participant taps **Challenge this idea**. Grokbot then:

1. examines the takeaway, its permitted material and excerpts of the exchange transcript;
2. raises one challenge, or reports insufficient evidence or no clear issue.

The agent that wrote the takeaway answers Grokbot's actual output: it defends the takeaway, revises it, or concedes. Thinketh then checks the result against the cited material and saves one of these outcomes:

| Outcome | What it means |
|---|---|
| **Revised** | A supported revision was saved as a new version. |
| **Supported by the cited material** | The takeaway stands on its cited sources. |
| **Unresolved** | The takeaway is kept. The open challenge is recorded on it. |
| **No clear issue found** | Grokbot found nothing to challenge. This is not proof the takeaway is correct. |

Muse still coordinates the exchange; Grokbot is a specialist. Nothing here changes anyone's knowledge state.

> The repo's CLAUDE.md keeps Grok out of the **core build**. Grokbot is off unless `XAI_API_KEY` and `XAI_MODEL` are set on the server, and it isn't on the golden demo path. Confirm with Stefen before merging to `main`.

## Configuration (server only)

| Name | Required | Notes |
|---|---|---|
| `XAI_API_KEY` | yes | Server `.env` only. Never set it as an `EXPO_PUBLIC_*` variable. |
| `XAI_MODEL` | yes | No default is assumed. `grok-4.7` was verified against `GET /v1/models` on 2026-09-26. |
| `XAI_API_BASE` | no | Default: `https://api.x.ai/v1`. |
| `XAI_REASONING_EFFORT` | no | Sent only when set. Supported values depend on the model. |
| `THINKETH_CHALLENGE_DEADLINE_MS` | no | Default: 240000. |
| `THINKETH_CHALLENGE_CALL_TIMEOUT_MS` | no | Default: 45000. |
| `THINKETH_CHALLENGE_MAX_TOOL_CALLS` | no | Default: 18. |

Grokbot's reply step also needs Muse (`MUSE_API_KEY`, `MUSE_MODEL`) for the defending agent. Checks use Claude when `ANTHROPIC_API_KEY` is set; otherwise they use Thinketh's deterministic check, and the result says which one ran.

## How it runs

The engine is `packages/intelligence/src/playground/exchange/challenge.ts`. It reuses the exchange machinery:
- the room lock;
- a durable claim for each step;
- stale-step discard;
- stop and reconcile.

### Phases

| Phase | What happens |
|---|---|
| `examining` | Grokbot reads through its tools. It then either delivers a finding or asks one clarifying question. |
| `clarifying` | At most once. The defending agent answers, then Grokbot examines again. |
| `defending` | The defending agent defends, revises, or concedes. |
| `checking` | Thinketh checks against the cited material. |
| `repairing` | At most once, when a revision isn't supported. |
| `assessing` | Grokbot's stance is recorded. It is not decisive. |
| `settling` | `settleOutcome` decides the outcome. It's a deterministic, pure, unit-tested function. The result is persisted with compare-and-set on the takeaway version. |

### Grokbot's tools

Every tool's arguments and refs are validated on the server.

| Tool | What it does |
|---|---|
| `read_takeaway` | Reads the takeaway under challenge. |
| `read_transcript` | Reads the last 8 agent messages of the exchange. |
| `inspect_material` | Reads passages the takeaway cites, or refs the other agent sent. It can also run up to 2 lookups in the public corpus. |
| `request_clarification` | Asks the defending agent one question. |
| `deliver_challenge` | Delivers an objection, a qualification, or a counterexample. |
| `report_insufficient_evidence` | Says the material can't settle the question. |
| `report_no_issue` | Says Grokbot found nothing to challenge. |
| `return_assessment` | Records Grokbot's stance on the defending agent's response. |

### What Grokbot can't see

Grokbot never sees:
- mastery or snapshots;
- memories;
- diagnostic answer keys;
- the owner's other takeaways;
- a saved-source summary whose owner isn't sharing it.

### Guarantees

- **Bounded turns.** A turn is at most 6 model calls. The last call offers only the ending tools, so every turn concludes or fails honestly.
- **Honest failures.** If xAI fails or times out, the challenge ends as `unavailable` or `timed_out`. The exchange and the takeaway are untouched. No other model stands in for Grokbot.
- **Stale results are rejected.** A result for a takeaway whose version changed is marked `stale` and is not written.
- **One challenge per version.** Duplicate starts, whether from double taps or several devices, return the same challenge.

## Evidence

### Mocked tests (no network)

- `packages/intelligence/test/challenge.test.ts`: 20 tests. They cover:
  - the outcome rule;
  - no clear issue;
  - an overbroad takeaway that gets revised;
  - an unsupported objection that doesn't overwrite a supported takeaway;
  - insufficient evidence ending as unresolved;
  - one repair;
  - permission boundaries;
  - clarification;
  - duplicates;
  - stop;
  - a stale version;
  - xAI being unavailable or timing out;
  - xAI not being configured;
  - persistence and reopening after a restart;
  - no change to human knowledge;
  - the xAI adapter's wire format.
- `apps/mobile/.../grokbot/__tests__/grokbotState.test.ts`: what the room shows, tested with rooms captured from a live run.

### Live run

Run it with:

```sh
npm run verify:grokbot --workspace @thinketh/intelligence -- overbroad
```

It uses real Muse agents, Claude checks, and Grok (`grok-4.7`) on an isolated temp store. The latest run (2026-09-26):

- **The exchange's own takeaway.** Grokbot made 6 calls in 48.9s. Outcome: **No clear issue found** ("Cited claim matches the takeaway; no clear gap").
- **Overbroad fixture.** The script deliberately added "in every setting and for every kind of task, without exception" to the takeaway.
  - Grokbot raised a **qualification**: "S1 never says 'every setting, every task, no exception.'"
  - Muse revised the takeaway, and Claude found the revision **supported**.
  - Grokbot's assessment was **satisfied**. Outcome: **Revised, v1 → v2**.
  - Grokbot made 6 calls in 16.4s; the whole run took 28.9s.
- Human knowledge state was unchanged in both runs.

### Screenshots

The files in this folder come from the dev-only `/grokbot-preview` route. It renders rooms captured from that live run.

## Limitations

- The screenshots come from the preview route, not from a device. The components are mounted in the real Playground (`WorldCanvas`, `ExchangeScene`, `takeaway/[id]`), but that flow hasn't been walked on a phone against the live API.
- Outcomes depend on the grounding check. Checks against extracted claims can only be as good as those claims: Grok's first live challenge pointed out exactly that ("the claim just restates the takeaway").
- A lookup in the public corpus reuses Thinketh's corpus. There is no web search.
- Grokbot's examining step can take 15–50s. The mobile app waits up to 120s for each step.
