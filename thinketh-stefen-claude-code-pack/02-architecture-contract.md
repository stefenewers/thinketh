# Architecture Contract

## System shape

```text
Mobile Expo App
      |
      v
Thinketh API / Supabase Edge Functions
      |
      +-- IntelligenceModel -> Claude
      +-- MemoryProvider -> Backboard
      +-- SemanticStore -> MongoDB Atlas
      +-- TemporalStore -> Tiger Data
      +-- Voice session/token endpoint -> ElevenLabs
      |
      v
Shared contracts + deterministic knowledge-state engine
```

## Hard rule

The mobile client never knows vendor-specific storage details.

The mobile client consumes Thinketh domain objects:
- Development
- DailyBrief
- KnowledgeState
- DeltaExplanation
- DiagnosticQuestion
- KnowledgeStateTransition

## Why each data system exists

### Supabase
Owns:
- authentication
- user profile
- app settings
- integration IDs
- lightweight orchestration state
- demo seed / feature flags if useful

Do not turn Supabase into a duplicate of every other sponsor store.

### MongoDB Atlas
Owns semantic/corpus objects:
- developments
- source documents
- claims
- concepts
- edges
- storylines
- embeddings / search metadata

Use Atlas Search / Vector Search only server-side.

### Tiger Data
Owns append-oriented temporal facts:
- world_state_events
- knowledge_observations
- knowledge_state_transitions
- interaction_events
- development_significance_history

This is where "version control for human understanding" becomes real.

### Backboard
Owns persistent assistant memory:
- cross-thread user facts
- preferences
- recurring misconceptions
- learning context
- prior conversation memory

Use one stable assistant identity per user/demo persona when memory needs to persist across threads.

Do not treat Backboard memory as the authoritative numeric mastery store. Numeric knowledge state belongs to Thinketh's own state model and temporal history.

### ElevenLabs
Owns real-time conversational voice for Catch Me Up.

Voice is a presentation/interaction layer, not the source of truth.

### Claude
Owns semantic inference:
- extracting claims/concepts
- normalizing a development
- generating explanations
- generating structured diagnostics
- producing diagram specs
- producing mnemonic/analogy specs

Claude does not directly mutate knowledge-state numbers.

## Adapter interfaces

```ts
export interface MemoryProvider {
  recall(userId: string, query: string): Promise<MemoryItem[]>;
  remember(userId: string, item: MemoryItem): Promise<void>;
}

export interface SemanticStore {
  upsertDevelopment(input: Development): Promise<void>;
  search(query: SemanticSearchQuery): Promise<SemanticSearchResult[]>;
  getDevelopment(id: string): Promise<Development | null>;
}

export interface TemporalStore {
  appendObservation(input: KnowledgeObservation): Promise<void>;
  appendTransition(input: KnowledgeStateTransition): Promise<void>;
  getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]>;
}

export interface IntelligenceModel {
  normalizeDevelopment(input: RawSourceBundle): Promise<Development>;
  explainDelta(input: DeltaContext): Promise<DeltaExplanation>;
  generateDiagnostic(input: DiagnosticContext): Promise<DiagnosticQuestion>;
  makeItStick(input: LearningContext): Promise<MemoryAid>;
  visualize(input: LearningContext): Promise<DiagramSpec>;
}

export interface VoiceProvider {
  createSession(userId: string, briefId: string): Promise<VoiceSession>;
}
```

## Failure boundaries

Every adapter must have:
- timeout
- error mapping
- observable logging
- demo fallback

The UI should display cached/seeded content rather than fail because a sponsor API is unavailable.

## API surface

Suggested endpoints:

```text
GET  /brief/today
GET  /developments/:id
POST /developments/:id/feedback
POST /diagnostics/select
POST /diagnostics/:id/answer
GET  /knowledge
GET  /knowledge/:conceptId/history
POST /ask
POST /visualize
POST /make-it-stick
POST /voice/session
```

## Repository ownership

### Stefen
Prefer ownership of:
- `/apps/mobile/**`
- `/packages/ui/**`

### Nadani
Prefer ownership of:
- `/packages/intelligence/**`
- `/supabase/functions/**`
- vendor adapters

### Shared
Change carefully:
- `/packages/contracts/**`
- root config
- environment schema

## Mobile voice constraint

ElevenLabs React Native uses LiveKit/WebRTC. Plan for an Expo development build, not Expo Go, once voice is integrated.

The app must remain demoable without voice.
