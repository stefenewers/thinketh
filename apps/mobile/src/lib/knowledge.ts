import type { Development, KnowledgeItem, KnowledgeLevel, KnowledgeObservation, KnowledgeStateTransition } from "@thinketh/contracts";

// Mirrors knowledgeLevel() in packages/intelligence/src/engine/knowledgeState.ts.
// Prefer the server's `level` when a response carries one.
export function levelOf(mastery: number): KnowledgeLevel {
  if (mastery >= 0.75) return "strong";
  if (mastery >= 0.55) return "intermediate";
  if (mastery >= 0.4) return "developing";
  return "weak";
}

export const levelLabel: Record<KnowledgeLevel, string> = {
  strong: "Strong",
  intermediate: "Intermediate",
  developing: "Developing",
  weak: "Weak",
};

// Qualitative language for the numeric model, so no score is shown without meaning.
export const masteryLabel = (mastery: number) => levelLabel[levelOf(mastery)];

export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// The backend records knock-on effects on related concepts as their own
// transitions, tagged sourceRef "propagated:<id>".
const isPropagated = (t: KnowledgeStateTransition) => t.observation.sourceRef?.startsWith("propagated:") ?? false;

// Direct (not propagated) transitions from today, newest first.
export function todaysTransitions(items: KnowledgeItem[]): KnowledgeStateTransition[] {
  const seen = new Set<string>();
  return items
    .map((i) => i.lastTransition)
    .filter((t): t is KnowledgeStateTransition => !!t && isToday(t.createdAt) && !isPropagated(t))
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// A change worth calling out: tiny passive-reading nudges don't count.
export const improved = (t: KnowledgeStateTransition) => t.after.mastery - t.before.mastery >= 0.01;

export function improvedTodayIds(items: KnowledgeItem[]) {
  return new Set(todaysTransitions(items).filter(improved).map((t) => t.conceptId));
}

// A development counts as understood once its primary concept was verified by a diagnostic today.
export function understoodDevelopmentIds(developments: Development[], items: KnowledgeItem[]) {
  const verified = new Set(
    todaysTransitions(items)
      .filter((t) => t.observation.kind === "diagnostic_correct")
      .map((t) => t.conceptId),
  );
  return new Set(developments.filter((d) => d.conceptIds[0] && verified.has(d.conceptIds[0])).map((d) => d.id));
}

const SKIP_LABELS: Record<string, string> = {
  duplicate: "Duplicates",
  low_signal: "Low signal",
  already_understood: "Already understood",
  minor_update: "Minor updates",
  low_confidence: "Low-confidence claims",
  outdated: "Outdated",
  undated: "Undated",
  over_budget: "Deferred to the next run",
};

export function skipLabel(key: string) {
  return SKIP_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function evidenceLabel(uncertainty: number) {
  if (uncertainty <= 0.2) return "Well evidenced";
  if (uncertainty <= 0.35) return "Some evidence";
  return "Little evidence";
}

export const isMajor = (d: Pick<Development, "significance">) => d.significance >= 0.75;

export function significanceLabel(d: Pick<Development, "significance">) {
  if (d.significance >= 0.75) return "Major development";
  if (d.significance >= 0.6) return "Notable";
  return "Emerging";
}

export const observationLabel: Record<KnowledgeObservation["kind"], string> = {
  viewed: "Read",
  saved: "Saved",
  already_knew: "Said already knew",
  got_it: "Marked got it",
  diagnostic_correct: "Answered correctly",
  diagnostic_partial: "Partly correct",
  diagnostic_incorrect: "Answered incorrectly",
  explained: "Explained it",
  revisited: "Revisited",
  asked_followup: "Asked a follow-up",
  misconception_detected: "Misconception flagged",
};

export const fmt2 = (n: number) => n.toFixed(2);

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(isoDate: string) {
  // isoDate is YYYY-MM-DD; parse as local date.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Misconception flags arrive as slugs ("memory-equals-context-window"); show them as a phrase. */
export function misconceptionLabel(flag: string) {
  if (!/^[a-z0-9-]+$/.test(flag)) return flag;
  return flag.replace(/-equals-/g, " = ").replace(/-/g, " ");
}
