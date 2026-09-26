# HackGT Demo Runbook

## Demo thesis

Do not demo "all the features."

Prove this sentence:

> Thinketh isn't tracking what you read. Thinketh is tracking what you understand.

## Target duration

90–150 seconds for the core demo.

## Scene 1 — Morning / Today

Open the mobile app.

Show:

> You missed 6 things worth knowing.  
> 3 are major.  
> 11-minute catch-up.

Mention:
- Thinketh processed much more.
- duplicates, low-signal content, and things already understood were removed.

Do not linger.

## Scene 2 — One development

Tap:

> Persistent agent memory changes how long-running agents operate

Show:
- What happened
- Why this matters to you
- You already knew
- What changed
- Why this changes your mental model

Line to land:

> A normal AI reader summarizes the announcement. Thinketh compares it against a model of what I already understand.

## Scene 3 — Adaptive diagnostic

Tap "Check my understanding."

Before answering, show a small debug/explainability affordance:

> Chosen because Agent Memory is high-uncertainty and central to topics you're following.

Answer correctly.

## Scene 4 — Knowledge update

Show live transition:

```text
Agent Memory
mastery: 0.42 -> 0.51
uncertainty: 0.44 -> 0.29
```

Then open explanation:

> Updated because you correctly answered a transfer question about what state persists across sessions.

This is the technical wow moment.

## Scene 5 — Mind

Open Mind / Knowledge State.

Show:
- Agent Tool Use strong
- MCP intermediate
- Agent Memory just improved
- Evaluator Architectures still weak

Tap Agent Memory and show temporal history.

Line:

> Tiger Data lets us preserve these changes as a temporal history, so Thinketh can answer not only what I know, but how my understanding changed.

## Scene 6 — Sponsor depth (optional based on judge)

If asked:
- MongoDB Atlas: semantic developments/concepts/sources + vector retrieval
- Backboard: persistent learning memory across conversations
- Tiger Data: temporal knowledge-state transitions
- ElevenLabs: Catch Me Up voice

## Scene 7 — Voice (only if stable)

Tap Catch Me Up.

Voice:
> You have about 10 minutes. Three developments materially changed topics you follow today...

Interrupt with one question.

Do not make voice the only demo path.

## Optional wow — Visualize This

Tap Visualize This.

Show deterministic structured "before vs after" mental model.

This is safer and more legible than generated art.

## Emergency fallback

If network integrations fail:
- demo uses seeded local data
- knowledge-state algorithm still runs locally/server-side
- Mind update still animates
- sponsor adapter screens can show cached successful data or architecture
- never expose an error stack to judges

## Judge questions to prepare for

### "Isn't this just RAG?"
Answer:
RAG retrieves relevant information. Thinketh maintains a persistent, temporal model of the user's understanding and uses observations to decide what is actually new to them and what intervention to choose next.

### "How do you know mastery?"
Answer:
We do not ask an LLM to guess a percentage. We maintain a transparent state estimate updated from weighted observations. Diagnostic evidence has higher information value than passive reading signals, and every transition stores a reason.

### "Why all these databases?"
Answer:
They have distinct roles: semantic corpus, temporal state history, persistent conversational memory, and application/auth state. The mobile app sees one Thinketh domain API, so the services remain replaceable.

### "What is the technical contribution?"
Answer:
The knowledge-state model, explainable transitions, delta calculation against that model, and adaptive diagnostic selection.
