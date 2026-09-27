import { useCallback, useEffect, useState } from "react";
import { normalizeVisualization, visualizationFromDelta, type VisualizationSpec } from "@thinketh/contracts";
import { api } from "@/api";
import { currentUserId } from "@/lib/session";

// Keep plans for the session so reopening "Visualize this" is instant. Plans are framed by the
// learner's delta, so they're kept per identity: switching accounts never shows another's plan.
const plans = new Map<string, VisualizationSpec>();
const planKey = (developmentId: string) => `${currentUserId() ?? "anon"}:${developmentId}`;

/** After a knowledge change (feedback, a diagnostic, a reset): plans are framed by levels, so plan again. */
export function forgetVisualizations(): void {
  plans.clear();
}

type Result = { key: string; spec: VisualizationSpec | null; failed: boolean };

/**
 * The plan for a development. If the planner can't answer, draw the development's own delta
 * (what you knew -> what changed) instead, so the sheet never dead-ends on an error.
 */
export function useVisualization(developmentId: string | undefined) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${developmentId}:${nonce}`;
  const cached = developmentId ? plans.get(planKey(developmentId)) : undefined;

  useEffect(() => {
    if (!developmentId || plans.has(planKey(developmentId))) return;
    let live = true;
    (async () => {
      try {
        const spec = normalizeVisualization(await api.visualize({ developmentId }));
        plans.set(planKey(developmentId), spec);
        if (live) setResult({ key, spec, failed: false });
      } catch {
        try {
          const { development, delta } = await api.getDevelopment(developmentId);
          if (live) setResult({ key, spec: visualizationFromDelta(delta, development.title), failed: false });
        } catch {
          if (live) setResult({ key, spec: null, failed: true });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [developmentId, key]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  if (cached) return { spec: cached, loading: false, failed: false, retry };
  const current = result?.key === key ? result : null;
  return { spec: current?.spec ?? null, loading: !current, failed: !!current?.failed, retry };
}
