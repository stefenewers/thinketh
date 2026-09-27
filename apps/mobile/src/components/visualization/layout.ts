import type { VisualEdge, VisualizationSpec, VisualNode, VisualSection } from "@thinketh/contracts";

// Thinketh's diagram layout: pure, deterministic, phone-first. Given a spec, the available width
// and the measured heights of what the app rendered, place every node and route every connector
// between real node boundaries. Each grammar gets its own topology; all share one visual system.
// Nothing here is tied to a screen size: positions come from the width and the measurements.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type LaidNode = Rect & { id: string; iconSize: number; compact: boolean };
export type LaidFrame = Rect & { section: VisualSection; header: Rect };
export type LaidCallout = Rect & { index: number };
export type LaidEdge = {
  key: string;
  from: string;
  to: string;
  /** Nodes that answer when the signal arrives (a whole group, for an edge into a group). */
  targets: string[];
  d: string;
  samples: Point[];
  length: number;
  /** Chevron at the target end, or null for undirected links. */
  head: string | null;
  primary: boolean;
  dashed: boolean;
  label?: { text: string; at: Point };
  /** Animation wave: edges in the same wave draw together. */
  wave: number;
};
export type Layout = {
  width: number;
  height: number;
  nodes: Record<string, LaidNode>;
  frames: LaidFrame[];
  callouts: LaidCallout[];
  edges: LaidEdge[];
  /** Timeline rail markers. */
  markers: (Point & { primary: boolean })[];
  waves: number;
};

/** Measured heights, keyed by node id, `section:<id>` (a frame header) or `callout:<index>`. */
export type Measured = Record<string, number>;

export const GAP_X = 10;
export const CHAIN_GAP_X = 24;
export const FRAME_PAD = 14;
const GAP_Y = 36;
const GAP_Y_LABELLED = 46;
const FRAME_GAP = 44;
const HEADER_GAP = 12;
const RAIL_X = 12;
const RAIL_INSET = 34;
const EST_NODE = 88;
const EST_HEADER = 40;
const EST_CALLOUT = 56;

/** Every key the renderer must measure before the layout is final. */
export function measureKeys(spec: VisualizationSpec): string[] {
  const plan = planFor(spec);
  const inFrames = plan.blocks.flatMap((b) => (b.kind === "section" ? [`section:${b.section.id}`, ...b.callouts.map((i) => `callout:${i}`)] : b.kind === "columns" ? b.sections.map((s) => `section:${s.id}`) : []));
  return [...spec.nodes.map((n) => n.id), ...inFrames];
}

/** Callouts the diagram places inside a section; the rest render after the diagram. */
export function framedCallouts(spec: VisualizationSpec): Set<number> {
  return new Set(planFor(spec).blocks.flatMap((b) => (b.kind === "section" ? b.callouts : [])));
}

// ---------------------------------------------------------------------------
// Plan: which nodes share a row, which rows share a frame. Width-independent.
// ---------------------------------------------------------------------------

type Row = { ids: string[]; chain: boolean };
type Block =
  | { kind: "rows"; rows: Row[] }
  | { kind: "section"; section: VisualSection; rows: Row[]; callouts: number[] }
  | { kind: "columns"; sections: VisualSection[] }
  | { kind: "cycle"; ids: string[] }
  | { kind: "rail"; ids: string[] };
type Plan = { blocks: Block[]; routing: "flow" | "radial" | "ring" | "rail" | "none" };

const planCache = new WeakMap<VisualizationSpec, Plan>();

function planFor(spec: VisualizationSpec): Plan {
  const hit = planCache.get(spec);
  if (hit) return hit;
  const plan = buildPlan(spec);
  planCache.set(spec, plan);
  return plan;
}

function buildPlan(spec: VisualizationSpec): Plan {
  const order = spec.nodes.map((n) => n.id);
  const sectioned = new Set(spec.sections.flatMap((s) => s.nodeIds));
  const loose = order.filter((id) => !sectioned.has(id));
  const t = spec.visualizationType;

  if (t === "cycle" && spec.nodes.length >= 3 && spec.nodes.length <= 6) return { blocks: [{ kind: "cycle", ids: cycleOrder(spec) }], routing: "ring" };
  if (t === "timeline") return { blocks: [{ kind: "rail", ids: order }], routing: "rail" };
  if ((t === "system" || t === "concept_map") && spec.nodes.length >= 3) return { blocks: [{ kind: "rows", rows: hubRows(spec) }], routing: "radial" };
  if (t === "comparison" && spec.sections.length >= 2) {
    const blocks: Block[] = [{ kind: "columns", sections: spec.sections.slice(0, 3) }];
    if (loose.length) blocks.push({ kind: "rows", rows: rankRows(loose, spec.edges) });
    return { blocks, routing: "none" };
  }
  if (spec.sections.length) {
    const blocks: Block[] = spec.sections.map((section) => {
      const ids = section.nodeIds;
      const inner = spec.edges.filter((e) => ids.includes(e.from) && ids.includes(e.to));
      // A short chain inside a section reads left to right, as in the Before/Now reference.
      const isChain = ids.length >= 2 && ids.length <= 3 && inner.length === ids.length - 1 && new Set(ranks(ids, inner).values()).size === ids.length;
      const rows = isChain ? [{ ids: sortByRank(ids, inner), chain: true }] : rankRows(ids, inner);
      // A callout sits inside its section only where no connector leaves the section past it.
      const exits = spec.edges.some((e) => ids.includes(e.from) && !ids.includes(e.to));
      const callouts = exits ? [] : spec.callouts.flatMap((c, i) => (c.targetNodeId && ids.includes(c.targetNodeId) ? [i] : []));
      return { kind: "section" as const, section, rows, callouts };
    });
    if (loose.length) blocks.push({ kind: "rows", rows: rankRows(loose, spec.edges) });
    return { blocks, routing: "flow" };
  }
  return { blocks: [{ kind: "rows", rows: rankRows(order, spec.edges) }], routing: "flow" };
}

/** Longest-path layering over the edges among `ids`; back edges (cycles) are ignored. */
export function ranks(ids: string[], edges: VisualEdge[]): Map<string, number> {
  const set = new Set(ids);
  const inner = edges.filter((e) => set.has(e.from) && set.has(e.to));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of inner) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const e of inner) if (e.from === id) {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  for (const id of ids) if (!topo.includes(id)) topo.push(id);
  const pos = new Map(topo.map((id, i) => [id, i]));
  const rank = new Map<string, number>();
  for (const id of topo) {
    const preds = inner.filter((e) => e.to === id && pos.get(e.from)! < pos.get(id)!);
    rank.set(id, preds.length ? Math.max(...preds.map((e) => rank.get(e.from)! + 1)) : 0);
  }
  return rank;
}

function sortByRank(ids: string[], edges: VisualEdge[]): string[] {
  const r = ranks(ids, edges);
  return [...ids].sort((a, b) => r.get(a)! - r.get(b)! || ids.indexOf(a) - ids.indexOf(b));
}

/** Nodes of one rank share a row; wide ranks wrap into balanced rows of at most three. */
function rankRows(ids: string[], edges: VisualEdge[]): Row[] {
  const r = ranks(ids, edges);
  const levels = [...new Set(ids.map((id) => r.get(id)!))].sort((a, b) => a - b);
  return levels.flatMap((lv) => chunk(ids.filter((id) => r.get(id) === lv)).map((ids) => ({ ids, chain: false })));
}

/** At most three across, balanced: 4 -> 2+2, 5 -> 3+2. */
function chunk(ids: string[]): string[][] {
  if (ids.length <= 3) return [ids];
  const rows = Math.ceil(ids.length / 3);
  const size = Math.ceil(ids.length / rows);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** The hub in the middle; what feeds it above, what it reaches below. */
function hubRows(spec: VisualizationSpec): Row[] {
  const degree = (id: string) => spec.edges.filter((e) => e.from === id || e.to === id).length;
  const hub =
    spec.nodes.find((n) => n.emphasis === "primary" && degree(n.id) >= 2)?.id ??
    [...spec.nodes].sort((a, b) => degree(b.id) - degree(a.id))[0]!.id;
  const others = spec.nodes.map((n) => n.id).filter((id) => id !== hub);
  const above: string[] = [];
  const below: string[] = [];
  for (const id of others) {
    const feeds = spec.edges.some((e) => e.from === id && e.to === hub);
    const fed = spec.edges.some((e) => e.from === hub && e.to === id);
    if (feeds && !fed) above.push(id);
    else if (fed && !feeds) below.push(id);
    else (above.length <= below.length ? above : below).push(id);
  }
  return [...chunk(above), [hub], ...chunk(below)].filter((ids) => ids.length).map((ids) => ({ ids, chain: false }));
}

/** Follow the loop from the first node, so the ring is drawn in the order the idea runs. */
function cycleOrder(spec: VisualizationSpec): string[] {
  const ids = spec.nodes.map((n) => n.id);
  const out = [ids[0]!];
  while (out.length < ids.length) {
    const next = spec.edges.find((e) => e.from === out[out.length - 1] && !out.includes(e.to))?.to ?? ids.find((id) => !out.includes(id))!;
    out.push(next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

const h = (m: Measured, key: string, est: number) => m[key] ?? est;

/** One node alone in a row: comfortably narrower than the column, never cramped. */
const singleWidth = (avail: number) => Math.min(avail, Math.max(avail * 0.64, 208));

export function layoutVisualization(spec: VisualizationSpec, width: number, measured: Measured): Layout {
  const plan = planFor(spec);
  const nodes: Record<string, LaidNode> = {};
  const frames: LaidFrame[] = [];
  const callouts: LaidCallout[] = [];
  const markers: Layout["markers"] = [];
  const labelled = new Set(spec.edges.filter((e) => e.label).map((e) => `${e.from}->${e.to}`));
  let y = 0;

  const placeRows = (rows: Row[], x0: number, avail: number, top: number): number => {
    let cy = top;
    rows.forEach((row, ri) => {
      const n = row.ids.length;
      const gap = row.chain ? CHAIN_GAP_X : GAP_X;
      const w = n === 1 ? singleWidth(avail) : (avail - gap * (n - 1)) / n;
      const total = w * n + gap * (n - 1);
      const iconSize = n >= 3 || (row.chain && n === 2) ? 24 : 36;
      const rowH = Math.max(...row.ids.map((id) => h(measured, id, EST_NODE)));
      row.ids.forEach((id, i) => {
        nodes[id] = { id, x: x0 + (avail - total) / 2 + i * (w + gap), y: cy, w, h: rowH, iconSize, compact: w < 124 };
      });
      cy += rowH;
      if (ri < rows.length - 1) {
        const next = rows[ri + 1]!.ids;
        const hasLabel = row.ids.some((a) => next.some((b) => labelled.has(`${a}->${b}`)));
        cy += hasLabel ? GAP_Y_LABELLED : GAP_Y;
      }
    });
    return cy;
  };

  plan.blocks.forEach((block, bi) => {
    if (bi > 0) y += FRAME_GAP;
    if (block.kind === "rows") {
      y = placeRows(block.rows, 0, width, y);
    } else if (block.kind === "section") {
      const inner = width - FRAME_PAD * 2;
      const headerH = h(measured, `section:${block.section.id}`, EST_HEADER);
      const header = { x: FRAME_PAD, y: y + FRAME_PAD, w: inner, h: headerH };
      let cy = placeRows(block.rows, FRAME_PAD, inner, header.y + headerH + HEADER_GAP);
      for (const i of block.callouts) {
        const ch = h(measured, `callout:${i}`, EST_CALLOUT);
        callouts.push({ index: i, x: FRAME_PAD, y: cy + 14, w: inner, h: ch });
        cy += 14 + ch;
      }
      frames.push({ section: block.section, x: 0, y, w: width, h: cy + FRAME_PAD - y, header });
      y = cy + FRAME_PAD;
    } else if (block.kind === "columns") {
      const n = block.sections.length;
      const colW = (width - GAP_X * (n - 1)) / n;
      const headerH = Math.max(...block.sections.map((s) => h(measured, `section:${s.id}`, EST_HEADER)));
      const depth = Math.max(...block.sections.map((s) => s.nodeIds.length));
      let cy = y + FRAME_PAD + headerH + HEADER_GAP;
      const tops: number[] = [];
      for (let r = 0; r < depth; r++) {
        const rowH = Math.max(...block.sections.map((s) => (s.nodeIds[r] ? h(measured, s.nodeIds[r]!, EST_NODE) : 0)));
        tops.push(cy);
        block.sections.forEach((s, ci) => {
          const id = s.nodeIds[r];
          if (id) nodes[id] = { id, x: ci * (colW + GAP_X) + 8, y: cy, w: colW - 16, h: rowH, iconSize: 24, compact: colW - 16 < 124 };
        });
        cy += rowH + GAP_X;
      }
      const bottom = cy - GAP_X + 8;
      block.sections.forEach((s, ci) => {
        frames.push({ section: s, x: ci * (colW + GAP_X), y, w: colW, h: bottom - y, header: { x: ci * (colW + GAP_X) + 12, y: y + FRAME_PAD, w: colW - 24, h: headerH } });
      });
      y = bottom;
    } else if (block.kind === "cycle") {
      y = placeCycle(block.ids, width, y, measured, nodes);
    } else if (block.kind === "rail") {
      let cy = y;
      block.ids.forEach((id, i) => {
        const nh = h(measured, id, EST_NODE);
        nodes[id] = { id, x: RAIL_INSET, y: cy, w: width - RAIL_INSET, h: nh, iconSize: 24, compact: false };
        const node = spec.nodes.find((n) => n.id === id);
        markers.push({ x: RAIL_X, y: cy + nh / 2, primary: node?.emphasis === "primary" });
        cy += nh + (i < block.ids.length - 1 ? 18 : 0);
      });
      y = cy;
    }
  });

  const edges = routeEdges(spec, plan, nodes, frames, width);
  const bottomRoom = edges.some((e) => e.samples.some((p) => p.y > y)) ? 16 : 4;
  return { width, height: y + bottomRoom, nodes, frames, callouts, edges, markers, waves: edges.reduce((m, e) => Math.max(m, e.wave + 1), 0) };
}

/** A loop drawn as a ring: 3 = triangle, 4 = square, 5-6 = two columns running clockwise. */
function placeCycle(ids: string[], width: number, top: number, measured: Measured, nodes: Record<string, LaidNode>): number {
  const n = ids.length;
  const colGap = Math.max(48, width * 0.14);
  const w = Math.min((width - colGap) / 2, 190);
  const leftX = (width - colGap) / 2 - w;
  const rightX = (width + colGap) / 2;
  const midX = (width - w) / 2;
  const slots: { x: number; row: number }[] =
    n === 3
      ? [{ x: midX, row: 0 }, { x: rightX, row: 1 }, { x: leftX, row: 1 }]
      : n === 4
        ? [{ x: leftX, row: 0 }, { x: rightX, row: 0 }, { x: rightX, row: 1 }, { x: leftX, row: 1 }]
        : n === 5
          ? [{ x: midX, row: 0 }, { x: rightX, row: 1 }, { x: rightX, row: 2 }, { x: leftX, row: 2 }, { x: leftX, row: 1 }]
          : [{ x: leftX, row: 0 }, { x: rightX, row: 0 }, { x: rightX, row: 1 }, { x: rightX, row: 2 }, { x: leftX, row: 2 }, { x: leftX, row: 1 }];
  const rowsN = Math.max(...slots.map((s) => s.row)) + 1;
  const rowH = Array.from({ length: rowsN }, (_, r) => Math.max(...ids.filter((_, i) => slots[i]!.row === r).map((id) => h(measured, id, EST_NODE))));
  const rowTop: number[] = [];
  let cy = top;
  for (let r = 0; r < rowsN; r++) {
    rowTop.push(cy);
    cy += rowH[r]! + (r < rowsN - 1 ? 40 : 0);
  }
  ids.forEach((id, i) => {
    const s = slots[i]!;
    nodes[id] = { id, x: s.x, y: rowTop[s.row]!, w, h: rowH[s.row]!, iconSize: 36, compact: w < 124 };
  });
  return cy;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function cubicSamples(p0: Point, c1: Point, c2: Point, p3: Point, n = 24): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    };
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pathOf = (p0: Point, c1: Point, c2: Point, p3: Point) => `M${r1(p0.x)} ${r1(p0.y)} C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p3.x)} ${r1(p3.y)}`;
const lengthOf = (pts: Point[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

function chevron(tip: Point, from: Point, size = 6): string {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  const l = { x: tip.x - size * Math.cos(a - 0.5), y: tip.y - size * Math.sin(a - 0.5) };
  const r = { x: tip.x - size * Math.cos(a + 0.5), y: tip.y - size * Math.sin(a + 0.5) };
  return `M${r1(l.x)} ${r1(l.y)} L${r1(tip.x)} ${r1(tip.y)} L${r1(r.x)} ${r1(r.y)}`;
}

/** Where the segment from a rect's centre toward `toward` leaves the rect. */
function boundary(r: Rect, toward: Point, pad = 0): Point {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? (r.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + pad) / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

type Curve = { p0: Point; c1: Point; c2: Point; p3: Point };

/** Flow routing: down the page between bottoms and tops; sideways within a row; back edges around the side. */
function flowCurve(s: Rect, t: Rect, width: number): Curve {
  const sc = center(s);
  const tc = center(t);
  if (t.y >= s.y + s.h - 1) {
    const p0 = { x: sc.x, y: s.y + s.h };
    const p3 = { x: tc.x, y: t.y };
    const k = Math.max(14, (p3.y - p0.y) * 0.5);
    return { p0, c1: { x: p0.x, y: p0.y + k }, c2: { x: p3.x, y: p3.y - k }, p3 };
  }
  if (s.y >= t.y + t.h - 1) {
    // Back edge: out of the right side, up the margin, into the target's right side.
    const p0 = { x: s.x + s.w, y: sc.y };
    const p3 = { x: t.x + t.w, y: tc.y };
    const lane = Math.min(width - 2, Math.max(p0.x, p3.x) + 26);
    return { p0, c1: { x: lane, y: p0.y }, c2: { x: lane, y: p3.y }, p3 };
  }
  const rightward = tc.x >= sc.x;
  const p0 = { x: rightward ? s.x + s.w : s.x, y: sc.y };
  const p3 = { x: rightward ? t.x : t.x + t.w, y: tc.y };
  const k = (p3.x - p0.x) * 0.4;
  return { p0, c1: { x: p0.x + k, y: p0.y }, c2: { x: p3.x - k, y: p3.y }, p3 };
}

/** Radial routing: straight between boundaries, so a hub reads as a hub. Two-way links run side by side. */
function radialCurve(s: Rect, t: Rect, offset = 0): Curve {
  const a = center(s);
  const b = center(t);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / len) * offset, y: ((b.x - a.x) / len) * offset };
  const p0 = boundary(s, { x: b.x + n.x, y: b.y + n.y }, 2);
  const p3 = boundary(t, { x: a.x + n.x, y: a.y + n.y }, 2);
  const q0 = { x: p0.x + n.x, y: p0.y + n.y };
  const q3 = { x: p3.x + n.x, y: p3.y + n.y };
  return { p0: q0, c1: lerp(q0, q3, 1 / 3), c2: lerp(q0, q3, 2 / 3), p3: q3 };
}

/** Ring routing: gentle arcs bowed away from the loop's centre. */
function ringCurve(s: Rect, t: Rect, hub: Point): Curve {
  const a = center(s);
  const b = center(t);
  const mid = lerp(a, b, 0.5);
  const away = { x: mid.x - hub.x, y: mid.y - hub.y };
  const len = Math.hypot(away.x, away.y) || 1;
  const ctrl = { x: mid.x + (away.x / len) * 22, y: mid.y + (away.y / len) * 22 };
  const p0 = boundary(s, ctrl, 3);
  const p3 = boundary(t, ctrl, 3);
  return { p0, c1: lerp(p0, ctrl, 0.66), c2: lerp(p3, ctrl, 0.66), p3 };
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function routeEdges(spec: VisualizationSpec, plan: Plan, nodes: Record<string, LaidNode>, frames: LaidFrame[], width: number): LaidEdge[] {
  if (plan.routing === "none") return [];
  const out: LaidEdge[] = [];
  const nodeById = new Map<string, VisualNode>(spec.nodes.map((n) => [n.id, n]));
  const waves = edgeWaves(spec, plan);
  const all = Object.values(nodes);
  const hub = all.length ? { x: all.reduce((s, n) => s + n.x + n.w / 2, 0) / all.length, y: all.reduce((s, n) => s + n.y + n.h / 2, 0) / all.length } : { x: 0, y: 0 };

  const add = (key: string, from: string, to: string, curve: Curve, e: Partial<VisualEdge> & { emphasis: "normal" | "primary" }, wave: number, arrow: boolean, horizontal: boolean, targets: string[] = to ? [to] : []) => {
    const samples = cubicSamples(curve.p0, curve.c1, curve.c2, curve.p3);
    const length = lengthOf(samples);
    const dashed = e.relationship === "contrasts";
    const mid = samples[Math.floor(samples.length / 2)]!;
    out.push({
      key,
      from,
      to,
      targets,
      d: pathOf(curve.p0, curve.c1, curve.c2, curve.p3),
      samples,
      length,
      head: arrow && !dashed ? chevron(curve.p3, samples[samples.length - 3]!) : null,
      primary: e.emphasis === "primary",
      dashed,
      ...(e.label && !horizontal && length > 30 ? { label: { text: e.label, at: { x: mid.x + 8, y: mid.y } } } : {}),
      wave,
    });
  };

  if (plan.routing === "rail") {
    const ids = (plan.blocks[0] as { ids: string[] }).ids;
    ids.slice(1).forEach((id, i) => {
      const a = nodes[ids[i]!]!;
      const b = nodes[id]!;
      const p0 = { x: RAIL_X, y: a.y + a.h / 2 + 6 };
      const p3 = { x: RAIL_X, y: b.y + b.h / 2 - 6 };
      const e = spec.edges.find((x) => x.from === ids[i] && x.to === id);
      add(`rail-${i}`, ids[i]!, id, { p0, c1: lerp(p0, p3, 1 / 3), c2: lerp(p0, p3, 2 / 3), p3 }, { emphasis: e?.emphasis ?? (nodeById.get(id)?.emphasis === "primary" ? "primary" : "normal") }, i, false, false);
    });
    return out;
  }

  // A section of parallel members (no links among them) is one thing to the rest of the diagram:
  // connectors meet its frame, once, instead of fanning through its header to every card.
  const groupFrame = new Map<string, LaidFrame>();
  if (plan.routing === "flow") {
    for (const f of frames) {
      const ids = f.section.nodeIds;
      if (ids.length >= 2 && !spec.edges.some((e) => ids.includes(e.from) && ids.includes(e.to))) for (const id of ids) groupFrame.set(id, f);
    }
  }
  const merged = new Map<string, { from: string; to: string; s: Rect; t: Rect; e: VisualEdge; wave: number; targets: string[] }>();
  spec.edges.forEach((e) => {
    const fs = groupFrame.get(e.from);
    const ft = groupFrame.get(e.to);
    const s = fs && fs !== ft ? fs : nodes[e.from];
    const t = ft && ft !== fs ? ft : nodes[e.to];
    if (!s || !t) return;
    const from = fs && fs !== ft ? `frame:${fs.section.id}` : e.from;
    const to = ft && ft !== fs ? `frame:${ft.section.id}` : e.to;
    const key = `${from}->${to}`;
    const wave = waves.get(`${e.from}->${e.to}`) ?? 0;
    const prev = merged.get(key);
    if (prev) {
      prev.wave = Math.min(prev.wave, wave);
      if (!prev.e.label && e.label) prev.e = { ...prev.e, label: e.label };
      if (e.emphasis === "primary") prev.e = { ...prev.e, emphasis: "primary" };
      return;
    }
    merged.set(key, { from, to, s, t, e, wave, targets: ft && ft !== fs ? ft.section.nodeIds : [e.to] });
  });
  // Merging can leave gaps in the wave sequence; keep it dense so nothing waits on an empty wave.
  const transitionWave = waves.get("transition");
  const used = [...new Set([...[...merged.values()].map((m) => m.wave), ...(transitionWave !== undefined ? [transitionWave] : [])])].sort((a, b) => a - b);
  [...merged.values()].forEach((m, i) => {
    const { s, t, e } = m;
    const twoWay = merged.has(`${m.to}->${m.from}`);
    const curve = plan.routing === "radial" ? radialCurve(s, t, twoWay ? 7 : 0) : plan.routing === "ring" ? ringCurve(s, t, hub) : flowCurve(s, t, width);
    const horizontal = Math.abs(curve.p3.y - curve.p0.y) < 4;
    const undirected = spec.visualizationType === "concept_map" && e.relationship !== "causes" && e.relationship !== "feeds_into";
    add(`e${i}`, m.from, m.to, curve, e, used.indexOf(m.wave), !undirected, horizontal, m.targets);
  });
  placeLabels(out, Object.values(nodes), frames, width);

  // A transformation's two models, joined: the idea moves from Before to Now.
  if (spec.visualizationType === "transformation" && frames.length >= 2) {
    const [a, b] = frames;
    const p0 = { x: a!.x + a!.w / 2, y: a!.y + a!.h };
    const p3 = { x: b!.x + b!.w / 2, y: b!.y };
    const k = (p3.y - p0.y) * 0.5;
    add("transition", "", "", { p0, c1: { x: p0.x, y: p0.y + k }, c2: { x: p3.x, y: p3.y - k }, p3 }, { emphasis: "primary" }, Math.max(0, used.indexOf(transitionWave ?? 0)), true, false);
  }
  return out;
}

/**
 * Connector labels never sit on a card, a line, a frame edge or each other: each tries a few spots
 * beside its line and is left out if none is clear (the relationship still reads from the arrow).
 */
function placeLabels(edges: LaidEdge[], nodes: Rect[], frames: LaidFrame[], width: number) {
  const taken: Rect[] = [];
  const lines = edges.flatMap((e) => e.samples);
  const hits = (r: Rect) =>
    [...nodes, ...taken].some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) ||
    lines.some((p) => p.x > r.x - 2 && p.x < r.x + r.w + 2 && p.y > r.y && p.y < r.y + r.h) ||
    // Never across a frame's edge or over its header.
    frames.some((f) => [f.y, f.y + f.h].some((edgeY) => r.y < edgeY + 2 && r.y + r.h > edgeY - 2) || (r.y < f.header.y + f.header.h && r.y + r.h > f.header.y && r.x < f.header.x + f.header.w && r.x + r.w > f.header.x));
  for (const e of edges) {
    if (!e.label) continue;
    const w = Math.min(140, e.label.text.length * 6.3 + 6);
    const fits = (r: Rect) => r.x >= 0 && r.x + r.w <= width && !hits(r);
    // Midway first, then a third and two thirds along; right of the line, then left.
    const spot =
      [0.5, 0.36, 0.64]
        .map((t) => e.samples[Math.round((e.samples.length - 1) * t)]!)
        .flatMap((p) => [{ x: p.x + 8, y: p.y - 8, w, h: 16 }, { x: p.x - 8 - w, y: p.y - 8, w, h: 16 }])
        .find(fits) ?? null;
    if (spot) {
      taken.push(spot);
      e.label = { text: e.label.text, at: { x: spot.x, y: spot.y + 8 } };
    } else delete e.label;
  }
}

/**
 * The order the idea is demonstrated in: breadth-first from where it starts. A transformation
 * shows its Before model, crosses over, then shows Now; a cycle runs once around.
 */
function edgeWaves(spec: VisualizationSpec, plan: Plan): Map<string, number> {
  const waves = new Map<string, number>();
  if (plan.routing === "ring") {
    const ids = (plan.blocks[0] as { ids: string[] }).ids;
    ids.forEach((id, i) => waves.set(`${id}->${ids[(i + 1) % ids.length]}`, i));
    let next = ids.length;
    for (const e of spec.edges) if (!waves.has(`${e.from}->${e.to}`)) waves.set(`${e.from}->${e.to}`, next++);
    return waves;
  }
  const depthWaves = (ids: string[], offset: number): number => {
    const set = new Set(ids);
    const inner = spec.edges.filter((e) => set.has(e.from) && set.has(e.to));
    const depth = new Map<string, number>();
    const roots = ids.filter((id) => !inner.some((e) => e.to === id));
    const queue = (roots.length ? roots : ids.slice(0, 1)).map((id) => (depth.set(id, 0), id));
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of inner) if (e.from === id && !depth.has(e.to)) {
        depth.set(e.to, depth.get(id)! + 1);
        queue.push(e.to);
      }
    }
    let max = -1;
    for (const e of inner) {
      const w = offset + (depth.get(e.from) ?? 0);
      waves.set(`${e.from}->${e.to}`, w);
      max = Math.max(max, w);
    }
    return max;
  };
  if (spec.visualizationType === "transformation" && spec.sections.length >= 2) {
    const beforeEnd = depthWaves(spec.sections[0]!.nodeIds, 0);
    const transition = beforeEnd + 1;
    waves.set("transition", transition);
    const rest = spec.sections.slice(1).flatMap((s) => s.nodeIds);
    depthWaves(rest, transition + 1);
    for (const e of spec.edges) if (!waves.has(`${e.from}->${e.to}`)) waves.set(`${e.from}->${e.to}`, transition);
    return waves;
  }
  depthWaves(spec.nodes.map((n) => n.id), 0);
  return waves;
}
