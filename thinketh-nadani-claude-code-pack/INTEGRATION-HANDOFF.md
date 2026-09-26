# Nadani Integration Handoff

When the core backend works, send Stefen:

## Base URL / invocation method
Explain how mobile calls the Thinketh backend.

## Working request/response examples
Provide:
- GET `/brief/today`
- GET `/developments/:id`
- POST `/diagnostics/select`
- POST `/diagnostics/:id/answer`
- GET `/knowledge`
- GET `/knowledge/:conceptId/history`

Then:
- POST `/ask`
- POST `/visualize`
- POST `/make-it-stick`
- POST `/voice/session`

## Integration order
1. Today
2. Development
3. Diagnostic select
4. Diagnostic answer
5. Knowledge state
6. History
7. Ask
8. Visualize
9. Make It Stick
10. Voice

Keep deterministic fallback data available after sponsor services are connected.
