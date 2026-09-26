# Implementation Research Notes

These notes capture the current implementation constraints used to write this build pack.

## Expo / React Native

Expo Router is a file-based router for React Native and web. Current Expo documentation recommends creating a new Expo app with Expo Router available/configured.

Reference:
- https://docs.expo.dev/router/introduction/
- https://docs.expo.dev/versions/latest/sdk/router/

## Supabase + Expo

Supabase has a current Expo React Native quickstart using `@supabase/supabase-js`, React Native URL polyfills, and Expo-compatible session storage. Public client variables must use publishable credentials; privileged credentials must remain server-side.

Reference:
- https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native

## ElevenLabs + Expo

ElevenLabs provides an official React Native SDK built around LiveKit/WebRTC. It is designed for Expo but requires an Expo development build and does not run in Expo Go.

Reference:
- https://elevenlabs.io/docs/eleven-agents/libraries/react-native
- https://elevenlabs.io/docs/eleven-agents/guides/integrations/expo-react-native

## Backboard memory

Backboard memory persists at the assistant level and can be recalled across threads when the same assistant identity is used. Memory can be enabled per turn.

Reference:
- https://docs.backboard.io/sdk/memory
- https://docs.backboard.io/concepts/memory

## Tiger Data

Tiger Data / TimescaleDB extends PostgreSQL for time-series workloads with hypertables, continuous aggregates, and time-based analytics. It also supports pgvector integration, but Thinketh should use Tiger primarily for temporal state history to keep sponsor roles clean.

Reference:
- https://www.tigerdata.com/docs
- https://www.tigerdata.com/learn/continuous-aggregates-timescaledb

## MongoDB Atlas

MongoDB Atlas provides Search and Vector Search. Thinketh can use this for semantic development/concept/source retrieval and keep temporal state history in Tiger.

Reference:
- https://www.mongodb.com/docs/atlas/search-changelog/
- https://www.mongodb.com/docs/drivers/node/current/atlas-search/

## Architecture takeaway

For a two-person hackathon team, do not let the mobile app directly depend on each vendor.

Use domain adapters and deterministic fallback implementations so:
- the app can be built in parallel
- sponsor integrations can arrive late
- one failed API does not destroy the demo
