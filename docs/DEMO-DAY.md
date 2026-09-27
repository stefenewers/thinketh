# Demo day (2026-09-27)

For Nadani, from Stefen: what we're running for judging and what not to touch.

## Setup

- We demo on the **iPad**. It has a release build installed from Stefen's Mac, so it needs no Metro. It runs the phone layout scaled up; no iPad layout today.
- API (running on Stefen's Mac): `https://notre-biotechnology-zinc-fotos.trycloudflare.com`
- To run the app yourself: `node scripts/configure-demo-mobile.mjs https://notre-biotechnology-zinc-fotos.trycloudflare.com`, then restart Metro with `--clear`.

## Please don't, until judging is over

- Restart the API or run `scripts/demo-api.sh`. That changes the URL, and the iPad app would need a rebuild.
- Push to `main`.

## What changed since yesterday

- **Playground:** bring in Nadani → Compare our Minds → Let our agents exchange (about 35 s) → takeaway → Challenge this idea (Grokbot).
  - The guided "answer in your own words" session is removed, at Stefen's request.
  - A one-tap "Let our agents exchange" button on the empty Playground brings Nadani in, compares and starts the agents.
- **Voice:**
  - Fixed a crash from the voice bar's exit animation.
  - Still unsolved: the mic sometimes goes silent until the app is restarted.
- **Offline fallback:** if the network drops, the iPad build shows seeded demo data instead of errors. The Playground still needs the live API.

## During the demo

- **Voice is the fragile part.** If the agent says "Are you still there?", the mic has gone silent. Type instead, then force-quit and reopen the app before the next judge.
- **Between judges:** long-press the thinketh logo on Today → Demo controls → Reset demo.
- **The Mac** stays plugged in and awake, with a phone hotspot ready as backup. A watchdog restarts the API if it stops answering, and the URL stays the same.
