/**
 * Mindprint layout: a deterministic, semantic composition of a knowledge graph.
 *
 * Pipeline (see docs/PLAYGROUND-PLAN.md):
 *   clusters (from real edges) -> stable cluster anchors -> focal gravity ->
 *   constrained node placement (bounded relaxation, run once, never on screen) ->
 *   label placement (measured boxes, 8 anchors, greedy by priority) ->
 *   edge routing (curves that bend around labels and nodes) -> validation.
 *
 * Same input => same output. Nothing is random.
 */
import { modularityClusters } from "./cluster.ts";
import {
  type Circle,
  circleRectOverlap,
  dist,
  inflate,
  inside,
  measureText,
  overlapArea,
  type Point,
  pointInCircle,
  pointInRect,
  type Rect,
  rectsOverlap,
  sampleQuad,
  segmentsCross,
} from "./geometry.ts";

export type LayoutNode = {
  id: string;
  label: string;
  /** 0..1: how central the concept is (drives size and label priority). */
  importance: number;
  /** Compact on-canvas label ("MCP", "Tool Use"); the full label lives in sheets. */
  short?: string;
  /** Concept id shared across participants (defaults to id). */
  conceptId?: string;
};
export type LayoutEdge = { from: string; to: string; weight: number; type?: string };
export type Lod = "overview" | "normal" | "focus";

export type PlacedNode = LayoutNode & { x: number; y: number; r: number; cluster: number; depth: number; hub: boolean };
export type PlacedLabel = { id: string; text: string; x: number; y: number; w: number; h: number; visible: boolean; anchor: string };
export type RoutedEdge = { from: string; to: string; weight: number; type?: string; a: Point; c: Point; b: Point; primary: boolean; collisions: number };
export type LayoutDiagnostics = {
  nodeOverlaps: number;
  labelOverlaps: number;
  labelNodeOverlaps: number;
  edgeLabelCrossings: number;
  edgeNodeCrossings: number;
  edgeCrossings: number;
  labelsOutOfBounds: number;
  nodesOutOfBounds: number;
  hiddenLabels: number;
};
export type LayoutResult = {
  nodes: PlacedNode[];
  labels: PlacedLabel[];
  edges: RoutedEdge[];
  clusters: string[][];
  bounds: Rect;
  diagnostics: LayoutDiagnostics;
};

export type RegionSpec = { rect: Rect; mirror?: "none" | "y" };
export type LayoutOptions = {
  focusId?: string | null;
  changedIds?: string[];
  /** Labels that must be shown (placed even at a cost). */
  requiredLabels?: string[];
  lod?: Lod;
  fontSize?: number;
  /** UI zones nothing may occupy (sheets, participant names, corridors). */
  reserved?: Rect[];
  /** Minimum clearance between node circles. */
  nodeGap?: number;
};

const LABEL_H = (fs: number) => Math.round(fs * 1.35);

// ---------------------------------------------------------------------------
// Placement within one region

function placeRegion(nodes: LayoutNode[], edges: LayoutEdge[], region: RegionSpec, opts: LayoutOptions): { placed: PlacedNode[]; clusters: string[][] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inEdges = edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .sort((a, b) => (a.from + ">" + a.to).localeCompare(b.from + ">" + b.to));
  const clusters = modularityClusters(
    nodes.map((n) => n.id),
    inEdges,
  );
  const { rect } = region;
  const unit = Math.min(rect.w, rect.h) / 10;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const focus = opts.focusId && byId.has(opts.focusId) ? opts.focusId : null;

  const weightOf = (a: string, b: string) => inEdges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).reduce((s, e) => s + e.weight, 0);
  const degree = (id: string, within?: Set<string>) =>
    inEdges.filter((e) => (e.from === id && (!within || within.has(e.to))) || (e.to === id && (!within || within.has(e.from)))).reduce((s, e) => s + e.weight, 0);
  const clusterScore = (c: string[]) => c.length * 10 + c.reduce((s, id) => s + (byId.get(id)?.importance ?? 0), 0);

  // Primary cluster: the one containing the focus, else the largest.
  const order = [...clusters].sort((a, b) => clusterScore(b) - clusterScore(a) || a[0]!.localeCompare(b[0]!));
  const primaryIdx = focus ? order.findIndex((c) => c.includes(focus)) : 0;
  const primary = order[primaryIdx]!;
  const others = order.filter((_, i) => i !== primaryIdx);
  // Others ordered by how strongly they connect to the primary cluster.
  const link = (c: string[]) => c.reduce((s, a) => s + primary.reduce((t, b) => t + weightOf(a, b), 0), 0);
  others.sort((a, b) => link(b) - link(a) || a[0]!.localeCompare(b[0]!));

  // Anchors: primary slightly off-center toward the strongest neighbor side; others around an ellipse.
  const rx = rect.w * 0.3;
  const ry = rect.h * 0.3;
  const anchors = new Map<string[], Point>();
  anchors.set(primary, { x: cx - (others.length ? rx * 0.18 : 0), y: cy });
  // Deterministic angle slots, strongest neighbor to the right, then alternating.
  const slots = [0, Math.PI * 0.72, -Math.PI * 0.72, Math.PI * 0.36, -Math.PI * 0.36, Math.PI];
  others.forEach((c, i) => {
    const a = slots[i % slots.length]! + Math.floor(i / slots.length) * 0.21;
    anchors.set(c, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  });

  // Nodes: hub at the anchor, members on a ring ordered toward what they connect to.
  const home = new Map<string, Point>();
  const clusterOf = new Map<string, number>();
  const hubs = new Set<string>();
  const clusterList = [primary, ...others];
  clusterList.forEach((c, ci) => {
    const set = new Set(c);
    const anchor = anchors.get(c)!;
    const hub = focus && set.has(focus) ? focus : [...c].sort((a, b) => degree(b, set) - degree(a, set) || (byId.get(b)!.importance - byId.get(a)!.importance) || a.localeCompare(b))[0]!;
    hubs.add(hub);
    for (const id of c) clusterOf.set(id, ci);
    home.set(hub, anchor);
    const members = c.filter((id) => id !== hub);
    // Desired angle: toward the weighted barycenter of each member's links outside the cluster.
    const desired = members.map((id) => {
      let sx = 0, sy = 0, sw = 0;
      for (const e of inEdges) {
        const other = e.from === id ? e.to : e.to === id ? e.from : null;
        if (!other || set.has(other)) continue;
        const oc = clusterList.find((cc) => cc.includes(other));
        const p = oc ? anchors.get(oc)! : { x: cx, y: cy };
        sx += p.x * e.weight; sy += p.y * e.weight; sw += e.weight;
      }
      const target = sw ? { x: sx / sw, y: sy / sw } : { x: cx, y: cy - 1 };
      let ang = Math.atan2(target.y - anchor.y, target.x - anchor.x);
      if (!sw) ang = -Math.PI / 2 + members.indexOf(id) * 0.01;
      return { id, ang };
    });
    desired.sort((a, b) => a.ang - b.ang || a.id.localeCompare(b.id));
    const n = desired.length;
    const ringK = members.length > 4 ? 2.1 : 1.75;
    // Elliptical ring: use the region's real aspect, not its short side.
    const ringRx = (rect.w / 10) * ringK;
    const ringRy = (rect.h / 10) * ringK * Math.min(1.35, Math.max(0.8, rect.w / rect.h + 0.35));
    // Evenly spaced slots, rotated to best match the desired angles.
    let rot = 0;
    if (n) {
      let bestCost = Infinity;
      for (let k = 0; k < 24; k++) {
        const r0 = (k / 24) * Math.PI * 2;
        const cost = desired.reduce((s, d, i) => {
          const a = r0 + (i / n) * Math.PI * 2;
          const diff = Math.atan2(Math.sin(a - d.ang), Math.cos(a - d.ang));
          return s + diff * diff;
        }, 0);
        if (cost < bestCost - 1e-9) { bestCost = cost; rot = r0; }
      }
    }
    desired.forEach((d, i) => {
      const a = rot + (i / Math.max(n, 1)) * Math.PI * 2;
      home.set(d.id, { x: anchor.x + Math.cos(a) * ringRx, y: anchor.y + Math.sin(a) * ringRy });
    });
  });

  const radius = (n: LayoutNode) => Math.round((4.5 + n.importance * 4.5 + (n.id === focus ? 2.5 : 0)) * 10) / 10;
  const pos = new Map([...home].map(([id, p]) => [id, { ...p }]));
  const pad = unit * 0.9;
  // Narrow regions keep nodes further from the sides so their labels still fit.
  const padX = Math.max(pad, rect.w * 0.14);
  const bounds = { x: rect.x + padX, y: rect.y + pad, w: rect.w - padX * 2, h: rect.h - pad * 2 };
  const gap = opts.nodeGap ?? unit * 1.25;
  const ids = [...pos.keys()].sort();
  // Nodes whose labels must show claim room for them.
  const req = requiredSet(opts);
  const claim = (id: string) => (req.has(id) ? measureText(byId.get(id)!.short ?? byId.get(id)!.label, opts.fontSize ?? 12) * 0.4 : 0);

  // Bounded relaxation: fixed iterations, hard min-distance, springs to home, bounds and reserved zones.
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i]!)!, b = pos.get(ids[j]!)!;
        const min = radius(byId.get(ids[i]!)!) + radius(byId.get(ids[j]!)!) + gap + Math.max(claim(ids[i]!), claim(ids[j]!));
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
    // Keep nodes off lines that aren't theirs (edges are near-straight at rest).
    for (const e of inEdges) {
      const A = pos.get(e.from)!, B = pos.get(e.to)!;
      const L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2 || 1;
      for (const id of ids) {
        if (id === e.from || id === e.to) continue;
        const p = pos.get(id)!;
        const t = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / L2;
        if (t <= 0.08 || t >= 0.92) continue;
        const q = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
        let dx = p.x - q.x, dy = p.y - q.y;
        let d = Math.hypot(dx, dy);
        const need = radius(byId.get(id)!) + unit * 0.7;
        if (d >= need) continue;
        if (d < 1e-6) { dx = -(B.y - A.y); dy = B.x - A.x; d = Math.hypot(dx, dy); }
        p.x += (dx / d) * (need - d) * 0.5;
        p.y += (dy / d) * (need - d) * 0.5;
      }
    }
    for (const id of ids) {
      const p = pos.get(id)!, h = home.get(id)!;
      p.x += (h.x - p.x) * 0.04;
      p.y += (h.y - p.y) * 0.04;
      p.x = Math.min(bounds.x + bounds.w, Math.max(bounds.x, p.x));
      p.y = Math.min(bounds.y + bounds.h, Math.max(bounds.y, p.y));
      for (const z of opts.reserved ?? []) {
        const zz = inflate(z, radius(byId.get(id)!) + 4);
        if (pointInRect(p, zz)) {
          // Leave the zone by the shortest side.
          const moves = [p.x - zz.x, zz.x + zz.w - p.x, p.y - zz.y, zz.y + zz.h - p.y];
          const k = moves.indexOf(Math.min(...moves));
          if (k === 0) p.x = zz.x; else if (k === 1) p.x = zz.x + zz.w; else if (k === 2) p.y = zz.y; else p.y = zz.y + zz.h;
        }
      }
    }
  }

  // Mirror (duo): reflect within the region so counterpart concepts face each other.
  const mirrorY = region.mirror === "y";
  const placed: PlacedNode[] = nodes.map((n) => {
    const p = pos.get(n.id)!;
    return {
      ...n,
      x: round(p.x),
      y: round(mirrorY ? rect.y + rect.h - (p.y - rect.y) : p.y),
      r: radius(n),
      cluster: clusterOf.get(n.id) ?? 0,
      depth: 1,
      hub: hubs.has(n.id),
    };
  });
  return { placed, clusters: clusterList };
}

const round = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Depth (2.5D): meaning, not decoration. Focal = 1, direct neighbors = 0.85, others by cluster.

function assignDepth(nodes: PlacedNode[], edges: LayoutEdge[], focusId: string | null | undefined): void {
  if (!focusId) {
    for (const n of nodes) n.depth = n.hub ? 1 : 0.85;
    return;
  }
  const focalCluster = nodes.find((n) => n.id === focusId)?.cluster;
  const neighbors = new Set(edges.flatMap((e) => (e.from === focusId ? [e.to] : e.to === focusId ? [e.from] : [])));
  for (const n of nodes) n.depth = n.id === focusId ? 1 : neighbors.has(n.id) ? 0.85 : n.cluster === focalCluster ? 0.72 : 0.6;
}

// ---------------------------------------------------------------------------
// Labels

type Cand = { anchor: string; x: number; y: number; cost: number };

function candidates(n: PlacedNode, w: number, lh: number): Cand[] {
  const out: Cand[] = [];
  // Two rings: tight first, then a little further out when the tight ring is crowded.
  for (const [ring, extra] of [[0, 0], [1, 7]] as const) {
    const off = n.r + 5 + extra;
    const c = ring * 3;
    out.push(
      { anchor: "below", x: n.x - w / 2, y: n.y + off - 1, cost: 0 + c },
      { anchor: "right", x: n.x + off, y: n.y - lh / 2, cost: 0.5 + c },
      { anchor: "left", x: n.x - off - w, y: n.y - lh / 2, cost: 1 + c },
      { anchor: "above", x: n.x - w / 2, y: n.y - off - lh + 1, cost: 1.2 + c },
      { anchor: "below-right", x: n.x + off * 0.7, y: n.y + off * 0.5, cost: 2.5 + c },
      { anchor: "above-right", x: n.x + off * 0.7, y: n.y - off * 0.5 - lh, cost: 2.5 + c },
      { anchor: "below-left", x: n.x - off * 0.7 - w, y: n.y + off * 0.5, cost: 2.5 + c },
      { anchor: "above-left", x: n.x - off * 0.7 - w, y: n.y - off * 0.5 - lh, cost: 2.5 + c },
    );
  }
  // Radial fallbacks: slip the label into a gap between spokes, a little further out.
  for (const extra of [4, 12, 20]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rx = n.r + 4 + extra + w / 2, ry = n.r + 4 + extra + lh / 2;
      out.push({ anchor: `radial-${k}-${extra}`, x: n.x + Math.cos(a) * rx - w / 2, y: n.y + Math.sin(a) * ry - lh / 2, cost: 6 + extra / 4 });
    }
  }
  return out;
}

const edgeHitsBox = (pts: Point[], box: Rect) => pts.some((p) => pointInRect(p, inflate(box, 1.5)));
const edgePts = (e: RoutedEdge) => sampleQuad(e.a, e.c, e.b, 24).slice(3, -3);

function placeLabels(nodes: PlacedNode[], edges: RoutedEdge[], frame: Rect, opts: LayoutOptions): PlacedLabel[] {
  const fs = opts.fontSize ?? 12;
  const lh = LABEL_H(fs);
  const lod = opts.lod ?? "normal";
  const required = requiredSet(opts);
  const neighbors = new Set(
    opts.focusId ? edges.flatMap((e) => (e.from === opts.focusId ? [e.to] : e.to === opts.focusId ? [e.from] : [])) : [],
  );
  const wants = (n: PlacedNode) =>
    required.has(n.id) || (lod === "normal" ? true : lod === "overview" ? n.hub || n.importance >= 0.8 : neighbors.has(n.id) || n.hub);
  const priority = (n: PlacedNode) => (required.has(n.id) ? 1000 : 0) + (neighbors.has(n.id) ? 200 : 0) + (n.hub ? 100 : 0) + n.importance * 50;

  const placed: PlacedLabel[] = [];
  const shown = edges.filter((e) => e.primary).map(edgePts);
  const order = [...nodes].sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id));

  for (const n of order) {
    const text = n.short ?? n.label;
    const w = measureText(text, fs);
    let best: { c: Cand; score: number; clean: boolean } | null = null;
    for (const c of candidates(n, w, lh)) {
      const box = { x: c.x, y: c.y, w, h: lh };
      const { score, clean } = scoreBox(box, n.id, c.cost, nodes, placed, shown, frame, opts);
      if (!best || score < best.score) best = { c, score, clean };
    }
    const show = wants(n) && (best!.clean || required.has(n.id));
    placed.push({ id: n.id, text, x: round(best!.c.x), y: round(best!.c.y), w, h: lh, visible: show, anchor: best!.c.anchor });
  }
  return nodes.map((n) => placed.find((p) => p.id === n.id)!);
}

function requiredSet(opts: LayoutOptions): Set<string> {
  return new Set([...(opts.requiredLabels ?? []), ...(opts.focusId ? [opts.focusId] : []), ...(opts.changedIds ?? [])]);
}

function scoreBox(box: Rect, selfId: string, base: number, nodes: PlacedNode[], labels: PlacedLabel[], edgePoints: Point[][], frame: Rect, opts: LayoutOptions) {
  let score = base;
  let clean = true;
  if (!inside(box, frame)) { score += 1000; clean = false; }
  for (const z of opts.reserved ?? []) if (rectsOverlap(box, z)) { score += 1000; clean = false; }
  for (const p of labels) {
    if (!p.visible || p.id === selfId) continue;
    const a = overlapArea(inflate(box, 2), p);
    if (a > 0) { score += 500 + a; clean = false; }
  }
  for (const n of nodes) if (n.id !== selfId && circleRectOverlap({ x: n.x, y: n.y, r: n.r + 3 }, box)) { score += 400; clean = false; }
  // Text on a line is unreadable: treat it as a collision, not a preference.
  for (const pts of edgePoints) if (edgeHitsBox(pts, box)) { score += 60; clean = false; }
  return { score, clean };
}

/**
 * After edges are routed, any label still crossed by a line moves to a clear
 * anchor. If none exists it is hidden at this level of detail (unless required).
 */
function repairLabels(nodes: PlacedNode[], labels: PlacedLabel[], edges: RoutedEdge[], frame: Rect, opts: LayoutOptions): boolean {
  const required = requiredSet(opts);
  const lh = LABEL_H(opts.fontSize ?? 12);
  const pts = edges.filter((e) => e.primary).map(edgePts);
  let changed = false;
  for (const l of labels) {
    if (!l.visible || !pts.some((p) => edgeHitsBox(p, l))) continue;
    const n = nodes.find((x) => x.id === l.id)!;
    let best: { c: Cand; score: number } | null = null;
    for (const c of candidates(n, l.w, lh)) {
      const box = { x: c.x, y: c.y, w: l.w, h: lh };
      const r = scoreBox(box, l.id, c.cost, nodes, labels, pts, frame, opts);
      if (r.clean && (!best || r.score < best.score)) best = { c, score: r.score };
    }
    if (best) {
      l.x = round(best.c.x); l.y = round(best.c.y); l.anchor = best.c.anchor;
    } else if (!required.has(l.id)) {
      l.visible = false;
    } else continue;
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Edges: curves bend away from labels and unrelated nodes.

function routeEdges(nodes: PlacedNode[], edges: LayoutEdge[], labels: PlacedLabel[], opts: LayoutOptions): RoutedEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lod = opts.lod ?? "normal";
  const focus = opts.focusId;
  const out: RoutedEdge[] = [];
  const sorted = [...edges].filter((e) => byId.has(e.from) && byId.has(e.to)).sort((a, b) => b.weight - a.weight || (a.from + a.to).localeCompare(b.from + b.to));
  for (const e of sorted) {
    const A = byId.get(e.from)!, B = byId.get(e.to)!;
    const touchesFocus = !!focus && (e.from === focus || e.to === focus);
    const primary = lod === "overview" ? e.weight >= 0.6 || touchesFocus : lod === "focus" ? touchesFocus || e.weight >= 0.7 : true;
    const a = { x: A.x, y: A.y }, b = { x: B.x, y: B.y };
    const len = dist(a, b) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const perp = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    let best: { c: Point; cost: number; hits: number } | null = null;
    for (const k of [0, 0.08, -0.08, 0.16, -0.16, 0.26, -0.26, 0.38, -0.38, 0.5, -0.5]) {
      const c = { x: mid.x + perp.x * k * len, y: mid.y + perp.y * k * len };
      const pts = sampleQuad(a, c, b, 24).slice(3, -3);
      let hits = 0;
      for (const l of labels) if (l.visible && pts.some((p) => pointInRect(p, inflate(l, 2)))) hits += 3;
      for (const n of nodes) if (n.id !== e.from && n.id !== e.to && pts.some((p) => pointInCircle(p, { x: n.x, y: n.y, r: n.r + 3 }))) hits += 2;
      const cost = hits * 10 + Math.abs(k);
      if (!best || cost < best.cost) best = { c, cost, hits };
    }
    out.push({ from: e.from, to: e.to, weight: e.weight, ...(e.type ? { type: e.type } : {}), a, c: { x: round(best!.c.x), y: round(best!.c.y) }, b, primary, collisions: best!.hits });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation

export function validate(result: Pick<LayoutResult, "nodes" | "labels" | "edges">, frame: Rect): LayoutDiagnostics {
  const { nodes, labels, edges } = result;
  const vis = labels.filter((l) => l.visible);
  let nodeOverlaps = 0, labelOverlaps = 0, labelNodeOverlaps = 0, edgeLabelCrossings = 0, edgeNodeCrossings = 0, edgeCrossings = 0, labelsOutOfBounds = 0, nodesOutOfBounds = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    if (a.x - a.r < frame.x || a.y - a.r < frame.y || a.x + a.r > frame.x + frame.w || a.y + a.r > frame.y + frame.h) nodesOutOfBounds++;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      if (dist(a, b) < a.r + b.r + 2) nodeOverlaps++;
    }
  }
  for (let i = 0; i < vis.length; i++) {
    if (!inside(vis[i]!, frame)) labelsOutOfBounds++;
    for (let j = i + 1; j < vis.length; j++) if (rectsOverlap(vis[i]!, vis[j]!)) labelOverlaps++;
    for (const n of nodes) if (n.id !== vis[i]!.id && circleRectOverlap({ x: n.x, y: n.y, r: n.r }, vis[i]!)) labelNodeOverlaps++;
  }
  const shown = edges.filter((e) => e.primary);
  for (const e of shown) {
    const pts = sampleQuad(e.a, e.c, e.b, 24).slice(3, -3);
    for (const l of vis) if (pts.some((p) => pointInRect(p, l))) edgeLabelCrossings++;
    for (const n of nodes) if (n.id !== e.from && n.id !== e.to && pts.some((p) => pointInCircle(p, n))) edgeNodeCrossings++;
  }
  for (let i = 0; i < shown.length; i++) {
    const pi = sampleQuad(shown[i]!.a, shown[i]!.c, shown[i]!.b, 12);
    for (let j = i + 1; j < shown.length; j++) {
      const ej = shown[j]!;
      if ([ej.from, ej.to].some((id) => id === shown[i]!.from || id === shown[i]!.to)) continue;
      const pj = sampleQuad(ej.a, ej.c, ej.b, 12);
      outer: for (let s = 0; s < pi.length - 1; s++) for (let t = 0; t < pj.length - 1; t++) {
        if (segmentsCross(pi[s]!, pi[s + 1]!, pj[t]!, pj[t + 1]!)) { edgeCrossings++; break outer; }
      }
    }
  }
  return { nodeOverlaps, labelOverlaps, labelNodeOverlaps, edgeLabelCrossings, edgeNodeCrossings, edgeCrossings, labelsOutOfBounds, nodesOutOfBounds, hiddenLabels: labels.length - vis.length };
}

// ---------------------------------------------------------------------------
// Public API

/** One Mind in one frame. */
export function layoutMind(nodes: LayoutNode[], edges: LayoutEdge[], frame: Rect, opts: LayoutOptions = {}): LayoutResult {
  const { placed, clusters } = placeRegion(nodes, edges, { rect: frame }, opts);
  assignDepth(placed, edges, opts.focusId);
  return finish(placed, edges, clusters, frame, opts);
}

function finish(placed: PlacedNode[], edges: LayoutEdge[], clusters: string[][], frame: Rect, opts: LayoutOptions): LayoutResult {
  // Straight edges first so labels can avoid them, then route edges around the chosen labels.
  const straight = routeEdges(placed, edges, [], opts).map((e) => ({ ...e, c: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } }));
  const labels = placeLabels(placed, straight, frame, opts);
  let routed = routeEdges(placed, edges, labels, opts);
  for (let pass = 0; pass < 4 && repairLabels(placed, labels, routed, frame, opts); pass++) routed = routeEdges(placed, edges, labels, opts);
  // Last resort: a weak edge that still can't avoid text or a node recedes to secondary at this LOD.
  for (const e of routed) {
    if (!e.primary || e.collisions === 0) continue;
    const essential = e.weight >= 0.7 || (!!opts.focusId && (e.from === opts.focusId || e.to === opts.focusId));
    if (!essential) e.primary = false;
  }
  const result = { nodes: placed, labels, edges: routed, clusters, bounds: frame };
  return { ...result, diagnostics: validate(result, frame) };
}

export type DuoInput = {
  /** Same concept set for both people; ids here are concept ids. */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  frame: Rect;
  /** Width of the shared corridor between the two Minds (transfers cross it). */
  band?: number;
  opts?: LayoutOptions;
};
export type TransferRoute = { a: Point; c1: Point; c2: Point; b: Point };
export type DuoResult = {
  left: LayoutResult;
  right: LayoutResult;
  band: Rect;
  /** Route from a concept in one Mind to the same concept in the other, across the corridor. */
  transferRoute: (conceptId: string, from?: "left" | "right") => TransferRoute | null;
};

/**
 * Two Minds side by side in one shared space (Figma 1:94 onward): the same
 * semantic composition in each region, so a concept sits in the same place in
 * both Minds and a transfer reads as a short horizontal trace between them.
 */
export function layoutDuo({ nodes, edges, frame, band, opts = {} }: DuoInput): DuoResult {
  const bandW = band ?? Math.round(frame.w * 0.06);
  const regionW = (frame.w - bandW) / 2;
  const leftRect = { x: frame.x, y: frame.y, w: regionW, h: frame.h };
  const bandRect = { x: frame.x + regionW, y: frame.y, w: bandW, h: frame.h };
  const rightRect = { x: frame.x + regionW + bandW, y: frame.y, w: regionW, h: frame.h };

  const tag = (p: string) => nodes.map((n) => ({ ...n, id: `${p}:${n.id}`, conceptId: n.id }));
  const tagE = (p: string) => edges.map((e) => ({ ...e, from: `${p}:${e.from}`, to: `${p}:${e.to}` }));
  const tagO = (p: string): LayoutOptions => ({
    ...opts,
    focusId: opts.focusId ? `${p}:${opts.focusId}` : null,
    changedIds: (opts.changedIds ?? []).map((id) => `${p}:${id}`),
    requiredLabels: (opts.requiredLabels ?? []).map((id) => `${p}:${id}`),
  });
  const side = (p: string, rect: Rect) => {
    const r = placeRegion(tag(p), tagE(p), { rect }, tagO(p));
    assignDepth(r.placed, tagE(p), tagO(p).focusId);
    return finish(r.placed, tagE(p), r.clusters, rect, tagO(p));
  };
  const left = side("a", leftRect);
  const right = side("b", rightRect);

  const transferRoute = (conceptId: string, from: "left" | "right" = "right"): TransferRoute | null => {
    const src = (from === "left" ? left : right).nodes.find((n) => n.conceptId === conceptId);
    const dst = (from === "left" ? right : left).nodes.find((n) => n.conceptId === conceptId);
    if (!src || !dst) return null;
    // A gentle S: level out through the corridor at the midpoint height.
    const midY = (src.y + dst.y) / 2;
    const cx = bandRect.x + bandRect.w / 2;
    return { a: { x: src.x, y: src.y }, c1: { x: cx, y: midY }, c2: { x: cx, y: midY }, b: { x: dst.x, y: dst.y } };
  };
  return { left, right, band: bandRect, transferRoute };
}
