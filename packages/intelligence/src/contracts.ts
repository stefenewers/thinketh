/**
 * Backend view of the contracts.
 *
 * Re-exports the shared contracts (`@thinketh/contracts`: the domain types from
 * 05-data-contracts.md plus the canonical HTTP envelopes, which moved there from
 * this file) and adds backend-only types.
 */
import {
  KnowledgeObservationKindSchema,
  type Interest,
  type KnowledgeObservationKind,
  type KnowledgeStateTransition,
  type UserProfile,
} from "@thinketh/contracts";

// Envelopes moved to packages/contracts/src/api.ts; see docs/INTEGRATION-NOTES.md.
export * from "@thinketh/contracts";

// ---------------------------------------------------------------------------
// Aliases and derived types
// ---------------------------------------------------------------------------

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
