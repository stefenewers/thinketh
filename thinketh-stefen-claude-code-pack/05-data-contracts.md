# Shared Data Contracts

Keep these contracts stable. Implement with Zod + inferred TypeScript types.

## Core IDs

Use string IDs everywhere across service boundaries.

## UserProfile

```ts
type UserProfile = {
  id: string;
  displayName: string;
  interests: Interest[];
  goals: string[];
  explanationPreferences: string[];
};
```

## Concept

```ts
type Concept = {
  id: string;
  name: string;
  description: string;
  domain: string;
  importance: number; // 0..1
};
```

## ConceptEdge

```ts
type ConceptEdge = {
  fromConceptId: string;
  toConceptId: string;
  type: "prerequisite" | "related" | "supports" | "contrasts" | "part_of";
  weight: number; // 0..1
};
```

## Source

```ts
type Source = {
  id: string;
  title: string;
  url?: string;
  sourceType: "paper" | "article" | "github" | "video" | "docs" | "announcement";
  publisher?: string;
  publishedAt?: string;
  credibility: number; // 0..1
};
```

## Claim

```ts
type Claim = {
  id: string;
  text: string;
  confidence: number;
  sourceIds: string[];
  conceptIds: string[];
  stance?: "supports" | "challenges" | "neutral";
};
```

## Development

```ts
type Development = {
  id: string;
  title: string;
  summaryBullets: string[];
  happenedAt: string;
  significance: number;
  novelty: number;
  credibility: number;
  momentum: number;
  conceptIds: string[];
  claimIds: string[];
  sourceIds: string[];
  storylineIds: string[];
};
```

## KnowledgeState

```ts
type KnowledgeState = {
  userId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  uncertainty: number;
  evidenceCount: number;
  lastObservedAt: string;
  misconceptionFlags: string[];
};
```

## KnowledgeObservation

```ts
type KnowledgeObservation = {
  id: string;
  userId: string;
  conceptId: string;
  kind:
    | "viewed"
    | "saved"
    | "already_knew"
    | "got_it"
    | "diagnostic_correct"
    | "diagnostic_partial"
    | "diagnostic_incorrect"
    | "explained"
    | "revisited"
    | "asked_followup"
    | "misconception_detected";
  weight: number;
  correctness?: number; // 0..1
  sourceRef?: string;
  createdAt: string;
};
```

## KnowledgeStateTransition

```ts
type KnowledgeStateTransition = {
  id: string;
  userId: string;
  conceptId: string;
  before: KnowledgeState;
  observation: KnowledgeObservation;
  after: KnowledgeState;
  reason: string;
  propagatedChanges: Array<{
    conceptId: string;
    deltaMastery: number;
    deltaUncertainty: number;
    reason: string;
  }>;
  createdAt: string;
};
```

## DeltaExplanation

```ts
type DeltaExplanation = {
  developmentId: string;
  userId: string;
  whatHappened: string[];
  whyItMattersToYou: string;
  alreadyKnew: string[];
  whatChanged: string[];
  mentalModelChange: string;
  affectedConcepts: Array<{
    conceptId: string;
    reason: string;
  }>;
};
```

## DiagnosticQuestion

```ts
type DiagnosticQuestion = {
  id: string;
  conceptId: string;
  prompt: string;
  type: "multiple_choice" | "short_answer";
  choices?: string[];
  expectedConcepts: string[];
  rationale: string;
  selectionDebug?: {
    uncertainty: number;
    importance: number;
    interest: number;
    freshness: number;
    prerequisiteCentrality: number;
    priority: number;
  };
};
```

## DiagnosticAnswer

```ts
type DiagnosticAnswer = {
  questionId: string;
  userId: string;
  answer: string;
  correctness: number; // 0..1
  feedback: string;
};
```

## DailyBrief

```ts
type DailyBrief = {
  date: string;
  meaningfulCount: number;
  majorCount: number;
  estimatedMinutes: number;
  skippedCount?: number;
  skippedBreakdown?: Record<string, number>;
  heroDevelopmentId: string;
  developmentIds: string[];
};
```

## DiagramSpec

```ts
type DiagramSpec = {
  title: string;
  teachingGoal: string;
  nodes: Array<{
    id: string;
    label: string;
    group?: "before" | "after" | "shared";
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
  caption: string;
};
```

## MemoryAid

```ts
type MemoryAid = {
  conceptId: string;
  analogy: string;
  memoryHook: string;
  threeStepModel: [string, string, string];
  recallQuestion: string;
  optionalDiagram?: DiagramSpec;
};
```
