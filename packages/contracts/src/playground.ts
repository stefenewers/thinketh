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
  "peer_teaching",
  "transfer",
  "knowledge_moved",
  "shared_gap",
  "resource",
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
});
export type RoomParticipant = z.infer<typeof RoomParticipantSchema>;

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

export const RoomTeachingSchema = z.object({
  conceptId: z.string(),
  conceptName: z.string(),
  teacherId: z.string(),
  learnerId: z.string(),
  /** "Why should an evaluator sometimes be separate from the generating model?" */
  prompt: z.string(),
  explanation: z.string().optional(),
});

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
});

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

export const RoomResourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  publisher: z.string().optional(),
  sourceLabel: z.string().optional(),
  readMinutes: z.number().optional(),
  sides: z.array(RoomResourceSideSchema),
  /** The conductor's personalized plan, once both deltas are known. */
  note: z.string().optional(),
});

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
  teaching: RoomTeachingSchema.optional(),
  transfer: RoomTransferSchema.optional(),
  sharedGap: z.object({ conceptId: z.string(), conceptName: z.string(), lesson: TeachDeltaResponseSchema.shape.sections.optional() }).optional(),
  resource: RoomResourceSchema.optional(),
  /** Last thing the conductor said. */
  museLine: z.string().optional(),
  conductor: z.object({ mode: z.enum(["muse", "fallback"]), detail: z.string() }),
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
export const RoomExplainRequestSchema = z.object({ text: z.string().trim().min(1).max(2000), asUserId: z.string().max(64).optional() });
export const RoomAnswerRequestSchema = z.object({ answer: z.string().trim().min(1).max(2000), asUserId: z.string().max(64).optional() });
export const RoomResourceRequestSchema = z.object({ url: z.string().trim().min(1).max(2048) });
export const RoomConductRequestSchema = z.object({ intent: z.enum(["next", "shared_gap", "resource", "end"]).optional() });



