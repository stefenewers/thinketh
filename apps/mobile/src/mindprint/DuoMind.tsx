import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { Circle, G, Path } from "react-native-svg";
import type { ConceptEdge, MindSnapshot } from "@thinketh/contracts";
import { layoutDuo } from "@thinketh/mindprint";
import { T } from "@/components/Text";
import { useReducedMotion } from "@/lib/hooks";
import { color, font } from "@/theme/tokens";
import { Mindprint } from "./Mindprint";
import { layoutEdges, nodesFromSnapshot } from "./model";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const NAME_H = 34;
/** Figma's two-Mind labels run a touch smaller than the single Mind's. */
const DUO_FONT = 11;

export type DuoTrace = {
  conceptId: string;
  /** Which side the knowledge leaves from (the teacher's). */
  from: "left" | "right";
  /** "teaching": a live pulse along the corridor. "moved": drawn once, then a ring on the learner. */
  mode: "teaching" | "moved";
};

/**
 * Two Minds side by side (Figma 1:94 onward): the same semantic composition
 * in each, so a concept sits in the same place in both and a transfer reads
 * as one short coral trace between them.
 */
export function DuoMind({
  left,
  right,
  edges,
  width,
  height,
  focusConceptId,
  changed,
  trace,
  muse,
  settled,
  keyConcepts,
}: {
  left: MindSnapshot;
  right: MindSnapshot;
  edges: ConceptEdge[];
  width: number;
  height: number;
  focusConceptId?: string | null;
  /** Concepts shown as changed, per participant id. */
  changed?: Record<string, string[]>;
  trace?: DuoTrace | null;
  /** Show Muse's presence between the Minds. */
  muse?: boolean;
  /** The trace already happened: draw it complete, without replaying the animation. */
  settled?: boolean;
  /** Concepts whose names must show (what the room is about). */
  keyConcepts?: string[];
}) {
  const graphH = height - NAME_H;
  const duo = useMemo(() => {
    const nodes = nodesFromSnapshot(left, new Set());
    const required = [...new Set([...(focusConceptId ? [focusConceptId] : []), ...(keyConcepts ?? [])])];
    return layoutDuo({
      nodes,
      edges: layoutEdges(edges),
      frame: { x: 0, y: 0, w: width, h: graphH },
      opts: { lod: "normal", fontSize: DUO_FONT, focusId: focusConceptId ?? null, requiredLabels: required },
    });
  }, [left, edges, width, graphH, focusConceptId, keyConcepts]);

  const regionNodes = (s: MindSnapshot, prefix: string) =>
    new Map(nodesFromSnapshot(s, new Set(changed?.[s.userId] ?? [])).map((n) => [`${prefix}:${n.id}`, { ...n, id: `${prefix}:${n.id}` }]));

  const route = trace ? duo.transferRoute(trace.conceptId, trace.from) : null;
  const focus = (p: string) => (focusConceptId ? `${p}:${focusConceptId}` : null);

  return (
    <View style={{ width, height }}>
      <View style={styles.names}>
        <NameOver x={duo.left.bounds.x + duo.left.bounds.w / 2} name={left.displayName} />
        <NameOver x={duo.right.bounds.x + duo.right.bounds.w / 2} name={right.displayName} />
      </View>
      <View style={{ position: "absolute", top: NAME_H, left: 0 }}>
        <Mindprint
          width={width}
          height={graphH}
          regions={[
            { layout: duo.left, nodes: regionNodes(left, "a"), focusId: focus("a"), dim: !!focusConceptId, stubs: true, fontSize: DUO_FONT },
            { layout: duo.right, nodes: regionNodes(right, "b"), focusId: focus("b"), dim: !!focusConceptId, stubs: true, fontSize: DUO_FONT },
          ]}
          underlay={route && trace ? <Trace route={route} mode={trace.mode} layer="line" still={settled} /> : null}
        >
          {route && trace ? <Trace route={route} mode={trace.mode} layer="marks" still={settled} /> : null}
          {muse ? <MuseMark x={duo.band.x + duo.band.w / 2} y={graphH - 18} /> : null}
        </Mindprint>
      </View>
    </View>
  );
}

function NameOver({ x, name }: { x: number; name: string }) {
  return (
    <View style={[styles.name, { left: x - 70 }]}>
      <T style={{ fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink, textAlign: "center" }} numberOfLines={1}>
        {name}
      </T>
    </View>
  );
}

/** The coral trace: knowledge travelling from teacher to learner. */
function Trace({
  route,
  mode,
  layer,
  still,
}: {
  route: { a: { x: number; y: number }; c1: { x: number; y: number }; c2: { x: number; y: number }; b: { x: number; y: number } };
  mode: DuoTrace["mode"];
  /** The line goes under labels; the travelling dot and the ring go over them. */
  layer: "line" | "marks";
  still?: boolean;
}) {
  const reduced = useReducedMotion() || !!still;
  const t = useSharedValue(reduced ? 1 : 0);
  const ring = useSharedValue(reduced ? 1 : 0);
  const { a, c1, c2, b } = route;
  const d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  const len = Math.hypot(b.x - a.x, b.y - a.y) * 1.15 + 20;

  useEffect(() => {
    if (reduced) return;
    t.set(0);
    ring.set(0);
    if (mode === "teaching") {
      t.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }), -1, false));
    } else {
      t.set(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
      ring.set(withDelay(1200, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) })));
    }
  }, [mode, reduced, ring, t]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: mode === "moved" ? len * (1 - t.get()) : 0 }));
  const dotProps = useAnimatedProps(() => {
    const u = t.get();
    const v = 1 - u;
    return {
      cx: v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * b.x,
      cy: v * v * v * a.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * b.y,
      opacity: mode === "teaching" ? 1 : 1 - u,
    };
  });
  const ringProps = useAnimatedProps(() => ({ r: 4 + ring.get() * 10, opacity: ring.get() }));

  if (layer === "line") {
    // Teaching: a dashed, lighter route (in motion, not arrived). Moved: drawn solid, once.
    return (
      <AnimatedPath
        d={d}
        stroke={color.coral}
        strokeOpacity={mode === "moved" ? 1 : 0.55}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={mode === "moved" ? [len, len] : [4, 6]}
        animatedProps={lineProps}
      />
    );
  }
  return (
    <G>
      <AnimatedCircle r={mode === "teaching" ? 8 : 5} fill={color.coral} animatedProps={dotProps} />
      {mode === "moved" ? <AnimatedCircle cx={b.x} cy={b.y} fill={color.canvas} fillOpacity={0} stroke={color.coral} strokeWidth={1.5} animatedProps={ringProps} /> : null}
    </G>
  );
}

/** Muse's presence in the room: a small, quiet mark (Figma 1:142). */
function MuseMark({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={14} fill={color.ink} />
      <Path d={`M${x - 5},${y + 4} L${x - 5},${y - 4} L${x},${y + 1} L${x + 5},${y - 4} L${x + 5},${y + 4}`} stroke={color.onInk} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
    </G>
  );
}

const styles = StyleSheet.create({
  names: { height: NAME_H, flexDirection: "row" },
  name: { position: "absolute", top: 0, width: 140, alignItems: "center" },
});
