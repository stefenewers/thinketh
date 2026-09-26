# Nadani Thinketh Claude Code Pack

Use this folder on Nadani's computer as the complete context for the backend/intelligence workstream.

## You own
- knowledge-state engine
- observation weighting
- state transitions
- adaptive diagnostic selection
- delta engine
- Claude structured inference
- Backboard
- MongoDB Atlas
- Tiger Data
- Supabase backend/API layer
- ElevenLabs server support
- seeded demo corpus
- backend tests

## Start
1. Put `00-CLAUDE.md` at the repo root.
2. Open Claude Code in the repo.
3. Paste the contents of `01-NADANI-FIRST-PROMPT.md`.
4. Work on branch `nadani/intelligence`.

## Independence rule
Do not wait for Stefen's UI. Build and test the backend against shared typed fixtures.

Your branch is successful when this works through tests/API calls:

Today -> Development -> Diagnostic -> Knowledge State Transition -> Temporal history
