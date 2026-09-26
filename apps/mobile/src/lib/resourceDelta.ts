// "Same source. Different delta." is a claim, so it must be true: only when both personal deltas are
// computed and actually differ (useful minutes, new ideas, or focus). Pure, so it can be tested.

export type DeltaSide = { status: "processing" | "ready" | "failed" | "learned"; newIdeas: number; usefulMinutes?: number | undefined; focus?: string | undefined };

export function deltaClaim(sides: DeltaSide[]): "reading" | "different" | "similar" {
  if (sides.some((s) => s.status === "processing")) return "reading";
  const done = sides.filter((s) => s.status === "ready" || s.status === "learned");
  if (done.length < 2) return "similar";
  const key = (s: DeltaSide) => `${s.newIdeas}|${Math.round(s.usefulMinutes ?? 0)}|${(s.focus ?? "").toLowerCase()}`;
  return new Set(done.map(key)).size > 1 ? "different" : "similar";
}
