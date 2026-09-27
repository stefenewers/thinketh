// Playground: two Minds in one learning space. Additive contracts shared by
// mobile and backend. The server is the source of truth for every room.
import { z } from "zod";
import { ConceptEdgeSchema, KnowledgeStateTransitionSchema } from "./domain.ts";
import { KnowledgeLevelSchema, TeachDeltaResponseSchema } from "./api.ts";

// ---------------------------------------------------------------------------
// MindSnapshot: what a participant shares by joining a room. Knowledge state
// only: never Ask history, memories, misconception descriptions or sources.

export const MindSnapshotConceptSchema = z.object({
  conceptId: z.string(),
  name: z.string(),
  /** Compact on-canvas label ("MCP", "Tool Use"). */
  short: z.string(),
  /** How central the concept is in the field (layout only). */
  importance: z.number(),
  level: KnowledgeLevelSchema,
  mastery: z.number(),
  uncertainty: z.number(),
  evidenceCount: z.number(),
  /** Backed by a diagnostic answer (not just reading or self-report). */
  verified: z.boolean(),
  /** A misconception is flagged (which one stays private). */
  hasMisconception: z.boolean(),
  lastObservedAt: z.string(),
});
export type MindSnapshotConcept = z.infer<typeof MindSnapshotConceptSchema>;

export const MindSnapshotSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  takenAt: z.string(),
  concepts: z.array(MindSnapshotConceptSchema),
  edges: z.array(ConceptEdgeSchema),
  /** What this snapshot deliberately leaves out, shown in the share consent. */
  excludes: z.array(z.string()),
});
export type MindSnapshot = z.infer<typeof MindSnapshotSchema>;

// ---------------------------------------------------------------------------
// Collaborative delta: computed, deterministic, explainable.

export const DeltaSideSchema = z.object({
  mastery: z.number(),
  uncertainty: z.number(),
  evidenceCount: z.number(),
  verified: z.boolean(),
  level: KnowledgeLevelSchema,
});
export type DeltaSide = z.infer<typeof DeltaSideSchema>;

export const CollaborativeDeltaItemSchema = z.object({
  kind: z.enum(["teach", "shared_strength", "shared_gap", "conflict"]),
  conceptId: z.string(),
  conceptName: z.string(),
  /** For "teach": who teaches whom. */
  teacherId: z.string().optional(),
  learnerId: z.string().optional(),
  /** One sentence a person can check against the numbers below. */
  reason: z.string(),
  /** The rule that produced this item. */
  rule: z.string(),
  score: z.number(),
  a: DeltaSideSchema,
  b: DeltaSideSchema,
});
export type CollaborativeDeltaItem = z.infer<typeof CollaborativeDeltaItemSchema>;

export const CollaborativeDeltaSchema = z.object({
  aId: z.string(),
  bId: z.string(),
  aTeachesB: z.array(CollaborativeDeltaItemSchema),
  bTeachesA: z.array(CollaborativeDeltaItemSchema),
  sharedStrengths: z.array(CollaborativeDeltaItemSchema),
  sharedGaps: z.array(CollaborativeDeltaItemSchema),
  /** Ambiguous evidence: we say so rather than pick a teacher. */
  conflicts: z.array(CollaborativeDeltaItemSchema),
  /** The thresholds in force, for "why". */
  rules: z.array(z.string()),
});
export type CollaborativeDelta = z.infer<typeof CollaborativeDeltaSchema>;

// ---------------------------------------------------------------------------
// Rooms

export const LearningSceneSchema = z.enum([
  "waiting",
  "arrival",
  "comparing",
  "overview",
  // @deprecated guided session removed (2026-09-27): kept so stored rooms still parse; the server shows them as "overview".
  "peer_teaching",
  "transfer",
  "knowledge_moved",
  "shared_gap",
  "resource",
  "agent_exchange",
  "ended",
]);
export type LearningScene = z.infer<typeof LearningSceneSchema>;

export const RoomParticipantSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  role: z.enum(["host", "guest"]),
  joinedAt: z.string(),
  /** A seeded demo persona the host device can act for (one-device mode). */
  demoPersona: z.boolean(),
  /**
   * What this person lets their agent use beyond the knowledge snapshot. Off unless they turn it
   * on: saved sources means the titles, links and summaries of sources they saved on the topic being taught.
   */
  shares: z.object({ savedSources: z.boolean() }).optional(),
});
export type RoomParticipant = z.infer<typeof RoomParticipantSchema>;

/** @deprecated guided session removed (2026-09-27): the room conductor no longer exists. */
export const MuseToolSchema = z.enum([
  "get_room_state",
  "spotlight_scene",
  "assign_peer_teacher",
  "request_explanation",
  "ask_transfer_question",
  "teach_shared_gap",
  "introduce_resource",
  "advance_scene",
  "end_session",
]);
export type MuseTool = z.infer<typeof MuseToolSchema>;

/** @deprecated guided session removed (2026-09-27). */
export const MuseActionSchema = z.object({
  tool: MuseToolSchema,
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** What the conductor said to the room. */
  say: z.string().optional(),
  /** Who decided: the live Muse conductor or the deterministic fallback. */
  by: z.enum(["muse", "fallback"]),
});
export type MuseAction = z.infer<typeof MuseActionSchema>;

export const RoomEventTypeSchema = z.enum([
  "room_created",
  "participant_joined",
  "participant_left",
  "compare_started",
  "delta_ready",
  // @deprecated guided session removed (2026-09-27), through "lesson_unavailable": kept so stored rooms still parse.
  "spotlight",
  "teacher_assigned",
  "explanation_submitted",
  "transfer_question",
  "answer_submitted",
  "transfer_verified",
  "transfer_not_verified",
  "shared_gap_taught",
  "resource_introduced",
  "resource_ready",
  "scene_advanced",
  "session_ended",
  "lesson_prepared",
  "lesson_unavailable",
  "sharing_changed",
  "exchange_started",
  "retrieval_started",
  "retrieval_completed",
  "agent_message",
  "clarification_requested",
  "explanation_revised",
  "takeaway_checked",
  "takeaway_saved",
  "exchange_completed",
  "exchange_stopped",
  "exchange_failed",
  "challenge_started",
  "challenge_clarification",
  "challenge_delivered",
  "challenge_response",
  "challenge_checked",
  "challenge_assessed",
  "challenge_resolved",
  "takeaway_revised",
  "challenge_stopped",
  "challenge_failed",
]);
export type RoomEventType = z.infer<typeof RoomEventTypeSchema>;

export const RoomEventSchema = z.object({
  id: z.string(),
  seq: z.number(),
  at: z.string(),
  type: RoomEventTypeSchema,
  /** "muse" (conductor), "thinketh" (evidence engine) or a participant's userId. */
  actor: z.string(),
  summary: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type RoomEvent = z.infer<typeof RoomEventSchema>;

/**
 * An explanation the teacher's agent drafted for the learner's gap. It is agent-prepared material,
 * never presented as something the teacher said, and preparing it changes nobody's knowledge state.
 */
/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const PreparedLessonSchema = z.object({
  /** preparing: the agent is drafting. prepared: a sourced draft is ready. unavailable: nothing grounded could be prepared. */
  status: z.enum(["preparing", "prepared", "unavailable"]),
  /** The participant whose agent prepared it (the teacher). */
  agentOf: z.string(),
  preparedFor: z.string(),
  by: z.enum(["claude", "deterministic"]).optional(),
  text: z.string().optional(),
  /** Each point is backed by at least one listed source. */
  points: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) })).optional(),
  /** The learner's gap it was adapted to, stated from the shared snapshot. */
  adaptedTo: z.string().optional(),
  /** Why this exchange is worth the time. */
  whyRelevant: z.string().optional(),
  sources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().optional(),
        publisher: z.string().optional(),
        publishedAt: z.string().optional(),
        /** corpus: Thinketh's shared world-state corpus. shared_resource: a source the teacher chose to share. */
        via: z.enum(["corpus", "shared_resource"]),
      }),
    )
    .optional(),
  /** What the agent was permitted to use, in plain words. */
  context: z.array(z.string()).optional(),
  /** Why nothing grounded could be prepared (status "unavailable"). */
  message: z.string().optional(),
  preparedAt: z.string(),
});
export type PreparedLesson = z.infer<typeof PreparedLessonSchema>;

/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const RoomTeachingSchema = z.object({
  conceptId: z.string(),
  conceptName: z.string(),
  teacherId: z.string(),
  learnerId: z.string(),
  /** "Why should an evaluator sometimes be separate from the generating model?" */
  prompt: z.string(),
  explanation: z.string().optional(),
  /** Whose words the explanation is: the teacher's own, their agent's draft, or the draft edited by the teacher. */
  explanationSource: z.enum(["own", "agent", "agent_edited"]).optional(),
  /** When the explanation reached the learner (shown to them). Encountering is not understanding. */
  deliveredAt: z.string().optional(),
  /** What the teacher's agent prepared for this exchange. */
  prepared: PreparedLessonSchema.optional(),
});



/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const RoomTransferSchema = z.object({
  conceptId: z.string(),
  learnerId: z.string(),
  questionId: z.string(),
  prompt: z.string(),
  answer: z.string().optional(),
  correctness: z.number().optional(),
  feedback: z.string().optional(),
  /** True only when the evidence engine recorded a correct diagnostic. */
  verified: z.boolean().optional(),
  transition: KnowledgeStateTransitionSchema.optional(),
  /**
   * Where the challenge came from. The rubric never leaves the server; the learner sees the prompt,
   * and the answer is graded against the exact stored item this prompt came from.
   */
  source: z.enum(["seeded", "generated", "fallback"]).optional(),
  /** The new context the learner applies the concept to ("an autonomous coding agent"). */
  applicationContext: z.string().optional(),
  /** Why this tests application rather than recall. */
  rationale: z.string().optional(),
});

/** A peer teaching that has finished (answered), kept so a session can hold several. */
/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const RoomCompletedTeachingSchema = z.object({
  conceptId: z.string(),
  conceptName: z.string(),
  teacherId: z.string(),
  learnerId: z.string(),
  verified: z.boolean(),
});

/**
 * Session plan: Thinketh's deterministic choice of the most valuable valid learning moves that fit
 * the time budget. Muse conducts it; it cannot replace it. Durations are planning estimates.
 */
/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const SessionPlanItemSchema = z.object({
  id: z.string(),
  type: z.enum(["peer_teach", "shared_gap", "resource"]),
  conceptId: z.string().optional(),
  conceptName: z.string().optional(),
  teacherId: z.string().optional(),
  learnerId: z.string().optional(),
  estimatedMinutes: z.number(),
  /** One human sentence, from the evidence ("Nadani has strong verified evidence here…"). */
  rationale: z.string(),
  /** 1 = first. */
  priority: z.number(),
  /** Only when understanding was verified (a peer teaching) or the move itself happened (gap, source). */
  done: z.boolean(),
  /** Tried, but the learner's answer didn't verify it: not complete, and not offered again this session. */
  attempted: z.boolean().optional(),
});
export type SessionPlanItem = z.infer<typeof SessionPlanItemSchema>;

/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const SessionPlanSchema = z.object({
  budgetMinutes: z.number(),
  estimatedMinutes: z.number(),
  items: z.array(SessionPlanItemSchema),
});
export type SessionPlan = z.infer<typeof SessionPlanSchema>;

/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const RoomResourceSideSchema = z.object({
  userId: z.string(),
  resourceId: z.string(),
  status: z.enum(["processing", "ready", "failed", "learned"]),
  /** The step actually running (reading, mapping, comparing, done). */
  stage: z.enum(["reading", "mapping", "comparing", "done"]).optional(),
  usefulMinutes: z.number().optional(),
  newIdeas: z.number(),
  /** The new idea most worth this person's time. */
  focus: z.string().optional(),
  skip: z.string().optional(),
});
export type RoomResourceSide = z.infer<typeof RoomResourceSideSchema>;

/** @deprecated guided session removed (2026-09-27): kept so stored rooms still parse. */
export const RoomResourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  publisher: z.string().optional(),
  sourceLabel: z.string().optional(),
  readMinutes: z.number().optional(),
  sides: z.array(RoomResourceSideSchema),
  /** The conductor's personalized plan, once both deltas are known. */
  note: z.string().optional(),
  /** Why this source is in the room, stated truthfully (a measured default, or someone's own link). */
  chosenBecause: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Agent exchange: two participants' agents (separate contexts) retrieve permitted material, teach,
// question, revise and retain a sourced takeaway. Everything here is agent activity: none of it is
// evidence of a person's understanding.

export const ExchangeSourceSchema = z.object({
  /** Handle agents cite ("S1"). */
  ref: z.string(),
  sourceId: z.string(),
  title: z.string(),
  url: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
  /** corpus: Thinketh's source corpus. shared_resource: a source a participant chose to share. agent_takeaway: an agent's earlier saved takeaway. */
  via: z.enum(["corpus", "shared_resource", "agent_takeaway"]),
  /** What was actually read: an extracted claim, a saved summary, or an agent takeaway. Never the full source. */
  kind: z.enum(["claim", "summary", "takeaway"]),
  text: z.string(),
  /** Whose agent retrieved it. */
  retrievedBy: z.string(),
});
export type ExchangeSource = z.infer<typeof ExchangeSourceSchema>;

export const ExchangeMessageSchema = z.object({
  id: z.string(),
  at: z.string(),
  /** The participant whose agent sent it. */
  from: z.string(),
  to: z.string(),
  kind: z.enum(["explanation", "answer", "revision", "clarification", "evidence_request", "application", "takeaway"]),
  text: z.string(),
  sourceRefs: z.array(z.string()),
});
export type ExchangeMessage = z.infer<typeof ExchangeMessageSchema>;

/** A concise, visible record of what was done (never model reasoning). */
export const ExchangeActionSchema = z.object({
  id: z.string(),
  at: z.string(),
  /** "coordinator", or the participant whose agent acted. */
  actor: z.string(),
  summary: z.string(),
  /** Who did it: Muse, the deterministic planner, Thinketh's code, or Claude (grounding check). */
  by: z.enum(["muse", "planner", "thinketh", "claude", "deterministic", "grok"]),
});
export type ExchangeAction = z.infer<typeof ExchangeActionSchema>;

export const TakeawayCheckSchema = z.object({
  verdict: z.enum(["supported", "partial", "unsupported"]),
  supported: z.array(z.string()),
  unsupported: z.array(z.string()),
  note: z.string(),
  checkedBy: z.enum(["claude", "deterministic"]),
  at: z.string(),
});
export type TakeawayCheck = z.infer<typeof TakeawayCheckSchema>;

export const AgentExchangeSchema = z.object({
  id: z.string(),
  status: z.enum(["running", "completed", "insufficient", "stopped", "failed", "interrupted"]),
  /** teach: one side has defensible evidence to teach. explore: neither does; both agents explore available sources. */
  mode: z.enum(["teach", "explore"]),
  conceptId: z.string(),
  conceptName: z.string(),
  teacherId: z.string(),
  learnerId: z.string(),
  /** Why this direction, from the shared evidence. */
  reason: z.string(),
  startedBy: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  /** Increments once per applied step; a client advances "step N" and a stale N is ignored. */
  step: z.number(),
  /** The work actually in flight (only while it is). */
  pending: z.object({ actor: z.string(), label: z.string() }).optional(),
  budgets: z.object({ maxMessages: z.number(), maxToolCalls: z.number(), deadlineAt: z.string() }),
  used: z.object({ messages: z.number(), toolCalls: z.number(), modelCalls: z.number() }),
  messages: z.array(ExchangeMessageSchema),
  actions: z.array(ExchangeActionSchema),
  sources: z.array(ExchangeSourceSchema),
  takeaway: z.object({ text: z.string(), sourceRefs: z.array(z.string()), unresolved: z.array(z.string()) }).optional(),
  check: TakeawayCheckSchema.optional(),
  savedTakeawayId: z.string().optional(),
  /** One honest sentence on how it ended. */
  outcome: z.string().optional(),
  /** @deprecated the post-exchange "apply it yourself" check was removed (2026-09-27); always 0 for new exchanges, kept so stored ones parse. */
  humanChecks: z.number(),
});
export type AgentExchange = z.infer<typeof AgentExchangeSchema>;

export const ExchangeAvailabilitySchema = z.object({
  available: z.boolean(),
  /** Why not (no participant, no eligible topic, Muse not configured, one already running). */
  reason: z.string().optional(),
  mode: z.enum(["teach", "explore"]).optional(),
  conceptId: z.string().optional(),
  conceptName: z.string().optional(),
  teacherId: z.string().optional(),
  learnerId: z.string().optional(),
});
export type ExchangeAvailability = z.infer<typeof ExchangeAvailabilitySchema>;

// ---------------------------------------------------------------------------
// Takeaway challenge: an optional visiting challenger (Grokbot, on xAI) examines a saved takeaway and
// its permitted material and raises one challenge, or reports that it found no clear issue. The agent
// that wrote the takeaway defends, qualifies or revises it; Thinketh checks the result against the cited
// material and settles an outcome. Agent activity only: nothing here is evidence of a person's
// understanding, and "no clear issue found" is not proof that a takeaway is correct.

export const ChallengeFindingSchema = z.object({
  /** objection / qualification / counterexample: a challenge. insufficient_evidence: can't assess it from this material. no_issue: nothing clear to challenge. */
  kind: z.enum(["objection", "qualification", "counterexample", "insufficient_evidence", "no_issue"]),
  /** One short line (the speech bubble). */
  say: z.string(),
  /** The challenge itself, as delivered to the defending agent. */
  detail: z.string(),
  /** The takeaway statement it targets, when it targets one. */
  targetStatement: z.string().optional(),
  sourceRefs: z.array(z.string()),
});
export type ChallengeFinding = z.infer<typeof ChallengeFindingSchema>;

export const ChallengeMessageSchema = z.object({
  id: z.string(),
  at: z.string(),
  /** "grokbot", or the participant whose agent spoke. */
  from: z.string(),
  kind: z.enum(["clarification", "clarification_answer", "challenge", "no_issue", "insufficient_evidence", "defense", "revision", "concession", "assessment"]),
  text: z.string(),
  sourceRefs: z.array(z.string()),
});
export type ChallengeMessage = z.infer<typeof ChallengeMessageSchema>;

export const ChallengeCheckSchema = z.object({
  /** What was checked against its cited material: the challenge, a proposed revision, or the takeaway as defended. */
  of: z.enum(["challenge", "revision", "takeaway"]),
  verdict: z.enum(["supported", "partial", "unsupported"]),
  supported: z.array(z.string()),
  unsupported: z.array(z.string()),
  /** Passages it was checked against. */
  refs: z.array(z.string()),
  checkedBy: z.enum(["claude", "deterministic"]),
  at: z.string(),
});
export type ChallengeCheck = z.infer<typeof ChallengeCheckSchema>;

export const ChallengeOutcomeSchema = z.object({
  /** revised: a supported revision was saved. supported: the takeaway stands on its cited material. unresolved: kept, with the open challenge recorded. no_issue: Grokbot found no clear issue (not proof of correctness). */
  state: z.enum(["revised", "supported", "unresolved", "no_issue"]),
  headline: z.string(),
  /** Why, in plain words, from the recorded checks. */
  why: z.string(),
  fromVersion: z.number(),
  /** Set only when a revision was actually persisted. */
  toVersion: z.number().optional(),
  revisedText: z.string().optional(),
  /** A revision the defending agent offered that was NOT applied, and why. */
  declinedRevision: z.object({ text: z.string(), reason: z.string() }).optional(),
});
export type ChallengeOutcome = z.infer<typeof ChallengeOutcomeSchema>;

export const TakeawayChallengeSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  exchangeId: z.string(),
  takeawayId: z.string(),
  /** The takeaway version this challenge is bound to; a result for any other version is rejected as stale. */
  takeawayVersion: z.number(),
  /** The takeaway as it was when challenged. */
  takeawayText: z.string(),
  conceptId: z.string(),
  conceptName: z.string(),
  /** The participant whose agent wrote the takeaway and answers the challenge. */
  defenderId: z.string(),
  requestedBy: z.string(),
  status: z.enum(["running", "completed", "stopped", "timed_out", "unavailable", "failed", "stale", "interrupted"]),
  phase: z.enum(["examining", "clarifying", "defending", "checking", "repairing", "assessing", "settling", "done"]),
  /** Increments once per applied step; a stale step is ignored. */
  step: z.number(),
  /** The work actually in flight (only while it is): actor "grokbot", "agent:<userId>" or "thinketh". */
  pending: z.object({ actor: z.string(), label: z.string() }).optional(),
  startedAt: z.string(),
  deadlineAt: z.string(),
  finishedAt: z.string().optional(),
  /** The challenger as it actually ran: the model id xAI reported, once a live call has returned. */
  challenger: z.object({ name: z.string(), provider: z.literal("xai"), configuredModel: z.string(), model: z.string().optional() }),
  finding: ChallengeFindingSchema.optional(),
  messages: z.array(ChallengeMessageSchema),
  sources: z.array(ExchangeSourceSchema),
  checks: z.array(ChallengeCheckSchema),
  assessment: z.object({ stance: z.enum(["satisfied", "maintains", "cannot_tell"]), text: z.string(), sourceRefs: z.array(z.string()) }).optional(),
  actions: z.array(ExchangeActionSchema),
  used: z.object({ grokCalls: z.number(), grokMs: z.number(), agentCalls: z.number(), toolCalls: z.number(), repairs: z.number() }),
  budgets: z.object({ maxToolCalls: z.number() }),
  outcome: ChallengeOutcomeSchema.optional(),
  /** How it ended when it didn't complete (stopped, timed out, unavailable, stale). */
  note: z.string().optional(),
});
export type TakeawayChallenge = z.infer<typeof TakeawayChallengeSchema>;

export const ChallengeAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  takeawayId: z.string().optional(),
  takeawayVersion: z.number().optional(),
});
export type ChallengeAvailability = z.infer<typeof ChallengeAvailabilitySchema>;

export const TakeawayVersionSchema = z.object({
  version: z.number(),
  text: z.string(),
  at: z.string(),
  by: z.enum(["exchange", "challenge"]),
  challengeId: z.string().optional(),
  reason: z.string().optional(),
});
export type TakeawayVersion = z.infer<typeof TakeawayVersionSchema>;

/** A takeaway an agent retained: agent-acquired material in its owner's library, not verified understanding. */
export const AgentTakeawaySchema = z.object({
  id: z.string(),
  /** The person whose agent retained it. */
  ownerId: z.string(),
  /** The participant whose agent taught it. */
  fromId: z.string(),
  fromName: z.string(),
  conceptId: z.string(),
  conceptName: z.string(),
  exchangeId: z.string(),
  roomId: z.string(),
  text: z.string(),
  sources: z.array(ExchangeSourceSchema.omit({ retrievedBy: true })),
  grounding: z.enum(["supported", "partial"]),
  unresolved: z.array(z.string()),
  checkedBy: z.enum(["claude", "deterministic"]),
  transcript: z.array(z.object({ from: z.string(), name: z.string(), kind: ExchangeMessageSchema.shape.kind, text: z.string(), sourceRefs: z.array(z.string()) })),
  createdAt: z.string(),
  /** Absent means 1. Bumped only when a checked revision is persisted. */
  version: z.number().optional(),
  /** Every version, oldest first (present once the takeaway has been revised). */
  history: z.array(TakeawayVersionSchema).optional(),
  /** Challenges that settled on this takeaway, oldest first. */
  challenges: z.array(TakeawayChallengeSchema).optional(),
});
export type AgentTakeaway = z.infer<typeof AgentTakeawaySchema>;
export const AgentTakeawayListResponseSchema = z.object({ takeaways: z.array(AgentTakeawaySchema) });


export const PlaygroundRoomSchema = z.object({
  id: z.string(),
  code: z.string(),
  createdAt: z.string(),
  hostId: z.string(),
  participants: z.array(RoomParticipantSchema),
  scene: LearningSceneSchema,
  spotlight: z.object({ conceptId: z.string().optional(), participantId: z.string().optional() }).nullable(),
  snapshots: z.array(MindSnapshotSchema),
  delta: CollaborativeDeltaSchema.optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  teaching: RoomTeachingSchema.optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  transfer: RoomTransferSchema.optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  completedTeachings: z.array(RoomCompletedTeachingSchema).optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  plan: SessionPlanSchema.optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  sharedGap: z.object({ conceptId: z.string(), conceptName: z.string(), lesson: TeachDeltaResponseSchema.shape.sections.optional() }).optional(),
  /** @deprecated guided session removed (2026-09-27): never written now; kept so stored rooms still parse. */
  resource: RoomResourceSchema.optional(),
  /** The current (or last) agent exchange in this room. */
  exchange: AgentExchangeSchema.optional(),
  /** Whether "Let our agents exchange" can start now, and on what. */
  exchangeAvailability: ExchangeAvailabilitySchema.optional(),
  /** The current (or last) challenge of this room's saved takeaway. */
  challenge: TakeawayChallengeSchema.optional(),
  /** Whether "Challenge this idea" can start now (absent when no challenger is configured). */
  challengeAvailability: ChallengeAvailabilitySchema.optional(),
  /** @deprecated guided session removed (2026-09-27): the conductor's last line; never written now. */
  museLine: z.string().optional(),
  /** @deprecated guided session removed (2026-09-27): the server no longer sends it (optional so older payloads still parse). */
  conductor: z.object({ mode: z.enum(["muse", "fallback"]), detail: z.string() }).optional(),
  realtime: z.object({
    channel: z.string(),
    mode: z.enum(["broadcast", "polling"]),
    /** Supabase Realtime endpoint + public anon key (RLS-protected; the channel carries only {seq, type}). */
    url: z.string().optional(),
    key: z.string().optional(),
  }),
  seq: z.number(),
  events: z.array(RoomEventSchema),
});
export type PlaygroundRoom = z.infer<typeof PlaygroundRoomSchema>;

// Requests
export const CreateRoomRequestSchema = z.object({ displayName: z.string().trim().min(1).max(40) });
export const JoinRoomRequestSchema = z.object({ code: z.string().trim().min(4).max(12), displayName: z.string().trim().min(1).max(40) });
export const RoomShareRequestSchema = z.object({ savedSources: z.boolean(), asUserId: z.string().max(64).optional() });




export const StartExchangeRequestSchema = z.object({ conceptId: z.string().max(120).optional() });
export const AdvanceExchangeRequestSchema = z.object({ step: z.number().int().min(0) });
export const AdvanceChallengeRequestSchema = z.object({ step: z.number().int().min(0) });
