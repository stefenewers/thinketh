/**
 * Daily brief: "No new information = no card."
 *
 * A candidate development is dropped as already_understood when it introduces
 * no new claims, or when it is low-novelty and the user is already strong on
 * every concept it touches. The rest are ranked by personal relevance.
 */
import type { DailyBrief, Development, KnowledgeState, UserProfile } from "@thinketh/contracts";
import type { DevelopmentMeta, IngestionStats } from "../seed/types.ts";
import { round } from "../util.ts";
import { interestFor } from "./selection.ts";

export const MAJOR_SIGNIFICANCE = 0.75;
const ALREADY_KNOWN_MASTERY = 0.8;
const LOW_NOVELTY = 0.2;

export function isAlreadyUnderstood(dev: Development, meta: DevelopmentMeta | undefined, states: Map<string, KnowledgeState>): boolean {
  if (meta && meta.newClaimIds.length === 0) return true;
  return dev.novelty < LOW_NOVELTY && dev.conceptIds.every((id) => (states.get(id)?.mastery ?? 0) >= ALREADY_KNOWN_MASTERY);
}

/** significance × novelty factor × personal gap (0.6 × max + 0.4 × mean over its concepts). */
export function personalRelevance(dev: Development, states: Map<string, KnowledgeState>, profile: UserProfile): number {
  const gaps = dev.conceptIds.map((id) => interestFor(id, profile) * (1 - 0.6 * (states.get(id)?.mastery ?? 0)));
  if (gaps.length === 0) return 0;
  const gap = 0.6 * Math.max(...gaps) + 0.4 * (gaps.reduce((a, b) => a + b, 0) / gaps.length);
  return dev.significance * (0.5 + 0.5 * dev.novelty) * gap;
}

export function buildBrief(input: {
  developments: Development[];
  meta: Record<string, DevelopmentMeta>;
  states: Map<string, KnowledgeState>;
  profile: UserProfile;
  ingestion: IngestionStats;
  now: Date;
  timeZone?: string;
}): { brief: DailyBrief; ordered: Development[] } {
  const kept: Development[] = [];
  let alreadyUnderstood = 0;
  for (const d of input.developments) {
    if (isAlreadyUnderstood(d, input.meta[d.id], input.states)) alreadyUnderstood++;
    else kept.push(d);
  }
  const ordered = kept
    .map((d) => ({ d, score: personalRelevance(d, input.states, input.profile) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.d);

  const skippedBreakdown = { ...input.ingestion.skipped, already_understood: alreadyUnderstood };
  const skippedCount = Object.values(skippedBreakdown).reduce((a, b) => a + b, 0);
  const minutes = ordered.reduce((sum, d) => sum + (input.meta[d.id]?.readMinutes ?? 2), 0);

  return {
    brief: {
      // en-CA formats as YYYY-MM-DD.
      date: new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone ?? "UTC" }).format(input.now),
      meaningfulCount: ordered.length,
      majorCount: ordered.filter((d) => d.significance >= MAJOR_SIGNIFICANCE).length,
      estimatedMinutes: round(minutes, 1),
      skippedCount,
      skippedBreakdown,
      heroDevelopmentId: ordered[0]?.id ?? "",
      developmentIds: ordered.map((d) => d.id),
    },
    ordered,
  };
}
