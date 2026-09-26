/**
 * Backend view of the contracts: re-exports the shared contracts (domain types
 * and canonical API envelopes) plus a few backend-only aliases.
 */
import type { Interest, KnowledgeObservationKind, KnowledgeStateTransition, UserProfile } from "@thinketh/contracts";
import { KnowledgeObservationKindSchema } from "@thinketh/contracts";

export * from "@thinketh/contracts";

export const ObservationKindSchema = KnowledgeObservationKindSchema;
export type ObservationKind = KnowledgeObservationKind;
export type PropagatedChange = KnowledgeStateTransition["propagatedChanges"][number];

/**
 * Server-side persona profile. The shared `Interest` is `{ topic, weight }`;
 * the backend also needs which concepts each interest covers, for diagnostic
 * selection and "why it matters to you".
 */
export type PersonaInterest = Interest & { conceptIds: string[] };
export type PersonaProfile = Omit<UserProfile, "interests"> & { interests: PersonaInterest[] };
