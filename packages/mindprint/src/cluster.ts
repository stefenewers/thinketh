// Semantic clusters from the real relationship structure (weighted edges),
// via deterministic greedy modularity. No randomness: ties break by id.

export type ClusterEdge = { from: string; to: string; weight: number };

export function modularityClusters(ids: string[], edges: ClusterEdge[]): string[][] {
  const nodes = [...ids].sort();
  const w = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  let m2 = 0;
  const deg = new Map(nodes.map((n) => [n, 0]));
  for (const e of edges) {
    if (!deg.has(e.from) || !deg.has(e.to) || e.from === e.to) continue;
    w.set(key(e.from, e.to), (w.get(key(e.from, e.to)) ?? 0) + e.weight);
    deg.set(e.from, deg.get(e.from)! + e.weight);
    deg.set(e.to, deg.get(e.to)! + e.weight);
    m2 += 2 * e.weight;
  }
  if (m2 === 0) return nodes.map((n) => [n]);

  // community -> members; community degree; weight between communities
  let comms = nodes.map((n) => [n]);
  const commDeg = (c: string[]) => c.reduce((s, n) => s + deg.get(n)!, 0);
  const between = (a: string[], b: string[]) => {
    let s = 0;
    for (const x of a) for (const y of b) s += w.get(key(x, y)) ?? 0;
    return s;
  };

  for (;;) {
    let best = 0;
    let pick: [number, number] | null = null;
    for (let i = 0; i < comms.length; i++) {
      for (let j = i + 1; j < comms.length; j++) {
        const eij = between(comms[i]!, comms[j]!);
        if (eij === 0) continue;
        // ΔQ for merging i and j
        const dq = (2 * eij) / m2 - (2 * commDeg(comms[i]!) * commDeg(comms[j]!)) / (m2 * m2);
        if (dq > best + 1e-12) {
          best = dq;
          pick = [i, j];
        }
      }
    }
    if (!pick) break;
    const [i, j] = pick;
    const merged = [...comms[i]!, ...comms[j]!].sort();
    comms = comms.filter((_, k) => k !== i && k !== j).concat([merged]);
    comms.sort((a, b) => a[0]!.localeCompare(b[0]!));
  }
  return comms.map((c) => [...c].sort());
}
