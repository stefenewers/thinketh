# Final Verification Checklist

Run this after the implementation sprint.

## A. Golden path

- [ ] App launches on physical iPhone
- [ ] Today loads from real API
- [ ] Brief shows expected meaningful/major/catch-up values
- [ ] Filtered count opens explanation
- [ ] Lead development opens
- [ ] Development detail renders
- [ ] Check My Understanding opens
- [ ] Diagnostic accepts answer
- [ ] PKS update occurs through deterministic engine
- [ ] Knowledge Update visual uses real transition data
- [ ] Mind reflects updated state
- [ ] History reflects transition
- [ ] Reset restores seeded state

## B. Voice

- [ ] Catch Me Up opens
- [ ] ElevenLabs connects
- [ ] microphone permission works
- [ ] agent speaks
- [ ] user can respond
- [ ] interruption works
- [ ] listening/speaking state updates
- [ ] End Session works
- [ ] leaving screen tears session down
- [ ] reopening creates clean session
- [ ] transcript fallback still works

## C. Learning Queue

- [ ] Library shows Learning Queue
- [ ] empty state looks intentional
- [ ] Add Resource opens
- [ ] invalid URL rejected
- [ ] local/private URL rejected where implemented
- [ ] real HTML URL processes
- [ ] timeout fails gracefully
- [ ] unsupported source fails gracefully
- [ ] ready resource persists/reappears if persistence exists
- [ ] resource detail shows real metadata
- [ ] original source opens
- [ ] full-read time appears
- [ ] useful-for-you time appears
- [ ] already-understood section appears
- [ ] new-to-you section appears
- [ ] Mind connections appear
- [ ] Teach Me the Delta works
- [ ] Check My Understanding routes into existing diagnostic

## D. State safety

- [ ] resource analysis does not mutate mastery
- [ ] Teach Me the Delta does not mutate mastery
- [ ] Ask modes do not mutate mastery
- [ ] only evidence/diagnostic path updates PKS
- [ ] Backboard does not store numeric mastery claims
- [ ] reset still reconciles state correctly

## E. Ask

- [ ] Quick answer works
- [ ] Teach me works
- [ ] Go deep works
- [ ] mode differences are visible
- [ ] sources remain grounded
- [ ] related concepts still route to Mind
- [ ] memory-used section is intact

## F. Sources

- [ ] visible seeded sources have real metadata where possible
- [ ] visible source URLs open
- [ ] source types are accurate
- [ ] no fake peer-reviewed/credibility labels
- [ ] no dead source rows in demo path

## G. UI polish

- [ ] no accidental card soup
- [ ] coral remains scarce
- [ ] typography hierarchy is clear
- [ ] major actions are obvious
- [ ] no raw PKS decimals dominate consumer surfaces
- [ ] loading states are truthful
- [ ] empty states feel intentional
- [ ] touch targets are comfortable
- [ ] no clipped text
- [ ] no safe-area issues
- [ ] keyboard behavior is good
- [ ] no excessive animation
- [ ] reduced-motion behavior is reasonable

## H. Engineering

- [ ] tests pass
- [ ] typecheck passes
- [ ] lint passes
- [ ] remote verification passes
- [ ] no secret leaked client-side
- [ ] API app-key protection still works
- [ ] rate limiting still works
- [ ] current iOS native dependency pin remains intact
- [ ] no unrelated package upgrades
- [ ] no unnecessary migrations

## I. Demo reliability

- [ ] current Cloudflare tunnel works
- [ ] backend laptop stays awake
- [ ] phone points to current API URL
- [ ] fallback behavior is known
- [ ] reset verified before judging
- [ ] source ingestion has one known-good live URL ready
- [ ] second backup URL ready
- [ ] screen recording backup captured
