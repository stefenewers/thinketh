/**
 * Collaborative delta: what two Minds can usefully exchange.
 *
 * Pure and deterministic. Every item carries the rule that produced it and
 * both sides' numbers, so "why is Nadani teaching this?" is always answerable.
 * Conservative by design: when the stronger side's evidence is thin or
 * uncertain, the item is a conflict ("we can't tell yet"), never a teaching.
 */
import type { CollaborativeDelta, CollaborativeDeltaItem, DeltaSide, MindSnapshot, MindSnapshotConcept } from "../contracts.ts";

export const COLLAB_RULES = {
  /** A teacher must be at least this strong… */
  teachMastery: 0.7,
  /** …this certain… */
  teachMaxUncertainty: 0.3,
  /** …with at least this much evidence… */
  teachMinEvidence: 3,
  /** …and this far ahead of the learner. */
  teachGap: 0.3,
  /** Both at or above: a shared strength. */
  sharedStrength: 0.7,
  /** Both below: a shared gap nobody in the room can teach. */
  sharedGap: 0.35,
} as const;

export function ruleText(): string[] {
  const r = COLLAB_RULES;
  return [
    `Teach: the teacher has mastery ≥ ${r.teachMastery}, uncertainty ≤ ${r.teachMaxUncertainty}, ≥ ${r.teachMinEvidence} pieces of evidence and no flagged misconception, and is ≥ ${r.teachGap} ahead.`,
    `Conflict: a gap ≥ ${r.teachGap} exists but the stronger side's evidence doesn't meet the teaching bar, so nobody is assigned.`,
    `Shared strength: both ≥ ${r.sharedStrength}.`,
    `Shared gap: both < ${r.sharedGap}; the conductor teaches it to both.`,
  ];
}

const side = (c: MindSnapshotConcept): DeltaSide => ({
  mastery: c.mastery,
  uncertainty: c.uncertainty,
  evidenceCount: c.evidenceCount,
  verified: c.verified,
  level: c.level,
});

const canTeach = (c: MindSnapshotConcept) =>
  c.mastery >= COLLAB_RULES.teachMastery &&
  c.uncertainty <= COLLAB_RULES.teachMaxUncertainty &&
  c.evidenceCount >= COLLAB_RULES.teachMinEvidence &&
  !c.hasMisconception;

/** Which part of the teaching bar the stronger side misses, in words. */
function teachingShortfall(c: MindSnapshotConcept): string {
  const r = COLLAB_RULES;
  const out: string[] = [];
  if (c.mastery < r.teachMastery) out.push("mastery is still below the teaching bar");
  if (c.uncertainty > r.teachMaxUncertainty) out.push("the evidence is still uncertain");
  if (c.evidenceCount < r.teachMinEvidence) out.push(`only ${c.evidenceCount} observation${c.evidenceCount === 1 ? "" : "s"}`);
  if (c.hasMisconception) out.push("a misconception is flagged");
  return out.join(", ");
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function collaborativeDelta(a: MindSnapshot, b: MindSnapshot, importance: Record<string, number> = {}): CollaborativeDelta {
  const bById = new Map(b.concepts.map((c) => [c.conceptId, c]));
  const out: CollaborativeDelta = { aId: a.userId, bId: b.userId, aTeachesB: [], bTeachesA: [], sharedStrengths: [], sharedGaps: [], conflicts: [], rules: ruleText() };

  for (const ca of [...a.concepts].sort((x, y) => x.conceptId.localeCompare(y.conceptId))) {
    const cb = bById.get(ca.conceptId);
    if (!cb) continue;
    const imp = importance[ca.conceptId] ?? 0.5;
    const base = { conceptId: ca.conceptId, conceptName: ca.name, a: side(ca), b: side(cb) };
    const gap = ca.mastery - cb.mastery;
    const [hi, , hiSnap, loSnap] = gap >= 0 ? [ca, cb, a, b] : [cb, ca, b, a];
    const absGap = Math.abs(gap);

    if (absGap >= COLLAB_RULES.teachGap) {
      if (canTeach(hi)) {
        // Verified evidence and certainty make a better teacher; importance makes a better use of time.
        const score = r2(absGap * (1 - hi.uncertainty) * (hi.verified ? 1 : 0.8) * (0.5 + imp));
        const item: CollaborativeDeltaItem = {
          ...base,
          kind: "teach",
          teacherId: hiSnap.userId,
          learnerId: loSnap.userId,
          reason: `${hiSnap.displayName} has stronger ${hi.verified ? "verified " : "recent "}evidence.`,
          rule: "teach",
          score,
        };
        (hiSnap === a ? out.aTeachesB : out.bTeachesA).push(item);
      } else {
        out.conflicts.push({
          ...base,
          kind: "conflict",
          reason: `${hiSnap.displayName} looks ahead, but not enough to teach from yet: ${teachingShortfall(hi)}.`,
          rule: "conflict",
          score: r2(absGap * imp),
        });
      }
      continue;
    }
    if (ca.mastery >= COLLAB_RULES.sharedStrength && cb.mastery >= COLLAB_RULES.sharedStrength) {
      out.sharedStrengths.push({ ...base, kind: "shared_strength", reason: "You both have strong evidence here.", rule: "shared_strength", score: r2((ca.mastery + cb.mastery) / 2) });
      continue;
    }
    if (ca.mastery < COLLAB_RULES.sharedGap && cb.mastery < COLLAB_RULES.sharedGap) {
      out.sharedGaps.push({
        ...base,
        kind: "shared_gap",
        reason: "Neither of you has strong evidence yet.",
        rule: "shared_gap",
        score: r2((1 - Math.max(ca.mastery, cb.mastery)) * (0.5 + imp)),
      });
    }
  }
  const byScore = (x: CollaborativeDeltaItem, y: CollaborativeDeltaItem) => y.score - x.score || x.conceptId.localeCompare(y.conceptId);
  for (const k of ["aTeachesB", "bTeachesA", "sharedStrengths", "sharedGaps", "conflicts"] as const) out[k].sort(byScore);
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
