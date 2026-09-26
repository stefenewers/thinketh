// How the Playground talks about the session plan. The budget is a PLANNING constraint (which
// learning moves are worth doing in the time available), never a countdown. Pure, so it can be tested.

export type PlanLike = { budgetMinutes: number; items: { done?: boolean }[] } | undefined | null;

/** "3 learning moves planned for the next 7 minutes", from the real plan; null when there is no plan. */
export function planSummary(plan: PlanLike): string | null {
  if (!plan || plan.items.length === 0) return null;
  const n = plan.items.length;
  return `${n} learning move${n === 1 ? "" : "s"} planned for the next ${formatMinutes(plan.budgetMinutes, false)}`;
}

/** Planning estimates, shown without fake precision: 2 min, 2½ min, 7 minutes. */
export function formatMinutes(m: number, short = true): string {
  const whole = Math.floor(m);
  const half = m - whole >= 0.25 && m - whole < 0.75;
  const n = half ? `${whole}½` : String(Math.round(m));
  return short ? `${n} min` : `${n} ${n === "1" ? "minute" : "minutes"}`;
}
