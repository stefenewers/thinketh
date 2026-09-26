import type { Development, KnowledgeObservation } from "@thinketh/contracts";

// Qualitative language for the numeric model, so no score is shown without meaning.
export function masteryLabel(mastery: number) {
  if (mastery >= 0.7) return "Strong";
  if (mastery >= 0.5) return "Intermediate";
  if (mastery >= 0.3) return "Developing";
  return "Weak";
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
