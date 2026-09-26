import { type ReactNode } from "react";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import type { LayoutResult, PlacedNode } from "@thinketh/mindprint";
import { color, font } from "@/theme/tokens";
import type { MindNode } from "./model";

export type MindRegion = {
  layout: LayoutResult;
  /** Keyed by the layout's node id (e.g. "a:agent-memory" in a duo). */
  nodes: Map<string, MindNode>;
  /** Selected / spotlit node id in this region. */
  focusId?: string | null;
  /** Dim everything not related to the focus (selection, Spotlight). */
  dim?: boolean;
  /** Faint lines running off the canvas: the Mind is bigger than the view. */
  stubs?: boolean;
  /** Must match the fontSize the layout was computed with. */
  fontSize?: number;
};


/**
 * Draws one or more laid-out Minds. Layout (positions, labels, curves) comes
 * from @thinketh/mindprint and is already collision-checked; this only paints.
 * 2.5D is expressed through each node's depth: scale, opacity, edge weight.
 */
export function Mindprint({ width, height, regions, underlay, children }: { width: number; height: number; regions: MindRegion[]; underlay?: ReactNode; children?: ReactNode }) {
  if (width <= 0 || height <= 0) return null;
  // Two passes so anything drawn between the Minds (a transfer trace) sits under every label.
  return (
    <Svg width={width} height={height}>
      {regions.map((r, i) => (
        <Region key={i} region={r} pass="graph" />
      ))}
      {underlay}
      {regions.map((r, i) => (
        <Region key={`l${i}`} region={r} pass="labels" />
      ))}
      {children}
    </Svg>
  );
}

function Region({ region, pass }: { region: MindRegion; pass: "graph" | "labels" }) {
  const { layout, nodes, focusId, dim, stubs } = region;
  const fs = region.fontSize ?? 12;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const related = new Set<string>(focusId ? [focusId] : []);
  if (focusId) for (const e of layout.edges) if (e.from === focusId || e.to === focusId) related.add(e.from === focusId ? e.to : e.from);
  const faded = (id: string) => !!dim && !!focusId && !related.has(id);

  if (pass === "labels") return <Labels region={region} faded={faded} fs={fs} />;
  return (
    <G>
      {stubs ? <Stubs layout={layout} /> : null}
      {layout.edges
        .filter((e) => e.primary)
        .map((e) => {
          const lit = !!focusId && (e.from === focusId || e.to === focusId);
          const depth = Math.min(byId.get(e.from)?.depth ?? 1, byId.get(e.to)?.depth ?? 1);
          return (
            <Path
              key={`${e.from}-${e.to}`}
              d={`M${e.a.x},${e.a.y} Q${e.c.x},${e.c.y} ${e.b.x},${e.b.y}`}
              stroke={lit ? color.ink3 : "#D6D1CA"}
              strokeWidth={lit ? 1.1 : 0.6 + depth * 0.4}
              fill="none"
              opacity={faded(e.from) || faded(e.to) ? 0.25 : 0.55 + depth * 0.45}
            />
          );
        })}
      {layout.nodes.map((n) => (
        <Node key={n.id} n={n} mind={nodes.get(n.id)} focused={n.id === focusId} faded={faded(n.id)} />
      ))}
    </G>
  );
}

function Labels({ region, faded, fs }: { region: MindRegion; faded: (id: string) => boolean; fs: number }) {
  const { layout, nodes, focusId } = region;
  return (
    <G>
      {layout.labels
        .filter((l) => l.visible)
        .map((l) => {
          const mind = nodes.get(l.id);
          const focused = l.id === focusId;
          const changed = mind?.tone === "changed" || focused;
          const props = {
            x: l.x,
            y: l.y + fs,
            fontSize: fs,
            fontFamily: focused ? font.sansSemibold : font.sans,
          };
          return (
            <G key={`l-${l.id}`} opacity={faded(l.id) ? 0.3 : 1}>
              <SvgText {...props} fill={color.ground} stroke={color.ground} strokeWidth={3} strokeLinejoin="round">
                {l.text}
              </SvgText>
              <SvgText {...props} fill={changed ? color.coral : color.ink2}>
                {l.text}
              </SvgText>
            </G>
          );
        })}
    </G>
  );
}

function Node({ n, mind, focused, faded }: { n: PlacedNode; mind: MindNode | undefined; focused: boolean; faded: boolean }) {
  const tone = mind?.tone ?? "developing";
  const r = n.r * (0.82 + n.depth * 0.18);
  const opacity = faded ? 0.28 : 0.7 + n.depth * 0.3;
  if (focused) {
    // Figma 1:34: the selected concept gets a soft coral body and a ring.
    return (
      <G opacity={opacity}>
        <Circle cx={n.x} cy={n.y} r={r + 7} fill={color.coralTint} />
        <Circle cx={n.x} cy={n.y} r={r + 1} fill={tone === "developing" ? color.panel : color.coral} stroke={color.coral} strokeWidth={1.5} />
      </G>
    );
  }
  if (tone === "changed") return <Circle cx={n.x} cy={n.y} r={r} fill={color.coral} opacity={opacity} />;
  if (tone === "strong") return <Circle cx={n.x} cy={n.y} r={r} fill={color.ink} opacity={opacity} />;
  return <Circle cx={n.x} cy={n.y} r={Math.max(r - 1.5, 4)} fill={color.ground} stroke={color.ink3} strokeWidth={1.2} opacity={opacity} />;
}

/** A few faint lines from the outermost concepts off the edge of the view. */
function Stubs({ layout }: { layout: LayoutResult }) {
  const cx = layout.nodes.reduce((s, n) => s + n.x, 0) / Math.max(layout.nodes.length, 1);
  const cy = layout.nodes.reduce((s, n) => s + n.y, 0) / Math.max(layout.nodes.length, 1);
  const outer = [...layout.nodes].sort((a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy) || a.id.localeCompare(b.id)).slice(0, 3);
  return (
    <G>
      {outer.map((n) => {
        const d = Math.hypot(n.x - cx, n.y - cy) || 1;
        const ux = (n.x - cx) / d, uy = (n.y - cy) / d;
        // Run to the edge of this Mind's own region, never into another's.
        const b = layout.bounds;
        const tx = ux > 0 ? (b.x + b.w - n.x) / ux : ux < 0 ? (b.x - n.x) / ux : Infinity;
        const ty = uy > 0 ? (b.y + b.h - n.y) / uy : uy < 0 ? (b.y - n.y) / uy : Infinity;
        const len = Math.min(tx, ty, Math.max(b.w, b.h) * 0.45);
        if (len < n.r + 12) return null;
        return <Line key={`s-${n.id}`} x1={n.x + ux * (n.r + 4)} y1={n.y + uy * (n.r + 4)} x2={n.x + ux * len} y2={n.y + uy * len} stroke="#DDD8D1" strokeWidth={0.8} />;
      })}
    </G>
  );
}
